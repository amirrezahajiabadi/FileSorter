//! Smart Batch Renamer backend operations with safe execution and undo tracking.

use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

static LAST_RENAME_JOURNAL: Mutex<Vec<(PathBuf, PathBuf)>> = Mutex::new(Vec::new());

/// Windows compares paths case-insensitively, so `File.txt` "already exists"
/// when the real name is `file.txt`. That is still a legal case-only rename.
fn same_path_ignoring_case(a: &std::path::Path, b: &std::path::Path) -> bool {
    a.to_string_lossy().to_lowercase() == b.to_string_lossy().to_lowercase()
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct RenamePair {
    pub original_path: String,
    pub new_name: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct BatchRenameReport {
    pub successful: usize,
    pub failed: usize,
    pub renamed_pairs: Vec<(String, String)>,
    pub errors: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct UndoRenameReport {
    pub restored: usize,
    pub failed: usize,
    pub errors: Vec<String>,
}

#[tauri::command]
pub fn pick_files_for_rename(app: AppHandle) -> Result<Option<Vec<String>>, String> {
    let paths = app.dialog().file().blocking_pick_files();
    Ok(paths.map(|list| list.into_iter().map(|p| p.to_string()).collect()))
}

#[tauri::command]
pub fn pick_folder_for_rename(app: AppHandle) -> Result<Option<Vec<String>>, String> {
    let folder = app.dialog().file().blocking_pick_folder();
    if let Some(folder_path) = folder {
        let mut files = Vec::new();
        if let Ok(entries) = fs::read_dir(folder_path.to_string()) {
            for entry in entries.flatten() {
                if let Ok(ft) = entry.file_type() {
                    if ft.is_file() {
                        files.push(entry.path().to_string_lossy().into_owned());
                    }
                }
            }
        }
        files.sort();
        return Ok(Some(files));
    }
    Ok(None)
}

#[tauri::command(async)]
pub fn execute_batch_rename(pairs: Vec<RenamePair>) -> Result<BatchRenameReport, String> {
    let mut journal = LAST_RENAME_JOURNAL.lock().map_err(|e| e.to_string())?;
    journal.clear();

    let mut successful = 0;
    let mut failed = 0;
    let mut renamed_pairs = Vec::new();
    let mut errors = Vec::new();

    for item in pairs {
        let orig = PathBuf::from(&item.original_path);
        if !orig.is_file() {
            failed += 1;
            errors.push(format!("Source not found: {}", item.original_path));
            continue;
        }

        let parent = match orig.parent() {
            Some(p) => p,
            None => {
                failed += 1;
                errors.push(format!("No parent directory for: {}", item.original_path));
                continue;
            }
        };

        // A new name is user input, not a path: `..\..\x` or `D:\x` would
        // rename the file out of its own folder entirely.
        let new_name = item.new_name.trim();
        if !crate::paths::is_safe_component(new_name) {
            failed += 1;
            errors.push(format!("Invalid file name: {}", item.new_name));
            continue;
        }

        let new_path = parent.join(new_name);

        if orig == new_path {
            // No name change needed
            continue;
        }

        if new_path.exists() && !same_path_ignoring_case(&orig, &new_path) {
            failed += 1;
            errors.push(format!("Target name already exists: {}", new_name));
            continue;
        }

        match fs::rename(&orig, &new_path) {
            Ok(_) => {
                successful += 1;
                journal.push((new_path.clone(), orig.clone()));
                renamed_pairs.push((
                    item.original_path,
                    new_path.to_string_lossy().into_owned(),
                ));
            }
            Err(e) => {
                failed += 1;
                errors.push(format!("Failed renaming {}: {}", item.new_name, e));
            }
        }
    }

    Ok(BatchRenameReport {
        successful,
        failed,
        renamed_pairs,
        errors,
    })
}

#[tauri::command]
pub fn undo_last_rename() -> Result<UndoRenameReport, String> {
    let mut journal = LAST_RENAME_JOURNAL.lock().map_err(|e| e.to_string())?;
    if journal.is_empty() {
        return Err("No recent rename operations to undo.".into());
    }

    let mut restored = 0;
    let mut failed = 0;
    let mut errors = Vec::new();

    // Replay in reverse. Entries that could not be restored are put back into
    // the journal: popping them (the old behaviour) threw the only record away,
    // so a locked file could never be retried and the next undo silently
    // reported "no recent renames".
    let entries: Vec<(PathBuf, PathBuf)> = journal.drain(..).collect();
    let mut keep: Vec<(PathBuf, PathBuf)> = Vec::new();
    for (current_path, orig_path) in entries.into_iter().rev() {
        if !current_path.exists() {
            failed += 1;
            errors.push(format!("File no longer exists: {}", current_path.display()));
            continue;
        }
        if orig_path.exists() {
            failed += 1;
            errors.push(format!("Original path is occupied: {}", orig_path.display()));
            keep.push((current_path, orig_path));
            continue;
        }
        match fs::rename(&current_path, &orig_path) {
            Ok(_) => restored += 1,
            Err(e) => {
                failed += 1;
                errors.push(format!("Error restoring {}: {}", orig_path.display(), e));
                keep.push((current_path, orig_path));
            }
        }
    }
    keep.reverse(); // back to chronological order
    *journal = keep;

    Ok(UndoRenameReport {
        restored,
        failed,
        errors,
    })
}
