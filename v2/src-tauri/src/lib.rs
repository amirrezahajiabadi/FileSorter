//! FileSorter v2 — Tauri 2 commands and event wiring.
//!
//! Long-running work (scan, duplicate analysis, sort, quarantine, undo) runs
//! on its own thread and reports through events so the UI stays perfectly
//! responsive: the webview never blocks on a command call. Shared scan state
//! is a Tauri-managed `Mutex<ScanState>`, reachable from any thread via
//! `app.state::<…>()`.

pub mod categories;
pub mod dupes;
pub mod execute;
pub mod plan;
pub mod undo;
pub mod walk;

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use categories::Categories;
use walk::StopFlag;

#[derive(Default)]
struct ScanState {
    stop: StopFlag,
    scanning: bool,
    files: Vec<(PathBuf, u64)>,
    root: Option<PathBuf>,
}

type SharedScan = Mutex<ScanState>;

fn with_state<T, F>(app: &AppHandle, f: F) -> Result<T, String>
where
    F: FnOnce(&mut ScanState) -> Result<T, String>,
{
    let state = app.state::<SharedScan>();
    let mut guard = state.lock().map_err(|e| e.to_string())?;
    f(&mut guard)
}

#[derive(Clone, Serialize)]
struct ScanProgress {
    total_so_far: u64,
    bytes_so_far: u64,
    batch_files: usize,
    done: bool,
}

#[derive(Clone, Serialize)]
struct SimpleError {
    error: String,
}

#[tauri::command]
fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = app
        .dialog()
        .file()
        .blocking_pick_folder()
        .map(|p| p.to_string());
    Ok(path)
}

#[tauri::command]
fn scan_start(root: String, app: AppHandle) -> Result<(), String> {
    let root = walk::normalize_root(std::path::Path::new(&root))?;
    with_state(&app, |st| {
        if st.scanning {
            return Err("a scan is already running".into());
        }
        st.scanning = true;
        st.stop = StopFlag::new();
        st.files.clear();
        st.root = Some(root.clone());
        Ok(())
    })?;
    let handle = app.clone();
    std::thread::spawn(move || {
        let (opts, stop, exclude) = match with_state(&handle, |st| {
            Ok((
                walk::WalkOptions::default(),
                st.stop.clone(),
                st.root.as_ref().map(|r| r.join(categories::OUTPUT_DIR)),
            ))
        }) {
            Ok(v) => v,
            Err(e) => {
                let _ = handle.emit("scan-done", SimpleError { error: e });
                return;
            }
        };
        let batches = walk::collect_files(&root, exclude.as_deref(), &opts, &stop, 500);
        let mut files: Vec<(PathBuf, u64)> = Vec::new();
        let mut bytes: u64 = 0;
        for (i, batch) in batches.iter().enumerate() {
            for (_, s) in &batch.files {
                bytes += s;
            }
            files.extend(batch.files.iter().cloned());
            let done = i + 1 == batches.len() || stop.is_stopped();
            let _ = handle.emit(
                "scan-progress",
                ScanProgress {
                    total_so_far: batch.total_so_far,
                    bytes_so_far: bytes,
                    batch_files: batch.files.len(),
                    done,
                },
            );
        }
        let stopped = stop.is_stopped();
        let _ = with_state(&handle, |st| {
            if !stopped {
                st.files = files;
            }
            st.scanning = false;
            Ok(())
        });
        let _ = handle.emit("scan-done", serde_json::json!({ "stopped": stopped }));
    });
    Ok(())
}

#[tauri::command]
fn scan_stop(app: AppHandle) {
    let _ = with_state(&app, |st| {
        st.stop.stop();
        Ok(())
    });
}

#[tauri::command]
fn analyze(app: AppHandle) -> Result<(), String> {
    let (files, cache_path) = with_state(&app, |st| {
        if st.scanning {
            return Err("a scan is still running".into());
        }
        if st.files.is_empty() {
            return Err("scan a folder first".into());
        }
        Ok((st.files.clone(), categories::data_dir().join("hash-cache.json")))
    })?;
    let handle = app.clone();
    std::thread::spawn(move || {
        match dupes::find_duplicates(
            &files,
            dupes::HashCache::load(&cache_path),
            &cache_path,
            |hashed| {
                let _ = handle.emit("dupes-progress", serde_json::json!({ "hashed": hashed }));
            },
        ) {
            Ok((groups, _)) => {
                let _ = handle.emit("dupes-done", serde_json::json!({ "groups": groups }));
            }
            Err(e) => {
                let _ = handle.emit("dupes-done", SimpleError { error: e });
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn plan_sort(app: AppHandle) -> Result<plan::SortPlan, String> {
    let (root, files) = with_state(&app, |st| {
        if st.files.is_empty() {
            return Err("scan a folder first".into());
        }
        let root = st.root.clone().ok_or("scan root missing")?;
        Ok((root, st.files.clone()))
    })?;
    let cats = Categories::from_map(&categories::load_categories());
    Ok(plan::build_plan(&root, &files, &cats))
}

#[tauri::command]
fn sort_execute(app: AppHandle) -> Result<(), String> {
    let (plan, stop) = with_state(&app, |st| {
        if st.files.is_empty() {
            return Err("scan a folder first".into());
        }
        let root = st.root.clone().ok_or("scan root missing")?;
        let cats = Categories::from_map(&categories::load_categories());
        Ok((plan::build_plan(&root, &st.files, &cats), st.stop.clone()))
    })?;
    let handle = app.clone();
    std::thread::spawn(move || {
        let result = execute::execute(&plan, &stop, &|moved, total| {
            let _ = handle.emit("sort-progress", serde_json::json!({ "moved": moved, "total": total }));
        });
        match result {
            Ok(report) => {
                // The scanned snapshot is stale after a successful sort.
                let _ = with_state(&handle, |st| {
                    st.files.clear();
                    Ok(())
                });
                let _ = handle.emit("sort-done", serde_json::json!({ "report": report }));
            }
            Err(e) => {
                let _ = handle.emit("sort-done", SimpleError { error: e });
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn quarantine_duplicates(app: AppHandle, keep: String) -> Result<(), String> {
    // `keep`: "oldest" (default) or "newest" — which copy stays in place.
    let (files, root, cache_path) = with_state(&app, |st| {
        if st.files.is_empty() {
            return Err("scan a folder first".into());
        }
        Ok((
            st.files.clone(),
            st.root.clone().ok_or("scan root missing")?,
            categories::data_dir().join("hash-cache.json"),
        ))
    })?;
    let handle = app.clone();
    std::thread::spawn(move || {
        let (groups, _) = match dupes::find_duplicates(
            &files,
            dupes::HashCache::load(&cache_path),
            &cache_path,
            |_| {},
        ) {
            Ok(v) => v,
            Err(e) => {
                let _ = handle.emit("quarantine-done", SimpleError { error: e });
                return;
            }
        };
        // Groups' file lists are sorted oldest → newest.
        let mut to_move: Vec<dupes::DupFile> = Vec::new();
        for g in groups {
            let keeper = if keep == "newest" { g.files.len() - 1 } else { 0 };
            for (i, f) in g.files.into_iter().enumerate() {
                if i != keeper {
                    to_move.push(dupes::DupFile { is_keeper: false, ..f });
                }
            }
        }
        let stop = StopFlag::new();
        let result = execute::quarantine_duplicates(&to_move, &root, &stop, &|moved, total| {
            let _ = handle.emit("quarantine-progress", serde_json::json!({ "moved": moved, "total": total }));
        });
        match result {
            Ok(report) => {
                let _ = with_state(&handle, |st| {
                    st.files.clear();
                    Ok(())
                });
                let _ = handle.emit("quarantine-done", serde_json::json!({ "report": report }));
            }
            Err(e) => {
                let _ = handle.emit("quarantine-done", SimpleError { error: e });
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn undo_last(app: AppHandle) -> Result<(), String> {
    let handle = app.clone();
    std::thread::spawn(move || {
        match undo::undo_last(&mut |restored, total| {
            let _ = handle.emit("undo-progress", serde_json::json!({ "restored": restored, "total": total }));
        }) {
            Ok(report) => {
                let _ = handle.emit("undo-done", serde_json::json!({ "report": report }));
            }
            Err(e) => {
                let _ = handle.emit("undo-done", SimpleError { error: e });
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn get_categories() -> categories::CategoryMap {
    categories::load_categories()
}

#[tauri::command]
fn set_categories(map: categories::CategoryMap) -> Result<(), String> {
    categories::save_categories(&map)
}

#[tauri::command]
fn reset_categories() -> Result<categories::CategoryMap, String> {
    categories::reset_categories()
}

#[derive(serde::Serialize)]
struct DiskStats {
    total_files: usize,
    total_bytes: u64,
    largest_files: Vec<(String, u64)>,
    category_breakdown: Vec<(String, u64, u64)>,
}

#[tauri::command]
fn get_disk_stats(app: AppHandle) -> Result<DiskStats, String> {
    with_state(&app, |st| {
        if st.files.is_empty() {
            return Err("scan a folder first".into());
        }
        let cats = Categories::from_map(&categories::load_categories());
        let total_files = st.files.len();
        let total_bytes: u64 = st.files.iter().map(|(_, s)| *s).sum();

        let mut sorted_by_size = st.files.clone();
        sorted_by_size.sort_by(|a, b| b.1.cmp(&a.1));
        let largest_files: Vec<(String, u64)> = sorted_by_size
            .into_iter()
            .take(20)
            .map(|(p, s)| (p.to_string_lossy().into_owned(), s))
            .collect();

        let mut cat_counts = std::collections::HashMap::new();
        let mut cat_bytes = std::collections::HashMap::new();
        for (p, s) in &st.files {
            let idx = cats.index_for_path(p);
            *cat_counts.entry(idx).or_insert(0u64) += 1;
            *cat_bytes.entry(idx).or_insert(0u64) += *s;
        }

        let category_breakdown: Vec<(String, u64, u64)> = cats
            .names()
            .iter()
            .enumerate()
            .map(|(i, name)| {
                let count = *cat_counts.get(&(i as u8)).unwrap_or(&0);
                let bytes = *cat_bytes.get(&(i as u8)).unwrap_or(&0);
                (name.clone(), count, bytes)
            })
            .filter(|(_, count, _)| *count > 0)
            .collect();

        Ok(DiskStats {
            total_files,
            total_bytes,
            largest_files,
            category_breakdown,
        })
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SharedScan::new(ScanState::default()))
        .invoke_handler(tauri::generate_handler![
            pick_folder,
            scan_start,
            scan_stop,
            analyze,
            plan_sort,
            sort_execute,
            quarantine_duplicates,
            undo_last,
            get_categories,
            set_categories,
            reset_categories,
            get_disk_stats
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
