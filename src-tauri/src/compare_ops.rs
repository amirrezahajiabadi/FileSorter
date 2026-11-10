//! Two-folder comparison by relative path and SHA-256.
//!
//! "Did this backup actually copy everything?" is a checksum question, not a
//! size question: a file can be the same length and still differ. Both trees
//! are walked once, every regular file is hashed, and the two maps are joined
//! on the path relative to each root:
//!
//! * same relative path, same hash  → identical
//! * same relative path, other hash → changed (this is the dangerous group)
//! * only on one side               → left/right only
//! * different path, same hash      → moved or renamed
//!
//! Nothing is written, moved or deleted here: the report is read-only, which is
//! why it needs no undo journal.

use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::time::Instant;

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::walk::StopFlag;

#[derive(Deserialize, Clone, Debug)]
pub struct CompareRequest {
    pub left: String,
    pub right: String,
    #[serde(default)]
    pub include_hidden: bool,
    /// Cap for each list in the report; counts stay exact either way.
    #[serde(default)]
    pub list_limit: Option<usize>,
}

#[derive(Serialize, Clone, Debug)]
pub struct CompareSide {
    pub path: String,
    pub files: u64,
    pub bytes: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct CompareFile {
    pub rel: String,
    pub size: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct ComparePair {
    pub rel: String,
    pub left_size: u64,
    pub right_size: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct CompareMoved {
    pub left_rel: String,
    pub right_rel: String,
    pub size: u64,
}

#[derive(Serialize, Clone, Debug)]
pub struct CompareReport {
    pub left: CompareSide,
    pub right: CompareSide,
    pub identical: u64,
    pub identical_bytes: u64,
    /// Exact totals. The lists below are capped, so these stay truthful when a
    /// tree differs in more files than the panel is willing to render.
    pub changed_count: u64,
    pub only_left_count: u64,
    pub only_right_count: u64,
    pub moved_count: u64,
    pub changed: Vec<ComparePair>,
    pub only_left: Vec<CompareFile>,
    pub only_right: Vec<CompareFile>,
    pub moved: Vec<CompareMoved>,
    /// True when a list was cut at `list_limit`, so the panel says so instead
    /// of presenting a partial list as the whole answer.
    pub truncated: bool,
    pub elapsed_ms: u64,
}

const DEFAULT_LIST_LIMIT: usize = 1_000;

struct SideEntry {
    display_rel: String,
    size: u64,
    hash: String,
}

fn hash_file(path: &Path) -> std::io::Result<String> {
    let mut file = fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 128 * 1024];
    loop {
        let n = file.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn rel_slash(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

/// Walk one side and hash every regular file. Keys are lower-cased relative
/// paths because Windows treats `Docs/File.txt` and `docs/file.txt` as one
/// path; the display value keeps the real case.
fn collect_side(
    root: &Path,
    include_hidden: bool,
    stop: &StopFlag,
    on_file: &mut dyn FnMut(u64),
) -> (HashMap<String, SideEntry>, u64, u64) {
    let mut map = HashMap::new();
    let mut files = 0u64;
    let mut bytes = 0u64;
    for (path, size) in crate::search_ops::walk_files(root, include_hidden) {
        if stop.is_stopped() {
            break;
        }
        // A file that vanished mid-walk, or that we may not read, is skipped:
        // counting it as "changed" would invent a difference that is not there.
        let Ok(hash) = hash_file(&path) else { continue };
        files += 1;
        bytes += size;
        let display_rel = rel_slash(root, &path);
        map.insert(
            display_rel.to_lowercase(),
            SideEntry { display_rel, size, hash },
        );
        on_file(files);
    }
    (map, files, bytes)
}

pub fn compare(
    req: &CompareRequest,
    stop: &StopFlag,
    on_progress: &mut dyn FnMut(&str, u64),
) -> Result<CompareReport, String> {
    let started = Instant::now();
    let left_root = Path::new(&req.left);
    let right_root = Path::new(&req.right);
    if !left_root.is_dir() {
        return Err("the first folder is not available".into());
    }
    if !right_root.is_dir() {
        return Err("the second folder is not available".into());
    }

    let left_abs = left_root.canonicalize().map_err(|e| e.to_string())?;
    let right_abs = right_root.canonicalize().map_err(|e| e.to_string())?;
    if left_abs == right_abs {
        return Err("choose two different folders to compare".into());
    }
    // One root inside the other means the walk visits the same files twice and
    // every nested file looks "moved"; refusing is clearer than a report that
    // looks broken.
    if left_abs.starts_with(&right_abs) || right_abs.starts_with(&left_abs) {
        return Err("the folders overlap: pick two separate trees".into());
    }

    let (left_map, left_files, left_bytes) =
        collect_side(&left_abs, req.include_hidden, stop, &mut |n| on_progress("left", n));
    let (right_map, right_files, right_bytes) =
        collect_side(&right_abs, req.include_hidden, stop, &mut |n| on_progress("right", n));

    let limit = req.list_limit.unwrap_or(DEFAULT_LIST_LIMIT).clamp(1, 20_000);
    let mut truncated = false;

    let mut identical = 0u64;
    let mut identical_bytes = 0u64;
    let mut changed_count = 0u64;
    let mut only_left_count = 0u64;
    let mut only_right_count = 0u64;
    let mut moved_count = 0u64;
    let mut changed: Vec<ComparePair> = Vec::new();
    let mut only_left: Vec<CompareFile> = Vec::new();
    let mut moved: Vec<CompareMoved> = Vec::new();

    // Right-side files with no counterpart at the same relative path, grouped
    // by (size, hash): an entry here can still turn out to be a renamed file.
    let mut unclaimed_right: HashMap<(u64, String), Vec<(String, u64)>> = HashMap::new();
    for (key, right) in right_map.iter() {
        if !left_map.contains_key(key) {
            unclaimed_right
                .entry((right.size, right.hash.clone()))
                .or_default()
                .push((right.display_rel.clone(), right.size));
        }
    }

    let mut keys: Vec<&String> = left_map.keys().collect();
    keys.sort();
    for key in keys {
        let left = &left_map[key];
        match right_map.get(key) {
            Some(right) if right.hash == left.hash => {
                identical += 1;
                identical_bytes += left.size;
            }
            Some(right) => {
                changed_count += 1;
                if changed.len() < limit {
                    changed.push(ComparePair {
                        rel: left.display_rel.clone(),
                        left_size: left.size,
                        right_size: right.size,
                    });
                } else {
                    truncated = true;
                }
            }
            None => {
                let bucket = (left.size, left.hash.clone());
                let paired = match unclaimed_right.get_mut(&bucket) {
                    Some(candidates) => {
                        let popped = candidates.pop();
                        if candidates.is_empty() {
                            unclaimed_right.remove(&bucket);
                        }
                        popped
                    }
                    None => None,
                };
                match paired {
                    Some((right_rel, size)) => {
                        moved_count += 1;
                        if moved.len() < limit {
                            moved.push(CompareMoved {
                                left_rel: left.display_rel.clone(),
                                right_rel,
                                size,
                            });
                        } else {
                            truncated = true;
                        }
                    }
                    None => {
                        only_left_count += 1;
                        if only_left.len() < limit {
                            only_left.push(CompareFile {
                                rel: left.display_rel.clone(),
                                size: left.size,
                            });
                        } else {
                            truncated = true;
                        }
                    }
                }
            }
        }
    }

    let mut only_right: Vec<CompareFile> = Vec::new();
    for ((_, _), candidates) in unclaimed_right.iter() {
        for (rel, size) in candidates {
            only_right_count += 1;
            if only_right.len() < limit {
                only_right.push(CompareFile { rel: rel.clone(), size: *size });
            } else {
                truncated = true;
            }
        }
    }

    changed.sort_by(|a, b| a.rel.cmp(&b.rel));
    only_left.sort_by(|a, b| a.rel.cmp(&b.rel));
    only_right.sort_by(|a, b| a.rel.cmp(&b.rel));
    moved.sort_by(|a, b| a.left_rel.cmp(&b.left_rel));

    Ok(CompareReport {
        left: CompareSide {
            path: left_abs.to_string_lossy().into_owned(),
            files: left_files,
            bytes: left_bytes,
        },
        right: CompareSide {
            path: right_abs.to_string_lossy().into_owned(),
            files: right_files,
            bytes: right_bytes,
        },
        identical,
        identical_bytes,
        changed_count,
        only_left_count,
        only_right_count,
        moved_count,
        changed,
        only_left,
        only_right,
        moved,
        truncated,
        elapsed_ms: started.elapsed().as_millis() as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make(files: &[(&str, &[u8])]) -> tempfile::TempDir {
        let base = tempfile::tempdir().unwrap();
        for (rel, data) in files {
            let p = base.path().join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(&p, data).unwrap();
        }
        base
    }

    fn request(left: &Path, right: &Path) -> CompareRequest {
        CompareRequest {
            left: left.to_string_lossy().into_owned(),
            right: right.to_string_lossy().into_owned(),
            include_hidden: false,
            list_limit: None,
        }
    }

    #[test]
    fn classifies_identical_changed_one_sided_and_moved() {
        let left = make(&[
            ("keep/same.txt", b"same"),
            ("keep/edited.txt", b"aaaa"),
            ("only-left.txt", b"left"),
            ("old-name.txt", b"renamed content"),
        ]);
        let right = make(&[
            ("keep/same.txt", b"same"),
            ("keep/edited.txt", b"bbbb"),
            ("only-right.txt", b"right"),
            ("new-name.txt", b"renamed content"),
        ]);

        let report =
            compare(&request(left.path(), right.path()), &StopFlag::new(), &mut |_, _| {}).unwrap();
        assert_eq!(report.identical, 1);
        assert_eq!(report.identical_bytes, 4);
        assert_eq!(report.changed.len(), 1);
        assert_eq!(report.changed_count, 1);
        assert_eq!(report.changed[0].rel, "keep/edited.txt");
        assert_eq!(report.changed[0].left_size, 4);
        assert_eq!(report.only_left.len(), 1);
        assert_eq!(report.only_left[0].rel, "only-left.txt");
        assert_eq!(report.only_right.len(), 1);
        assert_eq!(report.only_right[0].rel, "only-right.txt");
        assert_eq!(report.only_right[0].size, 5);
        assert_eq!(report.moved.len(), 1);
        assert_eq!(report.moved[0].left_rel, "old-name.txt");
        assert_eq!(report.moved[0].right_rel, "new-name.txt");
        assert_eq!(report.left.files, 4);
        assert_eq!(report.right.files, 4);
        assert!(!report.truncated);
    }

    #[test]
    fn one_sided_files_are_listed_when_nothing_matches_them() {
        let left = make(&[("a.txt", b"aaaa")]);
        let right = make(&[("b.txt", b"zzzz")]);
        let report =
            compare(&request(left.path(), right.path()), &StopFlag::new(), &mut |_, _| {}).unwrap();
        assert_eq!(report.identical, 0);
        assert_eq!(report.only_left.len(), 1);
        assert_eq!(report.only_left[0].rel, "a.txt");
        assert_eq!(report.only_right.len(), 1);
        assert_eq!(report.only_right[0].rel, "b.txt");
        assert_eq!(report.only_right[0].size, 4);
        assert!(report.moved.is_empty());
    }

    #[test]
    fn hidden_files_are_skipped_unless_requested() {
        let left = make(&[("visible.txt", b"1"), (".hidden.txt", b"2")]);
        let right = make(&[("visible.txt", b"1"), (".hidden.txt", b"3")]);
        let report =
            compare(&request(left.path(), right.path()), &StopFlag::new(), &mut |_, _| {}).unwrap();
        assert_eq!(report.identical, 1);
        assert!(report.changed.is_empty());

        let mut req = request(left.path(), right.path());
        req.include_hidden = true;
        let report = compare(&req, &StopFlag::new(), &mut |_, _| {}).unwrap();
        assert_eq!(report.identical, 1);
        assert_eq!(report.changed.len(), 1);
    }

    #[test]
    fn same_size_different_bytes_is_changed_not_identical() {
        let left = make(&[("x.bin", &[1u8, 2, 3])]);
        let right = make(&[("x.bin", &[1u8, 2, 4])]);
        let report =
            compare(&request(left.path(), right.path()), &StopFlag::new(), &mut |_, _| {}).unwrap();
        assert_eq!(report.identical, 0);
        assert_eq!(report.changed.len(), 1);
        assert_eq!(report.changed[0].left_size, 3);
        assert_eq!(report.changed[0].right_size, 3);
    }

    #[test]
    fn identical_or_nested_roots_are_refused() {
        let left = make(&[("a.txt", b"1")]);
        assert!(compare(&request(left.path(), left.path()), &StopFlag::new(), &mut |_, _| {}).is_err());

        let nested = left.path().join("inner");
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("b.txt"), b"2").unwrap();
        let err =
            compare(&request(left.path(), &nested), &StopFlag::new(), &mut |_, _| {}).unwrap_err();
        assert!(err.contains("overlap"), "{err}");
    }

    #[test]
    fn list_limit_truncates_and_flags_it() {
        let left = make(&[("a.txt", b"1"), ("b.txt", b"2"), ("c.txt", b"3")]);
        let right = make(&[]);
        let mut req = request(left.path(), right.path());
        req.list_limit = Some(2);
        let report = compare(&req, &StopFlag::new(), &mut |_, _| {}).unwrap();
        assert_eq!(report.only_left.len(), 2);
        // The list is capped but the total still counts all three files.
        assert_eq!(report.only_left_count, 3);
        assert!(report.truncated);
    }
}
