//! Parallel directory walk over the `ignore` crate with a shared stop flag.
//!
//! Files are streamed to the caller through an mpsc channel and cut into
//! batches of at least `min_batch` items or [`BATCH_INTERVAL`] milliseconds,
//! whichever comes first — the UI gets a steady ~150ms heartbeat instead of a
//! per-file event storm. The sorter's own output directory is pruned from the
//! walk, symlinks are never followed, and unreadable/vanished entries are
//! skipped silently (same policy as v1).

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::channel;
use std::sync::Arc;
use std::time::{Duration, Instant};

use ignore::WalkBuilder;

/// Target interval between batches handed to the UI.
pub const BATCH_INTERVAL: Duration = Duration::from_millis(150);

/// One slice of scan results plus the running file count so far.
pub struct WalkBatch {
    pub files: Vec<(PathBuf, u64)>,
    /// Total files yielded across all batches up to and including this one.
    pub total_so_far: u64,
    pub done: bool,
}

/// Cooperative cancellation shared between the UI thread and the walkers.
#[derive(Clone, Default)]
pub struct StopFlag(Arc<AtomicBool>);

impl StopFlag {
    pub fn new() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }
    pub fn stop(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
    pub fn is_stopped(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
}

#[derive(Clone, Default)]
pub struct WalkOptions {
    /// Respect `.gitignore`/`.ignore` files under the root.
    pub respect_gitignore: bool,
    /// Skip hidden files and dot-directories (`.git`, …).
    pub skip_hidden: bool,
}

enum WalkMsg {
    File(PathBuf, u64),
    Done(u64),
}

fn spawn_walk(root: PathBuf, exclude_dir: Option<PathBuf>, opts: &WalkOptions, stop: StopFlag) -> std::sync::mpsc::Receiver<WalkMsg> {
    let (tx, rx) = channel::<WalkMsg>();
    let mut builder = WalkBuilder::new(&root);
    builder.follow_links(false);
    builder.git_ignore(opts.respect_gitignore);
    builder.hidden(opts.skip_hidden);
    if let Some(exclude) = exclude_dir {
        builder.filter_entry(move |entry| entry.path() != exclude.as_path());
    }

    std::thread::spawn(move || {
        let mut total: u64 = 0;
        for entry in builder.build() {
            if stop.is_stopped() {
                break;
            }
            let Ok(entry) = entry else { continue };
            // `ignore` reports the root itself; skip it.
            if entry.depth() == 0 {
                continue;
            }
            let Ok(meta) = entry.metadata() else { continue };
            if !meta.is_file() {
                continue; // directories, symlinks to dirs, …
            }
            total += 1;
            if tx.send(WalkMsg::File(entry.path().to_path_buf(), meta.len())).is_err() {
                break; // receiver gone — caller dropped the walk
            }
        }
        let _ = tx.send(WalkMsg::Done(total));
    });
    rx
}

/// Collect loose files under `root` into time/bulk batches. Returns after the
/// walk completes or `stop` is raised (the final batch carries `done: true`).
pub fn collect_files(
    root: &Path,
    exclude_dir: Option<&Path>,
    opts: &WalkOptions,
    stop: &StopFlag,
    min_batch: usize,
) -> Vec<WalkBatch> {
    let rx = spawn_walk(root.to_path_buf(), exclude_dir.map(|p| p.to_path_buf()), opts, stop.clone());
    let mut batches = Vec::new();
    let mut current: Vec<(PathBuf, u64)> = Vec::with_capacity(min_batch);
    let mut last_flush = Instant::now();
    let mut emitted: u64 = 0; // files already placed into previous batches

    for msg in rx {
        match msg {
            WalkMsg::File(path, size) => {
                current.push((path, size));
                if current.len() >= min_batch || last_flush.elapsed() >= BATCH_INTERVAL {
                    emitted += current.len() as u64;
                    batches.push(WalkBatch {
                        files: std::mem::take(&mut current),
                        total_so_far: emitted,
                        done: false,
                    });
                    last_flush = Instant::now();
                }
            }
            WalkMsg::Done(total) => {
                if !current.is_empty() || batches.is_empty() {
                    emitted += current.len() as u64;
                    batches.push(WalkBatch { files: current, total_so_far: emitted.max(total), done: true });
                } else if let Some(last) = batches.last_mut() {
                    last.done = true;
                }
                return batches;
            }
        }
    }
    // Sender dropped without Done (walker thread panicked) — still return what we have.
    if !current.is_empty() || batches.is_empty() {
        emitted += current.len() as u64;
        batches.push(WalkBatch { files: current, total_so_far: emitted, done: true });
    }
    batches
}

/// Normalize a scan root: canonicalized absolute path that must be a directory.
pub fn normalize_root(root: &Path) -> Result<PathBuf, String> {
    let root = root
        .canonicalize()
        .map_err(|e| format!("پوشه در دسترس نیست: {}", e))?;
    if !root.is_dir() {
        return Err("مسیر داده‌شده یک پوشه نیست".into());
    }
    Ok(root)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch(dir: &Path, rel: &str, bytes: &[u8]) -> PathBuf {
        let p = dir.join(rel);
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, bytes).unwrap();
        p
    }

    #[test]
    fn finds_all_files_and_reports_sizes() {
        let tmp = tempfile::tempdir().unwrap();
        touch(tmp.path(), "a.txt", b"hello");
        touch(tmp.path(), "sub/b.bin", &[0u8; 10]);
        touch(tmp.path(), "sub/deep/c.log", b"x");

        let batches = collect_files(tmp.path(), None, &WalkOptions::default(), &StopFlag::new(), 2);
        let all: Vec<_> = batches.iter().flat_map(|b| b.files.iter().cloned()).collect();
        assert_eq!(all.len(), 3);
        let total: u64 = all.iter().map(|(_, s)| *s).sum();
        assert_eq!(total, 16);
        assert!(batches.last().unwrap().done);
    }

    #[test]
    fn excludes_output_dir_and_never_follows_links() {
        let tmp = tempfile::tempdir().unwrap();
        touch(tmp.path(), "keep.txt", b"1");
        touch(tmp.path(), "sorted/images/old.jpg", b"2");
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink("/", tmp.path().join("loop")).unwrap();
        }

        let sorted = tmp.path().join("sorted");
        let batches = collect_files(tmp.path(), Some(&sorted), &WalkOptions::default(), &StopFlag::new(), 1);
        let all: Vec<_> = batches.iter().flat_map(|b| b.files.iter().cloned()).collect();
        assert_eq!(all.len(), 1, "only keep.txt; sorted/ pruned");
    }

    #[test]
    fn stop_flag_halts_the_walk() {
        let tmp = tempfile::tempdir().unwrap();
        for i in 0..200 {
            touch(tmp.path(), &format!("f{}.txt", i), b"data");
        }
        let stop = StopFlag::new();
        stop.stop();
        let batches = collect_files(tmp.path(), None, &WalkOptions::default(), &stop, 1);
        // Stopped before starting: zero or few files, but it must return.
        assert!(batches.iter().flat_map(|b| b.files.iter()).count() < 200);
    }

    #[test]
    fn normalize_rejects_missing_paths() {
        let tmp = tempfile::tempdir().unwrap();
        let missing = tmp.path().join("nope");
        assert!(normalize_root(&missing).is_err());
        assert!(normalize_root(tmp.path()).is_ok());
    }
}
