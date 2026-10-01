//! Crash-safe undo journal.
//!
//! Each sort/quarantine run writes `undo/<op_id>-<timestamp>.json` into the
//! app data dir. Entries are appended to disk only after their move succeeded
//! (in-memory during the run, flushed once at the end), so a crash mid-run
//! leaves the on-disk journal consistent: it contains exactly the moves that
//! completed. `undo_last` replays the newest journal in reverse, renaming
//! every file back to its original path.

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
}

pub fn undo_dir() -> PathBuf {
    data_dir().join("undo")
}

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
    undo_dir().join(format!("{:06}-{}.json", id, ts))
}

impl UndoJournal {
    pub fn new(output_dir: PathBuf) -> Self {
        Self { op_id: 0, output_dir, files: Vec::new() }
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
    pub skipped: u64,
    pub skipped_examples: Vec<String>,
    pub op_id: u64,
}

/// Replay the newest journal in reverse order. Files whose original location
/// is occupied keep their `(n)` variant and are counted as skipped.
pub fn undo_last(on_progress: &mut dyn FnMut(u64, u64)) -> Result<UndoReport, String> {
    let newest = list_journals()
        .into_iter()
        .next()
        .ok_or_else(|| "عملیاتی برای واگرد وجود ندارد".to_string())?;
    let journal: UndoJournal =
        serde_json::from_str(&fs::read_to_string(&newest).map_err(|e| e.to_string())?)
            .map_err(|e| e.to_string())?;

    let mut report = UndoReport { restored: 0, skipped: 0, skipped_examples: Vec::new(), op_id: journal.op_id };
    let total = journal.files.len() as u64;
    for f in journal.files.iter().rev() {
        if f.original.exists() {
            // Original spot taken (user replaced it): keep the moved copy.
            report.skipped += 1;
            if report.skipped_examples.len() < 20 {
                report.skipped_examples.push(format!("{} — مقصد اشغال است", f.original.display()));
            }
            on_progress(report.restored, total);
            continue;
        }
        match fs::rename(&f.moved_to, &f.original) {
            Ok(()) => report.restored += 1,
            Err(err) => {
                report.skipped += 1;
                if report.skipped_examples.len() < 20 {
                    report.skipped_examples.push(format!("{} — {}", f.moved_to.display(), err));
                }
            }
        }
        on_progress(report.restored, total);
    }
    // Consumed journal is removed whether fully or partially restored.
    let _ = fs::remove_file(&newest);
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
        assert!(list_journals().is_empty());
    }

    #[test]
    fn undo_without_journal_is_an_error() {
        let _guard = isolated();
        assert!(undo_last(&mut |_, _| {}).is_err());
    }
}
