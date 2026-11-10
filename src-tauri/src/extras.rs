//! Empty-folder and zero-byte-file cleanup.
//!
//! These are the leftovers a sorter never sees: folders that hold nothing and
//! files that hold no bytes. Neither is worth much, but neither is free to
//! lose either — an empty folder can be a project placeholder — so the removal
//! is journaled through `undo::RemovedEmpty` and can be undone.
//!
//! The scan never follows a symlink or a junction: removing the target of a
//! link is a different (and much larger) operation than "clean this folder".

use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtrasScan {
    pub root: String,
    /// Deepest paths are still listed in plain alphabetical order for display;
    /// the cleaner sorts them itself before removing.
    pub empty_dirs: Vec<String>,
    pub empty_files: Vec<String>,
    pub scanned_entries: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtrasReport {
    pub dirs_removed: u64,
    pub files_removed: u64,
    pub failed: u64,
    pub op_id: u64,
}

/// A path is only touched when it sits strictly inside the scanned root and
/// contains no `..` component, so a crafted entry cannot climb out of the tree.
fn inside(root: &Path, candidate: &Path) -> bool {
    // `..` is never produced by the scan, so seeing one means the path came
    // from somewhere else and must not be trusted.
    if candidate.components().any(|c| matches!(c, Component::ParentDir)) {
        return false;
    }
    match candidate.strip_prefix(root) {
        Ok(rest) => {
            !rest.as_os_str().is_empty()
                && !rest
                    .components()
                    .any(|c| matches!(c, Component::Prefix(_) | Component::RootDir))
        }
        Err(_) => false,
    }
}

pub fn scan(root: &Path) -> Result<ExtrasScan, String> {
    if !root.is_dir() {
        return Err("choose a folder to scan".into());
    }
    let mut empty_dirs: Vec<String> = Vec::new();
    let mut empty_files: Vec<String> = Vec::new();
    let mut scanned_entries: u64 = 0;

    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            // A folder we cannot read is not provably empty: leave it alone.
            Err(_) => continue,
        };
        let mut has_any = false;
        for entry in entries.flatten() {
            has_any = true;
            scanned_entries += 1;
            let Ok(ft) = entry.file_type() else { continue };
            if ft.is_symlink() {
                continue;
            }
            let path = entry.path();
            if ft.is_dir() {
                stack.push(path);
            } else if ft.is_file() {
                if entry.metadata().map(|m| m.len() == 0).unwrap_or(false) {
                    empty_files.push(path.to_string_lossy().into_owned());
                }
            }
        }
        if !has_any {
            empty_dirs.push(dir.to_string_lossy().into_owned());
        }
    }

    empty_dirs.sort();
    empty_files.sort();

    Ok(ExtrasScan {
        root: root.to_string_lossy().into_owned(),
        empty_dirs,
        empty_files,
        scanned_entries,
    })
}

/// Delete the selected entries, re-checking every one of them first.
///
/// The check is the whole point: a file can grow between the scan and the
/// click, and a folder can receive a download in that window. Anything that is
/// no longer empty is skipped and reported as failed rather than removed.
pub fn clean(root: &Path, dirs: &[String], files: &[String]) -> Result<ExtrasReport, String> {
    if !root.is_dir() {
        return Err("choose a folder to scan".into());
    }
    let mut report = ExtrasReport { dirs_removed: 0, files_removed: 0, failed: 0, op_id: 0 };
    let mut removed: Vec<super::undo::RemovedEmpty> = Vec::new();

    for raw in files {
        let path = Path::new(raw);
        if !inside(root, path) {
            report.failed += 1;
            continue;
        }
        let zero = fs::metadata(path).map(|m| m.is_file() && m.len() == 0).unwrap_or(false);
        if !zero {
            report.failed += 1;
            continue;
        }
        match fs::remove_file(path) {
            Ok(()) => {
                report.files_removed += 1;
                removed.push(super::undo::RemovedEmpty { path: path.to_path_buf(), is_dir: false });
            }
            Err(_) => report.failed += 1,
        }
    }

    // Deepest first: removing a child cannot then be blocked by its parent.
    let mut ordered: Vec<&String> = dirs.iter().collect();
    ordered.sort_by_key(|p| std::cmp::Reverse(Path::new(p).components().count()));

    for raw in ordered {
        let path = Path::new(raw);
        if !inside(root, path) {
            report.failed += 1;
            continue;
        }
        let empty = fs::read_dir(path).map(|mut e| e.next().is_none()).unwrap_or(false);
        if !empty {
            report.failed += 1;
            continue;
        }
        match fs::remove_dir(path) {
            Ok(()) => {
                report.dirs_removed += 1;
                removed.push(super::undo::RemovedEmpty { path: path.to_path_buf(), is_dir: true });
            }
            Err(_) => report.failed += 1,
        }
    }

    if !removed.is_empty() {
        let journal_path = super::undo::new_journal_path();
        let mut journal = super::undo::UndoJournal::new(root.to_path_buf());
        journal.kind = "extras".to_string();
        journal.removed_empty = removed;
        super::undo::append(&journal_path, &journal)?;
        report.op_id = journal.op_id;
    }

    Ok(report)
}

/// Count entries in a folder without descending, used by tests and callers that
/// only need the "is it empty?" answer.
pub fn is_dir_empty(path: &Path) -> bool {
    fs::read_dir(path).map(|mut e| e.next().is_none()).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

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

    fn tree() -> tempfile::TempDir {
        let base = tempfile::tempdir().unwrap();
        fs::create_dir_all(base.path().join("empty-nested").join("child")).unwrap();
        fs::create_dir_all(base.path().join("keep")).unwrap();
        fs::write(base.path().join("keep").join("real.txt"), b"content").unwrap();
        fs::write(base.path().join("zero.txt"), b"").unwrap();
        base
    }

    #[test]
    fn scan_finds_empty_dirs_and_zero_byte_files_only() {
        let base = tree();
        let scan = scan(base.path()).unwrap();
        assert_eq!(scan.empty_dirs.len(), 1, "only the innermost folder is truly empty");
        assert!(scan.empty_dirs[0].ends_with("child"));
        assert_eq!(scan.empty_files.len(), 1);
        assert!(scan.empty_files[0].ends_with("zero.txt"));
        assert_eq!(scan.scanned_entries, 5);
    }

    #[test]
    fn clean_removes_them_and_undo_brings_them_back() {
        let _guard = isolated();
        let base = tree();
        let scan = scan(base.path()).unwrap();
        let report = clean(base.path(), &scan.empty_dirs, &scan.empty_files).unwrap();

        assert_eq!(report.dirs_removed, 1);
        assert_eq!(report.files_removed, 1);
        assert_eq!(report.failed, 0);
        assert!(!base.path().join("zero.txt").exists());
        assert!(!base.path().join("empty-nested").join("child").exists());
        // Nothing that held data may be touched.
        assert_eq!(
            fs::read(base.path().join("keep").join("real.txt")).unwrap(),
            b"content"
        );

        let undo = crate::undo::undo_last(&mut |_, _| {}).unwrap();
        assert_eq!(undo.restored_empty, 2);
        assert_eq!(undo.skipped, 0);
        assert!(base.path().join("zero.txt").exists());
        assert!(base.path().join("empty-nested").join("child").is_dir());
    }

    #[test]
    fn a_file_that_grew_after_the_scan_is_kept() {
        let _guard = isolated();
        let base = tree();
        let scan = scan(base.path()).unwrap();
        let zero = base.path().join("zero.txt");
        fs::write(&zero, b"now it has content").unwrap();

        let report = clean(base.path(), &scan.empty_dirs, &scan.empty_files).unwrap();
        assert_eq!(report.files_removed, 0);
        assert_eq!(report.failed, 1);
        assert_eq!(fs::read(&zero).unwrap(), b"now it has content");
    }

    #[test]
    fn paths_outside_the_root_are_refused() {
        let _guard = isolated();
        let base = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let victim = outside.path().join("zero.txt");
        fs::write(&victim, b"").unwrap();

        let report = clean(base.path(), &[], &[victim.to_string_lossy().into_owned()]).unwrap();
        assert_eq!(report.files_removed, 0);
        assert_eq!(report.failed, 1);
        assert!(victim.exists());

        let sneaky = base.path().join("..").join("escape");
        assert!(!inside(base.path(), &sneaky));
    }

    #[test]
    fn scan_of_a_missing_folder_is_an_error() {
        let base = tempfile::tempdir().unwrap();
        assert!(scan(&base.path().join("nope")).is_err());
    }

    #[test]
    fn is_empty_helper_agrees_with_read_dir() {
        let base = tempfile::tempdir().unwrap();
        assert!(is_dir_empty(base.path()));
        fs::write(base.path().join("x"), b"1").unwrap();
        assert!(!is_dir_empty(base.path()));
    }

    #[test]
    fn a_sibling_folder_with_the_same_prefix_is_not_inside() {
        let base = tempfile::tempdir().unwrap();
        let root = base.path().join("Docs");
        fs::create_dir_all(&root).unwrap();
        let sibling = base.path().join("Docs2").join("file.txt");
        assert!(!inside(&root, &sibling));
        // And the root itself is never a deletion target.
        assert!(!inside(&root, &root));
    }
}
