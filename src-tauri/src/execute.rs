//! Plan execution: move files with rollback safety.
//!
//! - Same-volume moves are a rename (instant, no data copy).
//! - Cross-volume moves fall back to copy+verify+delete.
//! - Destinations are re-checked against the live filesystem at execution
//!   time (planning happened earlier; a file may have appeared since) and get
//!   a ` (n)` suffix when taken — nothing is ever overwritten.
//! - Locked/vanished files are skipped and reported, never fatal.
//! - The journal is flushed every few hundred moves and again at the end, so
//!   undo still works after a crash mid-run.

use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::categories::OUTPUT_DIR;
use crate::plan::SortPlan;
use crate::undo;

#[derive(Serialize, Default)]
pub struct ExecReport {
    pub moved: u64,
    pub skipped: u64,
    pub bytes_moved: u64,
    pub skipped_examples: Vec<String>,
    /// Journal file the report refers to (for `undo_last`).
    pub journal: PathBuf,
    /// Monotonic id of this operation inside the journal.
    pub op_id: u64,
}

/// Pick a destination that does not exist on disk yet by appending ` (n)`.
///
/// Planning deliberately never touches the filesystem, so the first candidate
/// may already be taken by a file that appeared after the plan was built (a
/// previous watch tick, another app, the user). Callers must run the final
/// destination through this before moving anything.
pub fn take_unique_on_disk(candidate: PathBuf) -> PathBuf {
    if !candidate.exists() {
        return candidate;
    }
    let stem = candidate
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let ext = candidate
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    for n in 2..u32::MAX {
        let attempt = candidate.with_file_name(format!("{} ({}){}", stem, n, ext));
        if !attempt.exists() {
            return attempt;
        }
    }
    candidate // practically unreachable
}

/// Copy `source` onto `dest`, verify the bytes landed, then delete the source.
/// Only for moves a rename cannot do (cross-volume, or a file held open).
fn copy_then_delete(source: &Path, dest: &Path) -> Result<(), String> {
    fs::copy(source, dest).map_err(|e| format!("copy: {}", e))?;
    let src_len = fs::metadata(source).map(|m| m.len()).ok();
    let dst_len = fs::metadata(dest).map(|m| m.len()).ok();
    if src_len.is_none() || src_len != dst_len {
        let _ = fs::remove_file(dest);
        return Err("incomplete copy — source not removed".into());
    }
    fs::remove_file(source).map_err(|e| format!("delete after copy: {}", e))?;
    Ok(())
}

/// Move one file without ever replacing a file that already exists.
///
/// `fs::rename` refuses to replace a file on Windows but silently clobbers it
/// on Unix, and the copy fallback truncates the target on every platform. So a
/// destination that appeared after the plan was built (a watch tick, another
/// app, the user) is a collision, not a cross-volume move: take the next free
/// `name (n)` and retry. Returns the path the file actually ended up at.
pub fn move_file_safely(source: &Path, dest: &Path) -> Result<PathBuf, String> {
    if source == dest {
        return Ok(dest.to_path_buf());
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("create folder: {}", e))?;
    }
    let mut target = dest.to_path_buf();
    for _ in 0..32 {
        if target.exists() {
            target = take_unique_on_disk(target);
        }
        match fs::rename(source, &target) {
            Ok(()) => return Ok(target),
            Err(rename_err) => {
                // A file can also appear between the check and the rename; on
                // Windows that makes the rename fail rather than replace it.
                if target.exists() {
                    continue;
                }
                // No collision left: cross-volume or locked-by-rename.
                return copy_then_delete(source, &target)
                    .map(|()| target)
                    .map_err(|e| format!("{} (rename: {})", e, rename_err));
            }
        }
    }
    Err(format!("no free name for {}", dest.display()))
}

fn move_one(source: &Path, dest: &Path) -> Result<(), String> {
    move_file_safely(source, dest).map(|_| ())
}

/// Execute `plan`, journaling each move into `data_dir/undo/`. The undo
/// journal stores ABSOLUTE source paths, so undo works even if the plan root
/// was a relative path.
pub fn execute(plan: &SortPlan, stop: &crate::walk::StopFlag, on_progress: &dyn Fn(u64, u64)) -> Result<ExecReport, String> {
    let mut report = ExecReport::default();
    let journal_path = undo::new_journal_path();
    let mut journal = undo::UndoJournal::new(plan.output_dir.clone());
    journal.kind = "sort".to_string();
    let total = plan.moves.len() as u64;
    report.journal = journal_path.clone();

    let mut last_progress = std::time::Instant::now();
    // Flush the journal every few hundred moves. The module promise is that a
    // crash mid-run still leaves every completed move undoable; writing only
    // once after the loop meant a crash 8 000 files into a 20 000-file sort
    // left no journal at all and stranded all 8 000 files.
    const JOURNAL_FLUSH_EVERY: u64 = 200;
    for m in &plan.moves {
        if stop.is_stopped() {
            break;
        }
        // Live collision check: the plan may be seconds old. `take_unique_on_disk`
        // returns the candidate untouched when it is free.
        let dest = take_unique_on_disk(m.destination.clone());
        match move_one(&m.source, &dest) {
            Ok(()) => {
                journal.push(undo::MovedFile {
                    original: m.source.clone(),
                    moved_to: dest,
                });
                report.moved += 1;
                report.bytes_moved += m.size;
                if report.moved % JOURNAL_FLUSH_EVERY == 0 {
                    undo::append(&journal_path, &journal)?;
                }
            }
            Err(err) => {
                report.skipped += 1;
                if report.skipped_examples.len() < 20 {
                    report.skipped_examples.push(format!("{} — {}", m.source.display(), err));
                }
            }
        }
        if last_progress.elapsed() >= std::time::Duration::from_millis(50) {
            on_progress(report.moved, total);
            last_progress = std::time::Instant::now();
        }
    }
    on_progress(report.moved, total);

    // A journal with zero entries (nothing moved / stopped at once) should
    // not pollute the undo history.
    if !journal.is_empty() {
        undo::append(&journal_path, &journal)?;
        report.op_id = journal.op_id;
    }
    Ok(report)
}

/// Move a set of duplicate copies into the duplicates folder instead of
/// deleting them — keeps every operation reversible.
pub fn quarantine_duplicates(
    files: &[crate::dupes::DupFile],
    scan_root: &Path,
    stop: &crate::walk::StopFlag,
    on_progress: &dyn Fn(u64, u64),
) -> Result<ExecReport, String> {
    let base = scan_root.join(OUTPUT_DIR).join(crate::categories::DUPES_DIR);
    let mut report = ExecReport::default();
    let journal_path = undo::new_journal_path();
    let mut journal = undo::UndoJournal::new(base.clone());
    journal.kind = "quarantine".to_string();
    report.journal = journal_path.clone();
    let total = files.len() as u64;

    let mut last_progress = std::time::Instant::now();
    for f in files {
        if stop.is_stopped() {
            break;
        }
        if f.is_keeper {
            continue;
        }
        let dest_dir = base.join(f.path.extension().map(|e| e.to_string_lossy().into_owned()).unwrap_or_else(|| "misc".into()));
        let dest = take_unique_on_disk(dest_dir.join(f.path.file_name().unwrap_or_default()));
        match move_one(&f.path, &dest) {
            Ok(()) => {
                journal.push(undo::MovedFile { original: f.path.clone(), moved_to: dest });
                report.moved += 1;
                report.bytes_moved += f.size;
            }
            Err(err) => {
                report.skipped += 1;
                if report.skipped_examples.len() < 20 {
                    report.skipped_examples.push(format!("{} — {}", f.path.display(), err));
                }
            }
        }
        if last_progress.elapsed() >= std::time::Duration::from_millis(50) {
            on_progress(report.moved, total);
            last_progress = std::time::Instant::now();
        }
    }
    on_progress(report.moved, total);
    if !journal.is_empty() {
        undo::append(&journal_path, &journal)?;
        report.op_id = journal.op_id;
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write(dir: &Path, name: &str, bytes: &[u8]) -> PathBuf {
        let p = dir.join(name);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(&p, bytes).unwrap();
        p
    }

    #[test]
    fn taken_destination_is_never_overwritten() {
        let tmp = tempfile::tempdir().unwrap();
        let src = write(tmp.path(), "in/note.txt", b"new");
        let taken = write(tmp.path(), "out/note.txt", b"existing");

        let moved = move_file_safely(&src, &taken).expect("move should succeed");

        assert_eq!(
            fs::read(&taken).unwrap(),
            b"existing",
            "the file already at the destination must survive"
        );
        assert_eq!(moved.file_name().unwrap().to_string_lossy(), "note (2).txt");
        assert_eq!(fs::read(&moved).unwrap(), b"new");
        assert!(!src.exists(), "source must be gone after a successful move");
    }

    #[test]
    fn free_destination_keeps_its_name() {
        let tmp = tempfile::tempdir().unwrap();
        let src = write(tmp.path(), "in/a.txt", b"payload");
        let dest = tmp.path().join("out").join("a.txt");

        let moved = move_file_safely(&src, &dest).expect("move should succeed");

        assert_eq!(moved, dest);
        assert_eq!(fs::read(&dest).unwrap(), b"payload");
        assert!(!src.exists());
    }
}
