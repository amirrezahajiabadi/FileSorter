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

fn lock<'a>(app: &AppHandle) -> Result<std::sync::MutexGuard<'a, ScanState>, String> {
    let state = app.state::<SharedScan>();
    // `state.inner()` borrows from `state`; tie the guard to that borrow.
    let guard = state
        .try_lock()
        .map_err(|_| "وضعیت برنامه قفل است؛ کمی بعد دوباره تلاش کنید")?;
    // Extend lifetime: `state` lives as long as `app`, which outlives the guard's use.
    Ok(unsafe { std::mem::transmute::<std::sync::MutexGuard<'_, ScanState>, std::sync::MutexGuard<'a, ScanState>>(guard) })
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
    {
        let mut st = lock(&app)?;
        if st.scanning {
            return Err("یک اسکن در حال اجراست".into());
        }
        st.scanning = true;
        st.stop = StopFlag::new();
        st.files.clear();
        st.root = Some(root.clone());
    }
    let handle = app.clone();
    std::thread::spawn(move || {
        let (opts, stop, exclude) = {
            let st = match lock(&handle) {
                Ok(s) => s,
                Err(e) => {
                    let _ = handle.emit("scan-done", SimpleError { error: e });
                    return;
                }
            };
            (
                walk::WalkOptions::default(),
                st.stop.clone(),
                st.root.as_ref().map(|r| r.join(categories::OUTPUT_DIR)),
            )
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
        if let Ok(mut st) = lock(&handle) {
            if !stopped {
                st.files = files;
            }
            st.scanning = false;
        }
        let _ = handle.emit("scan-done", serde_json::json!({ "stopped": stopped }));
    });
    Ok(())
}

#[tauri::command]
fn scan_stop(app: AppHandle) {
    if let Ok(st) = lock(&app) {
        st.stop.stop();
    }
}

#[tauri::command]
fn analyze(app: AppHandle) -> Result<(), String> {
    let (files, cache_path) = {
        let st = lock(&app)?;
        if st.scanning {
            return Err("اسکن هنوز در حال اجراست".into());
        }
        if st.files.is_empty() {
            return Err("اول یک پوشه را اسکن کنید".into());
        }
        (st.files.clone(), categories::data_dir().join("hash-cache.json"))
    };
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
    let st = lock(&app)?;
    if st.files.is_empty() {
        return Err("اول یک پوشه را اسکن کنید".into());
    }
    let root = st.root.clone().ok_or("ریشهٔ اسکن؟")?;
    let cats = Categories::from_map(&categories::load_categories());
    Ok(plan::build_plan(&root, &st.files, &cats))
}

#[tauri::command]
fn sort_execute(app: AppHandle) -> Result<(), String> {
    let (plan, stop) = {
        let st = lock(&app)?;
        if st.files.is_empty() {
            return Err("اول یک پوشه را اسکن کنید".into());
        }
        let root = st.root.clone().ok_or("ریشهٔ اسکن؟")?;
        let cats = Categories::from_map(&categories::load_categories());
        (plan::build_plan(&root, &st.files, &cats), st.stop.clone())
    };
    let handle = app.clone();
    std::thread::spawn(move || {
        let result = execute::execute(&plan, &stop, &|moved, total| {
            let _ = handle.emit("sort-progress", serde_json::json!({ "moved": moved, "total": total }));
        });
        match result {
            Ok(report) => {
                // The scanned snapshot is stale after a successful sort.
                if let Ok(mut st) = lock(&handle) {
                    st.files.clear();
                }
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
    let (files, root, cache_path) = {
        let st = lock(&app)?;
        if st.files.is_empty() {
            return Err("اول یک پوشه را اسکن کنید".into());
        }
        (
            st.files.clone(),
            st.root.clone().ok_or("ریشهٔ اسکن؟")?,
            categories::data_dir().join("hash-cache.json"),
        )
    };
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
                if let Ok(mut st) = lock(&handle) {
                    st.files.clear();
                }
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
            set_categories
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
