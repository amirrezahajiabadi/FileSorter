//! Crash-safe undo journal.
//!
//! Each sort/quarantine run writes `undo/<op_id>-<timestamp>-<seq>.json` into
//! the app data dir. Entries are appended to disk as the run progresses (every
//! few hundred moves and once at the end), so a crash mid-run leaves a journal
//! that still contains every completed move. `undo_last` replays the newest
//! journal in reverse, renaming every file back to its original path; entries
//! it could not restore stay in the journal for the next attempt.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::categories::data_dir;

/// One completed move.
#[derive(Serialize, Deserialize, Clone)]
pub struct MovedFile {
    /// Where the file lived before the operation (absolute).
    pub original: PathBuf,
    /// Where the operation put it (absolute).
    pub moved_to: PathBuf,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct UndoJournal {
    pub op_id: u64,
    /// Sort output dir of the run (informational; replay uses per-file paths).
    pub output_dir: PathBuf,
    pub files: Vec<MovedFile>,
    /// Empty folders and zero-byte files an extras cleanup removed. They hold
    /// no bytes, so restoring one only means recreating the path.
    #[serde(default)]
    pub removed_empty: Vec<RemovedEmpty>,
    /// `sort`, `quarantine` or `extras`. Defaulted so journals written by an
    /// older build still parse and undo.
    #[serde(default)]
    pub kind: String,
}

/// One path that an empty/zero-byte cleanup removed.
#[derive(Serialize, Deserialize, Clone)]
pub struct RemovedEmpty {
    pub path: PathBuf,
    pub is_dir: bool,
}

pub fn undo_dir() -> PathBuf {
    data_dir().join("undo")
}

/// Disambiguates journals created in the same millisecond.
static OP_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn next_op_id() -> u64 {
    fs::read_dir(undo_dir())
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter_map(|e| {
                    e.file_name().to_string_lossy().split('-').next()?.parse::<u64>().ok()
                })
                .max()
                .unwrap_or(0)
        })
        .unwrap_or(0)
        + 1
}

pub fn new_journal_path() -> PathBuf {
    let id = next_op_id();
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    // Two operations can start in the same millisecond (a manual sort racing
    // a scheduled one); without a unique suffix the second journal overwrote
    // the first, permanently losing that operation's undo record.
    for _ in 0..1000 {
        let seq = OP_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let candidate = undo_dir().join(format!("{:06}-{}-{:04}.json", id, ts, seq % 10_000));
        if !candidate.exists() {
            return candidate;
        }
    }
    undo_dir().join(format!("{:06}-{}-x.json", id, ts))
}

impl UndoJournal {
    pub fn new(output_dir: PathBuf) -> Self {
        Self {
            op_id: 0,
            output_dir,
            files: Vec::new(),
            removed_empty: Vec::new(),
            kind: String::new(),
        }
    }

    pub fn push(&mut self, f: MovedFile) {
        self.files.push(f);
    }

    pub fn is_empty(&self) -> bool {
        self.files.is_empty()
    }
}

/// Atomically persist a completed journal.
pub fn append(path: &Path, journal: &UndoJournal) -> Result<(), String> {
    let mut j = journal.clone();
    let op_id = path
        .file_name()
        .and_then(|n| n.to_string_lossy().split('-').next().map(String::from))
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(0);
    j.op_id = op_id;
    let json = serde_json::to_string(&j).map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    Ok(())
}

/// Newest journal first.
pub fn list_journals() -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = fs::read_dir(undo_dir())
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .filter(|p| p.extension().map(|x| x == "json").unwrap_or(false))
                .collect()
        })
        .unwrap_or_default();
    paths.sort();
    paths.reverse();
    paths
}

#[derive(Serialize)]
pub struct UndoReport {
    pub restored: u64,
    /// Empty folders / zero-byte files recreated by this undo.
    pub restored_empty: u64,
    pub skipped: u64,
    pub skipped_examples: Vec<String>,
    pub op_id: u64,
}

/// One row of the operation history, newest first.
#[derive(Serialize)]
pub struct HistoryEntry {
    pub op_id: u64,
    pub timestamp_ms: u64,
    pub files: u64,
    pub bytes: u64,
    pub kind: String,
    pub empty_entries: u64,
}

/// The journal file name carries the id and the creation timestamp:
/// `<op_id>-<unix_ms>-<seq>.json`.
fn parse_journal_name(path: &Path) -> Option<(u64, u64)> {
    let name = path.file_name()?.to_str()?;
    let stem = name.strip_suffix(".json")?;
    let mut parts = stem.split('-');
    let id = parts.next()?.parse::<u64>().ok()?;
    let ts = parts.next()?.parse::<u64>().ok()?;
    Some((id, ts))
}

/// Recent operations, read straight from the journals so the history can never
/// drift from what Undo would actually replay.
pub fn history(limit: usize) -> Vec<HistoryEntry> {
    list_journals()
        .into_iter()
        .take(limit)
        .filter_map(|path| {
            let (op_id, timestamp_ms) = parse_journal_name(&path)?;
            let journal: UndoJournal = serde_json::from_str(&fs::read_to_string(&path).ok()?).ok()?;
            let bytes = journal
                .files
                .iter()
                .filter_map(|f| fs::metadata(&f.moved_to).ok())
                .map(|m| m.len())
                .sum();
            Some(HistoryEntry {
                op_id,
                timestamp_ms,
                files: journal.files.len() as u64,
                bytes,
                kind: if journal.kind.is_empty() { "sort".to_string() } else { journal.kind.clone() },
                empty_entries: journal.removed_empty.len() as u64,
            })
        })
        .collect()
}

/// Replay the newest journal in reverse order. Files whose original location
/// is occupied keep their `(n)` variant and are counted as skipped.
pub fn undo_last(on_progress: &mut dyn FnMut(u64, u64)) -> Result<UndoReport, String> {
    let newest = list_journals()
        .into_iter()
        .next()
        .ok_or_else(|| "nothing to undo".to_string())?;
    let journal: UndoJournal =
        serde_json::from_str(&fs::read_to_string(&newest).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;

    let mut report = UndoReport {
        restored: 0,
        restored_empty: 0,
        skipped: 0,
        skipped_examples: Vec::new(),
        op_id: journal.op_id,
    };
    let total = journal.files.len() as u64;
    // Entries that could not be restored stay in the journal, so a locked file
    // or an occupied original can be retried once the user frees it — dropping
    // the whole journal here would strand those copies in sorted/ forever.
    let mut pending: Vec<MovedFile> = Vec::new();
    for f in journal.files.iter().rev() {
        if f.original.exists() {
            // Original spot taken (user replaced it): keep the moved copy.
            report.skipped += 1;
            pending.push(f.clone());
            if report.skipped_examples.len() < 20 {
                report.skipped_examples.push(format!("{} — destination occupied", f.original.display()));
            }
            on_progress(report.restored, total);
            continue;
        }
        if let Some(parent) = f.original.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let move_res = match fs::rename(&f.moved_to, &f.original) {
            Ok(()) => Ok(()),
            Err(_) => {
                // Fallback for cross-volume moves
                match fs::copy(&f.moved_to, &f.original) {
                    Ok(_) => {
                        let src_len = fs::metadata(&f.moved_to).map(|m| m.len()).ok();
                        let dst_len = fs::metadata(&f.original).map(|m| m.len()).ok();
                        if src_len.is_some() && src_len == dst_len {
                            let _ = fs::remove_file(&f.moved_to);
                            Ok(())
                        } else {
                            let _ = fs::remove_file(&f.original);
                            Err("incomplete copy during undo".to_string())
                        }
                    }
                    Err(e) => Err(e.to_string()),
                }
            }
        };
        match move_res {
            Ok(()) => report.restored += 1,
            Err(err) => {
                report.skipped += 1;
                pending.push(f.clone());
                if report.skipped_examples.len() < 20 {
                    report.skipped_examples.push(format!("{} — {}", f.moved_to.display(), err));
                }
            }
        }
        on_progress(report.restored, total);
    }
    // Recreate the folders and empty files an extras cleanup removed. They
    // carry no data, so restoring one only means bringing the path back.
    let mut pending_empty: Vec<RemovedEmpty> = Vec::new();
    for entry in journal.removed_empty.iter().rev() {
        if entry.path.exists() {
            // Something else already recreated it; not a failure, not a restore.
            continue;
        }
        let recreated = if entry.is_dir {
            fs::create_dir_all(&entry.path).is_ok()
        } else {
            match entry.path.parent() {
                Some(parent) => {
                    let _ = fs::create_dir_all(parent);
                    fs::OpenOptions::new()
                        .create(true)
                        .write(true)
                        .open(&entry.path)
                        .is_ok()
                }
                None => false,
            }
        };
        if recreated {
            report.restored_empty += 1;
        } else {
            report.skipped += 1;
            if report.skipped_examples.len() < 20 {
                report.skipped_examples.push(format!("{} — could not recreate", entry.path.display()));
            }
            pending_empty.push(entry.clone());
        }
    }

    // The journal only disappears once every entry was restored. Otherwise it
    // is rewritten with just the leftovers: the next undo retries them instead
    // of silently skipping ahead to a previous run's journal.
    if pending.is_empty() && pending_empty.is_empty() {
        let _ = fs::remove_file(&newest);
    } else {
        pending.reverse(); // restore the journal's original (chronological) order
        pending_empty.reverse();
        let mut remaining = UndoJournal::new(journal.output_dir.clone());
        remaining.files = pending;
        remaining.removed_empty = pending_empty;
        remaining.kind = journal.kind.clone();
        append(&newest, &remaining)?;
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Holds the data-dir env lock for the WHOLE test lifetime (the override
    /// is process-global, so parallel tests must not interleave).
    struct Isolated {
        _lock: std::sync::MutexGuard<'static, ()>,
        _dir: tempfile::TempDir,
    }

    fn isolated() -> Isolated {
        let lock = crate::categories::env_lock();
        let dir = tempfile::tempdir().unwrap();
        crate::categories::set_data_dir(dir.path().to_path_buf());
        Isolated { _lock: lock, _dir: dir }
    }

    #[test]
    fn append_list_undo_roundtrip() {
        let _guard = isolated();
        let base = tempfile::tempdir().unwrap();
        let a = base.path().join("a.txt");
        let sorted = base.path().join("sorted").join("others");
        fs::create_dir_all(&sorted).unwrap();
        fs::write(&a, b"data").unwrap();
        let moved = sorted.join("a.txt");
        fs::rename(&a, &moved).unwrap();

        let path = new_journal_path();
        let mut journal = UndoJournal::new(base.path().join("sorted"));
        journal.push(MovedFile { original: a.clone(), moved_to: moved.clone() });
        append(&path, &journal).unwrap();

        assert_eq!(list_journals()[0], path);
        let mut called = 0;
        let report = undo_last(&mut |_, _| called += 1).unwrap();
        assert_eq!(report.restored, 1);
        assert_eq!(report.skipped, 0);
        assert!(a.exists());
        assert!(!moved.exists());
        assert!(list_journals().is_empty());
        assert_eq!(called, 1);
    }

    #[test]
    fn undo_with_occupied_original_counts_skipped() {
        let _guard = isolated();
        let base = tempfile::tempdir().unwrap();
        let a = base.path().join("a.txt");
        let sorted = base.path().join("sorted").join("others");
        fs::create_dir_all(&sorted).unwrap();
        let moved = sorted.join("a.txt");
        fs::write(&moved, b"moved").unwrap();
        fs::write(&a, b"replaced by user").unwrap();

        let path = new_journal_path();
        let mut journal = UndoJournal::new(base.path().join("sorted"));
        journal.push(MovedFile { original: a.clone(), moved_to: moved.clone() });
        append(&path, &journal).unwrap();

        let report = undo_last(&mut |_, _| {}).unwrap();
        assert_eq!(report.restored, 0);
        assert_eq!(report.skipped, 1);
        assert!(a.exists());
        assert!(moved.exists(), "moved copy must survive a blocked undo");
        // The journal must survive so the restore can be retried once the
        // user frees the original path.
        assert_eq!(list_journals().len(), 1);

        // Free the destination and retry: the same journal now restores it.
        fs::remove_file(&a).unwrap();
        let report = undo_last(&mut |_, _| {}).unwrap();
        assert_eq!(report.restored, 1);
        assert_eq!(report.skipped, 0);
        assert!(a.exists());
        assert!(!moved.exists());
        assert!(list_journals().is_empty());
    }

    #[test]
    fn undo_without_journal_is_an_error() {
        let _guard = isolated();
        assert!(undo_last(&mut |_, _| {}).is_err());
    }

    #[test]
    fn history_lists_operations_newest_first() {
        let _guard = isolated();
        let base = tempfile::tempdir().unwrap();
        for kind in ["sort", "quarantine"] {
            let path = new_journal_path();
            let mut journal = UndoJournal::new(base.path().to_path_buf());
            journal.kind = kind.to_string();
            let moved = base.path().join(format!("{kind}.txt"));
            fs::write(&moved, b"12345").unwrap();
            journal.push(MovedFile { original: base.path().join("orig.txt"), moved_to: moved });
            append(&path, &journal).unwrap();
        }

        let rows = history(10);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].kind, "quarantine");
        assert_eq!(rows[1].kind, "sort");
        assert_eq!(rows[0].files, 1);
        assert_eq!(rows[0].bytes, 5);
        assert!(rows[0].timestamp_ms > 0);
        assert_eq!(history(1).len(), 1);
    }

    #[test]
    fn journals_from_older_builds_still_load() {
        let _guard = isolated();
        let path = new_journal_path();
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, r#"{"op_id":1,"output_dir":"C:\\sorted","files":[]}"#).unwrap();

        let journal: UndoJournal =
            serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
        assert!(journal.kind.is_empty());
        assert!(journal.removed_empty.is_empty());
        // An old journal is still a sort as far as the history view is concerned.
        assert_eq!(history(1)[0].kind, "sort");
    }
}
