//! Scheduled Tasks — automated periodic background tasks (junk cleanup, folder sorting).

use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::cleanup_ops;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduledTask {
    pub id: String,
    pub name: String,
    pub kind: String, // "junk" | "sort"
    pub folder: Option<String>,
    pub interval_minutes: u64,
    pub enabled: bool,
    pub last_run: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskRunResult {
    pub task_id: String,
    pub task_name: String,
    pub success: bool,
    pub summary: String,
    pub timestamp: u64,
}

pub struct ScheduleManager {
    tasks: Mutex<Vec<ScheduledTask>>,
    history: Mutex<Vec<TaskRunResult>>,
}

impl Default for ScheduleManager {
    fn default() -> Self {
        Self::new()
    }
}

impl ScheduleManager {
    pub fn new() -> Self {
        Self {
            tasks: Mutex::new(Vec::new()),
            history: Mutex::new(Vec::new()),
        }
    }

    pub fn set_tasks(&self, tasks: Vec<ScheduledTask>) {
        *self.tasks.lock().unwrap() = tasks;
    }

    pub fn get_tasks(&self) -> Vec<ScheduledTask> {
        self.tasks.lock().unwrap().clone()
    }

    pub fn add_or_update_task(&self, task: ScheduledTask) {
        let mut list = self.tasks.lock().unwrap();
        if let Some(pos) = list.iter().position(|t| t.id == task.id) {
            list[pos] = task;
        } else {
            list.push(task);
        }
    }

    pub fn delete_task(&self, id: &str) -> bool {
        let mut list = self.tasks.lock().unwrap();
        let initial_len = list.len();
        list.retain(|t| t.id != id);
        list.len() < initial_len
    }

    pub fn record_history(&self, res: TaskRunResult) {
        let mut h = self.history.lock().unwrap();
        if h.len() >= 50 {
            h.remove(0);
        }
        h.push(res);
    }

    pub fn get_history(&self) -> Vec<TaskRunResult> {
        self.history.lock().unwrap().clone()
    }
}

pub fn execute_task(task: &ScheduledTask) -> Result<String, String> {
    match task.kind.as_str() {
        "junk" => {
            let locations = vec!["user_temp".to_string(), "crash_dumps".to_string(), "thumbnails".to_string()];
            let rep = cleanup_ops::clean_junk_locations(&locations);
            Ok(format!(
                "Cleaned {} files ({:.2} MB freed)",
                rep.files_deleted,
                rep.bytes_freed as f64 / 1_048_576.0
            ))
        }
        "sort" => {
            let Some(folder) = &task.folder else {
                return Err("folder path is required for sort task".into());
            };
            let path = std::path::Path::new(folder);
            if !path.is_dir() {
                return Err(format!("folder not found: {}", folder));
            }
            // Auto sort loose files in folder
            let cats_map = crate::categories::load_categories();
            let cats = crate::categories::Categories::from_map(&cats_map);
            let rules = crate::categories::load_rules();

            let mut files = Vec::new();
            if let Ok(entries) = std::fs::read_dir(path) {
                for entry in entries.flatten() {
                    if let Ok(ft) = entry.file_type() {
                        if ft.is_file() {
                            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
                            files.push((entry.path(), size));
                        }
                    }
                }
            }

            if files.is_empty() {
                return Ok("No loose files to sort".into());
            }

            let plan = crate::plan::build_plan_with_rules(path, &files, &cats, &rules);
            let stop = crate::walk::StopFlag::new();
            let rep = crate::execute::execute(&plan, &stop, &|_, _| {})?;
            Ok(format!("Sorted {} files to categories", rep.moved))
        }
        other => Err(format!("unknown task kind: {}", other)),
    }
}

pub fn spawn_schedule_loop(manager: Arc<ScheduleManager>, app: AppHandle) {
    std::thread::spawn(move || {
        loop {
            std::thread::sleep(Duration::from_secs(30));

            let tasks = manager.get_tasks();
            let now = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_secs())
                .unwrap_or(0);

            for mut task in tasks {
                if !task.enabled {
                    continue;
                }

                let interval_secs = task.interval_minutes.max(1) * 60;
                let last = task.last_run.unwrap_or(0);

                if now >= last.saturating_add(interval_secs) {
                    // Due for run!
                    let run_res = execute_task(&task);
                    task.last_run = Some(now);
                    manager.add_or_update_task(task.clone());
                    let _ = crate::categories::save_tasks(&manager.get_tasks());

                    let (success, summary) = match run_res {
                        Ok(msg) => (true, msg),
                        Err(e) => (false, e),
                    };

                    let res_item = TaskRunResult {
                        task_id: task.id.clone(),
                        task_name: task.name.clone(),
                        success,
                        summary: summary.clone(),
                        timestamp: now,
                    };

                    manager.record_history(res_item.clone());
                    let _ = app.emit("scheduled-task-done", res_item);
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_schedule_manager() {
        let mgr = ScheduleManager::new();
        let t = ScheduledTask {
            id: "t1".into(),
            name: "Test Cleanup".into(),
            kind: "junk".into(),
            folder: None,
            interval_minutes: 60,
            enabled: true,
            last_run: None,
        };
        mgr.add_or_update_task(t);
        assert_eq!(mgr.get_tasks().len(), 1);
        assert!(mgr.delete_task("t1"));
        assert_eq!(mgr.get_tasks().len(), 0);
    }
}
