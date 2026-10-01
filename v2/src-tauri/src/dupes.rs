//! Duplicate detection: a three-stage filter so full hashing stays rare.
//!
//! 1. group by exact size (cheap, from the walk),
//! 2. hash the first [`HEAD_LEN`] bytes of every size-collision candidate,
//! 3. full SHA-256 only for files whose head hashes collide.
//!
//! Results are keyed by the full hash; within each group the oldest mtime is
//! flagged as the suggested keeper (v1 policy). A JSON cache in the data dir
//! remembers hashes by (path, mtime_millis, size) so repeat scans only hash
//! new or changed files.

use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};

/// Bytes hashed in the cheap first pass.
pub const HEAD_LEN: usize = 64 * 1024;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct DupFile {
    pub path: PathBuf,
    pub size: u64,
    /// Last-modified time in milliseconds since the Unix epoch.
    pub modified: i64,
    /// True for the oldest file in the group (the suggested keeper).
    pub is_keeper: bool,
}

#[derive(serde::Serialize, Clone)]
pub struct DuplicateGroup {
    pub hash: String,
    pub size: u64,
    /// Combined size of the redundant copies (all files minus one keeper).
    pub wasted: u64,
    pub files: Vec<DupFile>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct CacheEntry {
    mtime: i64,
    size: u64,
    head: String,
    #[serde(default)]
    full: Option<String>,
}

#[derive(Default)]
pub struct HashCache(HashMap<PathBuf, CacheEntry>);

impl HashCache {
    pub fn load(path: &Path) -> Self {
        let map = fs::read_to_string(path)
            .ok()
            .and_then(|text| serde_json::from_str::<HashMap<PathBuf, CacheEntry>>(&text).ok())
            .unwrap_or_default();
        Self(map)
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        }
        let json = serde_json::to_string(&self.0).map_err(|e| e.to_string())?;
        let tmp = path.with_extension("json.tmp");
        fs::write(&tmp, json).map_err(|e| e.to_string())?;
        fs::rename(&tmp, path).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn valid_cached(&self, path: &Path, mtime: i64, size: u64, full_needed: bool) -> Option<String> {
        let entry = self.0.get(path)?;
        if entry.mtime != mtime || entry.size != size {
            return None;
        }
        if full_needed {
            entry.full.clone()
        } else {
            Some(entry.head.clone())
        }
    }

    fn store(&mut self, path: PathBuf, mtime: i64, size: u64, head: String, full: Option<String>) {
        self.0.insert(path, CacheEntry { mtime, size, head, full });
    }
}

fn mtime_millis(meta: &fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn hash_head(path: &Path, meta: &fs::Metadata) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut remaining = HEAD_LEN.min(meta.len() as usize);
    let mut buf = [0u8; 64 * 1024];
    while remaining > 0 {
        let want = remaining.min(buf.len());
        let n = file.read(&mut buf[..want]).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        remaining -= n;
    }
    Ok(hex(&hasher.finalize()))
}

fn hash_full(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 256 * 1024];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex(&hasher.finalize()))
}

fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push_str(&format!("{:02x}", b));
    }
    out
}

/// Run the full pipeline over the walked files. `progress` fires after each
/// parallel hashing wave with the number of files hashed so far. Returns
/// duplicate groups sorted by wasted bytes (descending) and the cache to persist.
pub fn find_duplicates<F>(
    files: &[(PathBuf, u64)],
    mut cache: HashCache,
    cache_path: &Path,
    mut progress: F,
) -> Result<(Vec<DuplicateGroup>, HashCache), String>
where
    F: FnMut(usize),
{
    // Stage 1: group by size.
    let mut by_size: BTreeMap<u64, Vec<PathBuf>> = BTreeMap::new();
    for (path, size) in files {
        by_size.entry(*size).or_default().push(path.clone());
    }
    let candidates: Vec<(PathBuf, u64)> = by_size
        .into_iter()
        .filter(|(_, group)| group.len() > 1)
        .flat_map(|(size, group)| group.into_iter().map(move |p| (p, size)))
        .collect();

    // Stage 2: head hashes (parallel, cache-aware).
    let mut done = 0usize;
    let mut heads: Vec<(PathBuf, u64, i64, String)> = Vec::new();
    for chunk in candidates.chunks(256) {
        let results: Vec<Option<_>> = chunk
            .iter()
            .map(|(path, size)| -> Option<(PathBuf, u64, i64, String)> {
                let meta = fs::metadata(path).ok()?;
                let mtime = mtime_millis(&meta);
                if let Some(head) = cache.valid_cached(path, mtime, *size, false) {
                    return Some((path.clone(), *size, mtime, head));
                }
                let head = hash_head(path, &meta).ok()?;
                cache.store(path.clone(), mtime, *size, head.clone(), None);
                Some((path.clone(), *size, mtime, head))
            })
            .collect();
        for r in results.into_iter().flatten() {
            heads.push(r);
        }
        done += chunk.len();
        progress(done);
    }

    // Stage 3: full hashes only where head hashes collide.
    type HeadKey = (u64, String);
    let mut by_head: BTreeMap<HeadKey, Vec<(PathBuf, u64, i64)>> = BTreeMap::new();
    for (path, size, mtime, head) in heads {
        by_head.entry((size, head)).or_default().push((path, size, mtime));
    }
    let mut full_needed: Vec<(u64, String)> = by_head
        .iter()
        .filter(|(_, group)| group.len() > 1)
        .map(|(key, _)| key.clone())
        .collect();
    full_needed.sort_by_key(|k| k.0); // smallest first: early progress on cheap files

    for (size, head) in &full_needed {
        let paths = by_head.get(&(*size, head.clone())).unwrap().clone();
        for (path, size, mtime) in paths {
            if let Some(full) = cache.valid_cached(&path, mtime, size, true) {
                cache.store(path.clone(), mtime, size, head.clone(), Some(full));
                continue;
            }
            if let Ok(full) = hash_full(&path) {
                cache.store(path.clone(), mtime, size, head.clone(), Some(full));
            }
        }
        progress(done);
    }

    // Assemble groups keyed by full hash, straight from the cache.
    let mut groups: HashMap<String, Vec<DupFile>> = HashMap::new();
    let mut sizes: HashMap<String, u64> = HashMap::new();
    for (path, entry) in &cache.0 {
        if let Some(full) = &entry.full {
            groups.entry(full.clone()).or_default().push(DupFile {
                path: path.clone(),
                size: entry.size,
                modified: entry.mtime,
                is_keeper: false,
            });
            sizes.insert(full.clone(), entry.size);
        }
    }
    let mut result: Vec<DuplicateGroup> = groups
        .into_iter()
        .filter(|(_, files)| files.len() > 1)
        .map(|(hash, mut files)| {
            files.sort_by_key(|f| f.modified); // oldest first
            let size = sizes.get(&hash).copied().unwrap_or(0);
            for (i, f) in files.iter_mut().enumerate() {
                f.is_keeper = i == 0;
            }
            let wasted = size * (files.len() as u64 - 1);
            DuplicateGroup { hash, size, wasted, files }
        })
        .collect();
    result.sort_by(|a, b| b.wasted.cmp(&a.wasted).then(b.size.cmp(&a.size)));

    cache.save(cache_path)?;
    Ok((result, cache))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, name: &str, data: &[u8]) -> PathBuf {
        let p = dir.join(name);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, data).unwrap();
        p
    }

    #[test]
    fn detects_identical_contents_across_names() {
        let tmp = tempfile::tempdir().unwrap();
        let a = write(tmp.path(), "a.bin", b"same content here");
        let b = write(tmp.path(), "sub/b.bin", b"same content here");
        let c = write(tmp.path(), "c.bin", b"different");
        let files = vec![(a, 17), (b, 17), (c, 9)];
        let cache_path = tmp.path().join("cache.json");
        let (groups, _) = find_duplicates(&files, HashCache::default(), &cache_path, |_| {}).unwrap();
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].files.len(), 2);
        assert_eq!(groups[0].wasted, 17);
        assert!(groups[0].files[0].is_keeper);
        assert!(!groups[0].files[1].is_keeper);
    }

    #[test]
    fn cache_hit_skips_rehashing() {
        let tmp = tempfile::tempdir().unwrap();
        let a = write(tmp.path(), "a.bin", b"payload");
        let b = write(tmp.path(), "b.bin", b"payload");
        let files = vec![(a.clone(), 7), (b.clone(), 7)];
        let cache_path = tmp.path().join("cache.json");
        let (_, cache) = find_duplicates(&files, HashCache::default(), &cache_path, |_| {}).unwrap();

        // Same files again → loaded cache must still find the group.
        let (groups, _) = find_duplicates(&files, cache, &cache_path, |_| {}).unwrap();
        assert_eq!(groups.len(), 1);

        // Change one file → no longer duplicates.
        fs::write(&b, b"changed").unwrap();
        let (groups, _) = find_duplicates(&files, HashCache::load(&cache_path), &cache_path, |_| {}).unwrap();
        assert!(groups.is_empty());
    }

    #[test]
    fn different_sizes_never_reach_hashing() {
        let tmp = tempfile::tempdir().unwrap();
        let a = write(tmp.path(), "a.txt", b"short");
        let b = write(tmp.path(), "b.txt", b"longer text");
        let files = vec![(a, 5), (b, 11)];
        let (groups, _) = find_duplicates(&files, HashCache::default(), &tempfile::tempdir().unwrap().path().join("c.json"), |_| {}).unwrap();
        assert!(groups.is_empty());
    }
}
