//! FileSorter v2 — Tauri 2 commands and event wiring.
//!
//! Long-running work (scan, duplicate analysis, sort, quarantine, undo) runs
//! on its own thread and reports through events so the UI stays perfectly
//! responsive: the webview never blocks on a command call. Shared scan state
//! is a Tauri-managed `Mutex<ScanState>`, reachable from any thread via
//! `app.state::<…>()`.

pub mod categories;
pub mod cleanup_ops;
pub mod disk_ops;
pub mod dupes;
pub mod execute;
pub mod image_ops;
pub mod paths;
pub mod pdf_ops;
pub mod plan;
pub mod rename_ops;
pub mod schedule_ops;
pub mod undo;
pub mod update_ops;
pub mod walk;
pub mod watch_ops;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

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
        let mut files: Vec<(PathBuf, u64)> = Vec::new();
        let mut bytes: u64 = 0;
        walk::stream_files(&root, exclude.as_deref(), &opts, &stop, 500, |mut batch| {
            for (_, s) in &batch.files {
                bytes += s;
            }
            let count = batch.files.len();
            let total = batch.total_so_far;
            let done = batch.done || stop.is_stopped();
            files.append(&mut batch.files);
            let _ = handle.emit(
                "scan-progress",
                ScanProgress {
                    total_so_far: total,
                    bytes_so_far: bytes,
                    batch_files: count,
                    done,
                },
            );
        });
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
    let rules = categories::load_rules();
    let mut plan = plan::build_plan_with_rules(&root, &files, &cats, &rules);
    if plan.moves.len() > 100 {
        plan.moves.truncate(100);
    }
    Ok(plan)
}

#[tauri::command]
fn sort_execute(app: AppHandle) -> Result<(), String> {
    let plan = with_state(&app, |st| {
        if st.files.is_empty() {
            return Err("scan a folder first".into());
        }
        let root = st.root.clone().ok_or("scan root missing")?;
        let cats = Categories::from_map(&categories::load_categories());
        let rules = categories::load_rules();
        Ok(plan::build_plan_with_rules(&root, &st.files, &cats, &rules))
    })?;
    // A fresh stop flag per sort: the scan's flag stays `true` after the user
    // pressed Stop, and reusing it made the very next sort abort before its
    // first file while still reporting success.
    let stop = StopFlag::new();
    let handle = app.clone();
    std::thread::spawn(move || {
        let result = execute::execute(&plan, &stop, &|moved, total| {
            let _ = handle.emit("sort-progress", serde_json::json!({ "moved": moved, "total": total }));
        });
        match result {
            Ok(report) => {
                // The scanned snapshot is stale only when something actually
                // moved; a no-op run must not wipe the preview.
                if report.moved > 0 {
                    let _ = with_state(&handle, |st| {
                        st.files.clear();
                        Ok(())
                    });
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

#[tauri::command]
fn get_smart_rules() -> Vec<categories::SmartRule> {
    categories::load_rules()
}

#[tauri::command]
fn save_smart_rules(rules: Vec<categories::SmartRule>) -> Result<(), String> {
    categories::save_rules(&rules)
}

#[tauri::command(async)]
fn scan_junk() -> Result<Vec<cleanup_ops::JunkLocation>, String> {
    Ok(cleanup_ops::scan_junk_locations())
}

#[tauri::command(async)]
fn clean_junk(selected_ids: Vec<String>) -> Result<cleanup_ops::CleanReport, String> {
    Ok(cleanup_ops::clean_junk_locations(&selected_ids))
}

#[tauri::command]
fn watch_get_status(app: AppHandle) -> watch_ops::WatchStatus {
    let mgr = app.state::<Arc<watch_ops::WatchManager>>();
    mgr.get_status()
}

#[tauri::command]
fn watch_set_active(app: AppHandle, active: bool) -> Result<bool, String> {
    let mgr = app.state::<Arc<watch_ops::WatchManager>>();
    mgr.set_active(active);
    let folders = mgr.get_folders();
    let _ = categories::save_watch_settings(&folders, active);
    Ok(active)
}

#[tauri::command]
fn watch_add_folder(app: AppHandle, folder: String) -> Result<Vec<String>, String> {
    let mgr = app.state::<Arc<watch_ops::WatchManager>>();
    let updated = mgr.add_folder(folder);
    let _ = categories::save_watch_settings(&updated, mgr.is_active());
    Ok(updated)
}

#[tauri::command]
fn watch_remove_folder(app: AppHandle, folder: String) -> Result<Vec<String>, String> {
    let mgr = app.state::<Arc<watch_ops::WatchManager>>();
    let updated = mgr.remove_folder(&folder);
    let _ = categories::save_watch_settings(&updated, mgr.is_active());
    Ok(updated)
}

#[tauri::command]
fn get_scheduled_tasks(app: AppHandle) -> Vec<schedule_ops::ScheduledTask> {
    let mgr = app.state::<Arc<schedule_ops::ScheduleManager>>();
    mgr.get_tasks()
}

#[tauri::command]
fn save_scheduled_task(app: AppHandle, task: schedule_ops::ScheduledTask) -> Result<(), String> {
    let mgr = app.state::<Arc<schedule_ops::ScheduleManager>>();
    mgr.add_or_update_task(task);
    categories::save_tasks(&mgr.get_tasks())
}

#[tauri::command]
fn delete_scheduled_task(app: AppHandle, id: String) -> Result<(), String> {
    let mgr = app.state::<Arc<schedule_ops::ScheduleManager>>();
    mgr.delete_task(&id);
    categories::save_tasks(&mgr.get_tasks())
}

#[tauri::command(async)]
fn run_scheduled_task_now(app: AppHandle, id: String) -> Result<String, String> {
    let mgr = app.state::<Arc<schedule_ops::ScheduleManager>>();
    let tasks = mgr.get_tasks();
    let task = tasks.iter().find(|t| t.id == id).cloned().ok_or("task not found")?;
    schedule_ops::execute_task(&task)
}

#[tauri::command]
fn get_task_history(app: AppHandle) -> Vec<schedule_ops::TaskRunResult> {
    let mgr = app.state::<Arc<schedule_ops::ScheduleManager>>();
    mgr.get_history()
}

#[tauri::command]
fn list_system_drives() -> Vec<disk_ops::DriveInfo> {
    disk_ops::list_drives()
}

#[tauri::command(async)]
fn check_app_updates() -> Result<update_ops::UpdateCheckResult, String> {
    // Never hardcode the version here: a stale literal makes the updater
    // compare GitHub's tag against the *previous* release and report "up to
    // date" forever. Cargo.toml / tauri.conf.json carry the real version.
    update_ops::check_for_updates(env!("CARGO_PKG_VERSION"))
}

#[tauri::command]
fn open_external_url(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    // Only ever hand http(s) links to the shell. `open_url` ends up in
    // ShellExecuteW, so a `file:///…exe` or `ms-settings:` string coming from
    // a release note could otherwise launch a local program.
    let lower = url.trim().to_ascii_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://")) {
        return Err("only http(s) links can be opened".into());
    }
    app.opener().open_url(&url, None::<&str>).map_err(|e| e.to_string())
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
        let mut total_bytes = 0u64;

        let mut top20: std::collections::BinaryHeap<std::cmp::Reverse<(u64, &PathBuf)>> =
            std::collections::BinaryHeap::with_capacity(21);
        let mut cat_counts = std::collections::HashMap::new();
        let mut cat_bytes = std::collections::HashMap::new();

        for (p, s) in &st.files {
            total_bytes += *s;
            let idx = cats.index_for_path(p);
            *cat_counts.entry(idx).or_insert(0u64) += 1;
            *cat_bytes.entry(idx).or_insert(0u64) += *s;

            if top20.len() < 20 {
                top20.push(std::cmp::Reverse((*s, p)));
            } else if let Some(min_top) = top20.peek() {
                if *s > min_top.0 .0 {
                    top20.pop();
                    top20.push(std::cmp::Reverse((*s, p)));
                }
            }
        }

        // `into_sorted_vec` on a heap of `Reverse` already yields descending
        // size — the list is rendered top-to-bottom as "largest files", so
        // reversing it here put the smallest file first.
        let largest_files: Vec<(String, u64)> = top20
            .into_sorted_vec()
            .into_iter()
            .map(|std::cmp::Reverse((s, p))| (p.to_string_lossy().into_owned(), s))
            .collect();

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
    let (saved_watch_folders, saved_watch_active) = categories::load_watch_settings();
    let watch_manager = Arc::new(watch_ops::WatchManager::new());
    watch_manager.set_folders(saved_watch_folders);
    watch_manager.set_active(saved_watch_active);

    let saved_tasks = categories::load_tasks();
    let schedule_manager = Arc::new(schedule_ops::ScheduleManager::new());
    schedule_manager.set_tasks(saved_tasks);

    let wm_loop = watch_manager.clone();
    let sm_loop = schedule_manager.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SharedScan::new(ScanState::default()))
        .manage(watch_manager)
        .manage(schedule_manager)
        .setup(move |app| {
            watch_ops::spawn_watch_loop(wm_loop, app.handle().clone());
            schedule_ops::spawn_schedule_loop(sm_loop, app.handle().clone());
            Ok(())
        })
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
            get_smart_rules,
            save_smart_rules,
            scan_junk,
            clean_junk,
            watch_get_status,
            watch_set_active,
            watch_add_folder,
            watch_remove_folder,
            get_scheduled_tasks,
            save_scheduled_task,
            delete_scheduled_task,
            run_scheduled_task_now,
            get_task_history,
            list_system_drives,
            check_app_updates,
            open_external_url,
            get_disk_stats,
            pdf_ops::pick_image_files,
            pdf_ops::pick_pdf_file,
            pdf_ops::pick_save_pdf,
            pdf_ops::pick_output_folder,
            pdf_ops::read_file_binary,
            pdf_ops::write_file_binary,
            pdf_ops::save_extracted_images,
            pdf_ops::open_in_file_manager,
            rename_ops::pick_files_for_rename,
            rename_ops::pick_folder_for_rename,
            rename_ops::execute_batch_rename,
            rename_ops::undo_last_rename,
            image_ops::pick_images_for_studio,
            image_ops::save_optimized_images
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
