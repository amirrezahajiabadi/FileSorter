//! Watch Mode — background directory watcher that auto-sorts arriving files.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{Duration, SystemTime};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::categories::{self, Categories};
use crate::plan;

pub type Fingerprint = (u64, u64); // (mtime_secs, size_bytes)
pub type DirSnapshot = HashMap<String, Fingerprint>;

/// How long a file's mtime must be in the past before Watch Mode touches it.
///
/// A name that just appeared may still be open for writing (Office, a video
/// exporter, a sync client). Moving it mid-write either fails the rename or,
/// on the copy fallback, captures a truncated file — so wait one poll window
/// for the writer to finish.
const SETTLE_SECS: u64 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchEventPayload {
    pub folder: String,
    pub filename: String,
    pub category: String,
    pub action: String, // "moved" | "failed" | "skipped"
    pub timestamp: u64,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchStatus {
    pub active: bool,
    pub folders: Vec<String>,
    pub recent_events: Vec<WatchEventPayload>,
}

pub struct WatchManager {
    active: AtomicBool,
    folders: RwLock<Vec<String>>,
    snapshots: Mutex<HashMap<String, DirSnapshot>>,
    recent_events: Mutex<Vec<WatchEventPayload>>,
}

impl Default for WatchManager {
    fn default() -> Self {
        Self::new()
    }
}

impl WatchManager {
    pub fn new() -> Self {
        Self {
            active: AtomicBool::new(false),
            folders: RwLock::new(Vec::new()),
            snapshots: Mutex::new(HashMap::new()),
            recent_events: Mutex::new(Vec::new()),
        }
    }

    pub fn is_active(&self) -> bool {
        self.active.load(Ordering::Relaxed)
    }

    pub fn set_active(&self, active: bool) {
        self.active.store(active, Ordering::Relaxed);
    }

    pub fn get_folders(&self) -> Vec<String> {
        self.folders.read().unwrap().clone()
    }

    pub fn set_folders(&self, folders: Vec<String>) {
        *self.folders.write().unwrap() = folders;
    }

    pub fn add_folder(&self, folder: String) -> Vec<String> {
        let mut list = self.folders.write().unwrap();
        if !list.contains(&folder) {
            list.push(folder);
        }
        list.clone()
    }

    pub fn remove_folder(&self, folder: &str) -> Vec<String> {
        let mut list = self.folders.write().unwrap();
        list.retain(|f| f != folder);
        list.clone()
    }

    pub fn get_status(&self) -> WatchStatus {
        WatchStatus {
            active: self.is_active(),
            folders: self.get_folders(),
            recent_events: self.recent_events.lock().unwrap().clone(),
        }
    }

    pub fn record_event(&self, event: WatchEventPayload) {
        let mut events = self.recent_events.lock().unwrap();
        if events.len() >= 100 {
            events.remove(0);
        }
        events.push(event);
    }
}

pub fn snapshot_folder(dir: &Path) -> DirSnapshot {
    let mut snap = HashMap::new();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return snap,
    };

    for entry in entries.flatten() {
        if let Ok(ft) = entry.file_type() {
            if ft.is_file() {
                if let Ok(meta) = entry.metadata() {
                    let mtime = meta
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs())
                        .unwrap_or(0);
                    let size = meta.len();
                    let name = entry.file_name().to_string_lossy().to_string();
                    snap.insert(name, (mtime, size));
                }
            }
        }
    }
    snap
}

pub fn is_transient_or_download(name: &str) -> bool {
    let lower = name.to_lowercase();
    if lower.ends_with(".crdownload")
        || lower.ends_with(".part")
        || lower.ends_with(".tmp")
        || lower.ends_with(".download")
        || lower.ends_with(".!ut")
        || lower.ends_with(".aria2")
    {
        return true;
    }
    if name.starts_with("~$") || name.starts_with(".~") {
        return true;
    }
    false
}

pub fn spawn_watch_loop(manager: Arc<WatchManager>, app: AppHandle) {
    std::thread::spawn(move || {
        let mut cached_cats: Option<Categories> = None;
        let mut cached_rules = Vec::new();
        let mut loop_count: usize = 0;

        loop {
            std::thread::sleep(Duration::from_secs(2));

            if !manager.is_active() {
                continue;
            }

            let folders = manager.get_folders();
            if folders.is_empty() {
                continue;
            }

            if cached_cats.is_none() || loop_count % 15 == 0 {
                let cats_map = categories::load_categories();
                cached_cats = Some(Categories::from_map(&cats_map));
                cached_rules = categories::load_rules();
            }
            loop_count = loop_count.wrapping_add(1);

            let cats = cached_cats.as_ref().unwrap();
            let rules = &cached_rules;

            for folder_str in folders {
                let folder_path = PathBuf::from(&folder_str);
                if !folder_path.is_dir() {
                    continue;
                }

                let mut current_snap = snapshot_folder(&folder_path);

                let prev_snap = {
                    let lock = manager.snapshots.lock().unwrap();
                    lock.get(&folder_str).cloned()
                };

                let Some(prev) = prev_snap else {
                    // First snapshot: record and don't auto-move legacy files unless new
                    let mut lock = manager.snapshots.lock().unwrap();
                    lock.insert(folder_str.clone(), current_snap);
                    continue;
                };

                // Find newly added files
                let mut moved_names = Vec::new();
                // Names that must not enter the snapshot this round: still
                // being written, or the move failed. Dropping them means the
                // next poll sees them as new and retries, instead of silently
                // blacklisting a locked file forever.
                let mut retry_names = Vec::new();
                let now_secs = SystemTime::now()
                    .duration_since(SystemTime::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                for (name, fp) in &current_snap {
                    if is_transient_or_download(name) {
                        continue;
                    }
                    if !prev.contains_key(name) {
                        if now_secs.saturating_sub(fp.0) < SETTLE_SECS {
                            retry_names.push(name.clone());
                            continue;
                        }
                        // New file detected!
                        let source_file = folder_path.join(name);
                        let file_size = fp.1;
                        let files = vec![(source_file.clone(), file_size)];

                        let plan = plan::build_plan_with_rules(&folder_path, &files, cats, rules);
                        if let Some(mv) = plan.moves.first() {
                            let mut action = "moved".to_string();
                            let mut err_msg = None;

                            let dest = crate::execute::take_unique_on_disk(mv.destination.clone());
                            if let Some(parent) = dest.parent() {
                                let _ = fs::create_dir_all(parent);
                            }

                            if let Err(e) = fs::rename(&mv.source, &dest) {
                                // Try copy & remove — but only delete the source
                                // once the copy is verified to be complete.
                                match fs::copy(&mv.source, &dest) {
                                    Ok(_) => {
                                        let src_len = fs::metadata(&mv.source).map(|m| m.len()).ok();
                                        let dst_len = fs::metadata(&dest).map(|m| m.len()).ok();
                                        if src_len.is_some() && src_len == dst_len {
                                            match fs::remove_file(&mv.source) {
                                                Ok(_) => moved_names.push(name.clone()),
                                                Err(rm_err) => {
                                                    action = "failed".to_string();
                                                    err_msg = Some(format!("delete after copy: {}", rm_err));
                                                }
                                            }
                                        } else {
                                            let _ = fs::remove_file(&dest);
                                            action = "failed".to_string();
                                            err_msg = Some("incomplete copy — source kept".to_string());
                                        }
                                    }
                                    Err(copy_err) => {
                                        action = "failed".to_string();
                                        err_msg = Some(format!("rename: {}, copy: {}", e, copy_err));
                                    }
                                }
                            } else {
                                moved_names.push(name.clone());
                            }

                            let event = WatchEventPayload {
                                folder: folder_str.clone(),
                                filename: name.clone(),
                                category: mv.category.clone(),
                                action: action.clone(),
                                timestamp: SystemTime::now()
                                    .duration_since(SystemTime::UNIX_EPOCH)
                                    .map(|d| d.as_secs())
                                    .unwrap_or(0),
                                error: err_msg,
                            };

                            manager.record_event(event.clone());
                            let _ = app.emit("watch-event", event);
                            if action != "moved" {
                                retry_names.push(name.clone());
                            }
                        }
                    }
                }

                // Remove handled files from the snapshot (they are gone from
                // disk now) and retry candidates (so the next poll re-detects
                // them) before storing it.
                for name in moved_names {
                    current_snap.remove(&name);
                }
                for name in retry_names {
                    current_snap.remove(&name);
                }

                {
                    let mut lock = manager.snapshots.lock().unwrap();
                    lock.insert(folder_str, current_snap);
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_snapshot_and_manager() {
        let tmp = tempfile::tempdir().unwrap();
        let f1 = tmp.path().join("doc1.pdf");
        fs::write(&f1, b"sample pdf").unwrap();

        let snap = snapshot_folder(tmp.path());
        assert!(snap.contains_key("doc1.pdf"));

        let mgr = WatchManager::new();
        mgr.set_active(true);
        assert!(mgr.is_active());

        mgr.add_folder(tmp.path().to_string_lossy().to_string());
        assert_eq!(mgr.get_folders().len(), 1);

        mgr.remove_folder(&tmp.path().to_string_lossy().to_string());
        assert_eq!(mgr.get_folders().len(), 0);
    }
}
