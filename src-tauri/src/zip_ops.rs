//! Archive creation and extraction.
//!
//! Both directions are deliberately conservative:
//!
//! * creating writes to a sibling `.part` file and only renames it into place
//!   once the central directory is written, so a full disk or a crash never
//!   leaves a half-written archive where a good one used to be;
//! * extracting resolves every entry through [`is_safe_rel`] and refuses
//!   absolute paths, drive letters and `..` — the "zip slip" trick where an
//!   archive writes into `..\..\Windows` instead of its own folder.
//!
//! Neither operation touches existing user data, so neither needs an undo
//! journal: a created archive is a new file, and extraction only writes files
//! it was explicitly allowed to write.

use std::collections::HashSet;
use std::fs::{self, File};
use std::io;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

#[derive(Deserialize, Clone, Debug)]
pub struct CreateRequest {
    /// Files and/or folders to archive.
    pub sources: Vec<String>,
    /// Target `.zip` path (`FileSorter.zip` is appended when missing).
    pub destination: String,
    /// Optional anchor: entries are stored relative to it. Defaults to the
    /// deepest folder that contains every source, so a picked folder keeps its
    /// own name and files from one folder sit at the archive root.
    #[serde(default)]
    pub base: Option<String>,
    #[serde(default)]
    pub overwrite: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct CreateReport {
    pub files: u64,
    pub bytes: u64,
    pub destination: String,
    pub skipped: u64,
}

#[derive(Deserialize, Clone, Debug)]
pub struct ExtractRequest {
    pub archive: String,
    pub destination: String,
    #[serde(default)]
    pub overwrite: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct ExtractReport {
    pub files: u64,
    pub bytes: u64,
    pub skipped: u64,
    pub skipped_examples: Vec<String>,
    pub destination: String,
}

/// True only for a relative path made of ordinary components. The zip crate's
/// `enclosed_name` already does this; the extra check keeps the guarantee in
/// one place a reader can audit, and covers names built by hand in tests.
pub fn is_safe_rel(rel: &Path) -> bool {
    if rel.as_os_str().is_empty() {
        return false;
    }
    rel.components()
        .all(|c| matches!(c, Component::Normal(_) | Component::CurDir))
}

fn common_ancestor(paths: &[PathBuf]) -> Option<PathBuf> {
    let mut iter = paths.iter();
    let first = iter.next()?;
    let mut base: Vec<std::ffi::OsString> = first
        .components()
        .map(|c| c.as_os_str().to_os_string())
        .collect();
    for p in iter {
        let comps: Vec<std::ffi::OsString> =
            p.components().map(|c| c.as_os_str().to_os_string()).collect();
        let mut n = 0;
        while n < base.len() && n < comps.len() && base[n] == comps[n] {
            n += 1;
        }
        base.truncate(n);
        if base.is_empty() {
            break;
        }
    }
    Some(base.iter().collect())
}

/// Entry name inside the archive: relative to `base`, forward slashes, no
/// leading `./`.
fn entry_name(base: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(base).ok()?;
    if !is_safe_rel(rel) {
        return None;
    }
    let name = rel
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => Some(s.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/");
    if name.is_empty() {
        None
    } else {
        Some(name)
    }
}

fn normalize_destination(raw: &str) -> PathBuf {
    let path = PathBuf::from(raw.trim());
    match path.extension() {
        Some(ext) if ext.eq_ignore_ascii_case("zip") => path,
        _ => {
            let mut name = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| "archive".into());
            name.push_str(".zip");
            path.with_file_name(name)
        }
    }
}

fn add_file(
    writer: &mut ZipWriter<File>,
    path: &Path,
    name: &str,
    written: &mut HashSet<String>,
    report: &mut CreateReport,
) -> Result<(), String> {
    if !written.insert(name.to_string()) {
        // Overlapping sources (a folder plus one of its files) would otherwise
        // store the same file twice.
        report.skipped += 1;
        return Ok(());
    }
    let mut file = match File::open(path) {
        Ok(f) => f,
        Err(_) => {
            report.skipped += 1;
            return Ok(());
        }
    };
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);
    writer
        .start_file(name, options)
        .map_err(|e| format!("could not add {}: {}", name, e))?;
    let bytes = io::copy(&mut file, writer).map_err(|e| format!("could not write {}: {}", name, e))?;
    report.files += 1;
    report.bytes += bytes;
    Ok(())
}

pub fn create(req: &CreateRequest) -> Result<CreateReport, String> {
    if req.sources.is_empty() {
        return Err("choose at least one file or folder".into());
    }
    let dest = normalize_destination(&req.destination);
    if dest.exists() && !req.overwrite {
        return Err(format!("{} already exists", dest.display()));
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("could not create {}: {}", parent.display(), e))?;
    }

    // Every top-level source is anchored at its parent so a picked folder keeps
    // its own name in the archive and a picked file sits at the root.
    let sources: Vec<PathBuf> = req
        .sources
        .iter()
        .map(|s| PathBuf::from(s.trim()))
        .filter(|p| p.exists())
        .collect();
    if sources.is_empty() {
        return Err("none of the chosen items still exist".into());
    }
    let base = match &req.base {
        Some(b) if !b.trim().is_empty() => PathBuf::from(b.trim()),
        _ => {
            let anchors: Vec<PathBuf> = sources
                .iter()
                .map(|p| {
                    if p.is_dir() {
                        p.parent().unwrap_or(p).to_path_buf()
                    } else {
                        p.parent().unwrap_or(p).to_path_buf()
                    }
                })
                .collect();
            common_ancestor(&anchors).unwrap_or_else(|| PathBuf::from("/"))
        }
    };

    let partial = {
        let mut name = dest
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| "archive.zip".into());
        name.push_str(".part");
        dest.with_file_name(name)
    };
    let _ = fs::remove_file(&partial);

    let mut report = CreateReport {
        files: 0,
        bytes: 0,
        destination: dest.to_string_lossy().into_owned(),
        skipped: 0,
    };
    let mut written: HashSet<String> = HashSet::new();

    let result = (|| -> Result<(), String> {
        let file = File::create(&partial).map_err(|e| format!("could not create archive: {}", e))?;
        let mut writer = ZipWriter::new(file);

        for source in &sources {
            if source.is_dir() {
                for (path, _) in crate::search_ops::walk_files(source, true) {
                    let Some(name) = entry_name(&base, &path) else {
                        report.skipped += 1;
                        continue;
                    };
                    if path == dest {
                        report.skipped += 1;
                        continue;
                    }
                    add_file(&mut writer, &path, &name, &mut written, &mut report)?;
                }
            } else {
                // A symlink is a pointer, not the file the user picked; storing
                // its target would silently pull in something unexpected.
                let is_symlink = fs::symlink_metadata(source)
                    .map(|m| m.file_type().is_symlink())
                    .unwrap_or(false);
                if is_symlink {
                    report.skipped += 1;
                    continue;
                }
                let Some(name) = entry_name(&base, source) else {
                    report.skipped += 1;
                    continue;
                };
                add_file(&mut writer, source, &name, &mut written, &mut report)?;
            }
        }

        if report.files == 0 {
            return Err("nothing to archive: the chosen items hold no files".into());
        }
        writer.finish().map_err(|e| format!("could not finish archive: {}", e))?;
        Ok(())
    })();

    if let Err(e) = result {
        let _ = fs::remove_file(&partial);
        return Err(e);
    }

    // The archive is complete, so replacing the old file is now safe.
    if dest.exists() {
        fs::remove_file(&dest).map_err(|e| format!("could not replace {}: {}", dest.display(), e))?;
    }
    fs::rename(&partial, &dest).map_err(|e| {
        let _ = fs::remove_file(&partial);
        format!("could not save {}: {}", dest.display(), e)
    })?;

    Ok(report)
}

pub fn extract(req: &ExtractRequest) -> Result<ExtractReport, String> {
    let archive_path = Path::new(req.archive.trim());
    if !archive_path.is_file() {
        return Err("the archive is not available".into());
    }
    let dest = PathBuf::from(req.destination.trim());
    fs::create_dir_all(&dest).map_err(|e| format!("could not create {}: {}", dest.display(), e))?;
    // Canonical destination is the boundary every extracted path must stay in.
    let dest_abs = dest.canonicalize().map_err(|e| e.to_string())?;

    let file = File::open(archive_path).map_err(|e| format!("could not open archive: {}", e))?;
    let mut archive = ZipArchive::new(file).map_err(|e| format!("not a valid zip archive: {}", e))?;

    let mut report = ExtractReport {
        files: 0,
        bytes: 0,
        skipped: 0,
        skipped_examples: Vec::new(),
        destination: dest_abs.to_string_lossy().into_owned(),
    };

    for i in 0..archive.len() {
        let mut entry = match archive.by_index(i) {
            Ok(e) => e,
            Err(e) => {
                report.skipped += 1;
                if report.skipped_examples.len() < 20 {
                    report.skipped_examples.push(format!("entry {}: {}", i, e));
                }
                continue;
            }
        };
        let Some(rel) = entry.enclosed_name() else {
            report.skipped += 1;
            if report.skipped_examples.len() < 20 {
                report.skipped_examples.push(format!("{} — unsafe path", entry.name()));
            }
            continue;
        };
        if !is_safe_rel(&rel) {
            report.skipped += 1;
            continue;
        }
        let target = dest_abs.join(&rel);
        if !target.starts_with(&dest_abs) {
            report.skipped += 1;
            continue;
        }

        if entry.is_dir() {
            let _ = fs::create_dir_all(&target);
            continue;
        }
        if target.exists() && !req.overwrite {
            report.skipped += 1;
            if report.skipped_examples.len() < 20 {
                report.skipped_examples.push(format!("{} — already exists", rel.display()));
            }
            continue;
        }
        if let Some(parent) = target.parent() {
            if fs::create_dir_all(parent).is_err() {
                report.skipped += 1;
                continue;
            }
        }
        match File::create(&target) {
            Ok(mut out) => match io::copy(&mut entry, &mut out) {
                Ok(bytes) => {
                    report.files += 1;
                    report.bytes += bytes;
                }
                Err(_) => {
                    // Never leave a truncated file where a good one could be.
                    let _ = fs::remove_file(&target);
                    report.skipped += 1;
                }
            },
            Err(_) => report.skipped += 1,
        }
    }

    Ok(report)
}

#[tauri::command]
pub fn pick_files_for_zip(app: AppHandle) -> Result<Option<Vec<String>>, String> {
    let paths = app.dialog().file().blocking_pick_files();
    Ok(paths.map(|list| list.into_iter().map(|p| p.to_string()).collect()))
}

#[tauri::command]
pub fn pick_folder_for_zip(app: AppHandle) -> Result<Option<String>, String> {
    Ok(app.dialog().file().blocking_pick_folder().map(|p| p.to_string()))
}

#[tauri::command]
pub fn pick_save_zip(app: AppHandle, default_name: Option<String>) -> Result<Option<String>, String> {
    let name = default_name.unwrap_or_else(|| "FileSorter.zip".into());
    let path = app
        .dialog()
        .file()
        .add_filter("Zip archive (*.zip)", &["zip"])
        .set_file_name(&name)
        .blocking_save_file();
    Ok(path.map(|p| p.to_string()))
}

#[tauri::command]
pub fn pick_zip_archive(app: AppHandle) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("Zip archive (*.zip)", &["zip"])
        .blocking_pick_file();
    Ok(path.map(|p| p.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make(files: &[(&str, &[u8])]) -> tempfile::TempDir {
        let base = tempfile::tempdir().unwrap();
        for (rel, data) in files {
            let p = base.path().join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(&p, data).unwrap();
        }
        base
    }

    fn names(archive: &Path) -> Vec<String> {
        let mut zip = ZipArchive::new(File::open(archive).unwrap()).unwrap();
        (0..zip.len())
            .map(|i| zip.by_index(i).unwrap().name().to_string())
            .collect()
    }

    #[test]
    fn roundtrip_keeps_structure_and_bytes() {
        let base = make(&[("photos/a.jpg", b"aaa"), ("photos/sub/b.png", b"bbbb")]);
        let work = tempfile::tempdir().unwrap();
        let zip_path = work.path().join("out.zip");

        let report = create(&CreateRequest {
            sources: vec![base.path().join("photos").to_string_lossy().into_owned()],
            destination: zip_path.to_string_lossy().into_owned(),
            base: None,
            overwrite: false,
        })
        .unwrap();
        assert_eq!(report.files, 2);
        assert_eq!(report.bytes, 7);
        assert!(zip_path.exists());

        let mut entries = names(&zip_path);
        entries.sort();
        assert_eq!(entries, vec!["photos/a.jpg", "photos/sub/b.png"]);

        let out = tempfile::tempdir().unwrap();
        let extracted = extract(&ExtractRequest {
            archive: zip_path.to_string_lossy().into_owned(),
            destination: out.path().to_string_lossy().into_owned(),
            overwrite: false,
        })
        .unwrap();
        assert_eq!(extracted.files, 2);
        assert_eq!(fs::read(out.path().join("photos").join("sub").join("b.png")).unwrap(), b"bbbb");
    }

    #[test]
    fn loose_files_from_one_folder_sit_at_the_root() {
        let base = make(&[("one.txt", b"1"), ("two.txt", b"2")]);
        let work = tempfile::tempdir().unwrap();
        let zip_path = work.path().join("files.zip");
        create(&CreateRequest {
            sources: vec![
                base.path().join("one.txt").to_string_lossy().into_owned(),
                base.path().join("two.txt").to_string_lossy().into_owned(),
            ],
            destination: zip_path.to_string_lossy().into_owned(),
            base: None,
            overwrite: false,
        })
        .unwrap();
        let mut entries = names(&zip_path);
        entries.sort();
        assert_eq!(entries, vec!["one.txt", "two.txt"]);
    }

    #[test]
    fn destination_is_never_overwritten_silently() {
        let base = make(&[("a.txt", b"a")]);
        let work = tempfile::tempdir().unwrap();
        let zip_path = work.path().join("keep.zip");
        fs::write(&zip_path, b"existing").unwrap();

        let req = CreateRequest {
            sources: vec![base.path().join("a.txt").to_string_lossy().into_owned()],
            destination: zip_path.to_string_lossy().into_owned(),
            base: None,
            overwrite: false,
        };
        assert!(create(&req).is_err());
        assert_eq!(fs::read(&zip_path).unwrap(), b"existing");

        let report = create(&CreateRequest { overwrite: true, ..req }).unwrap();
        assert_eq!(report.files, 1);
        assert_eq!(names(&zip_path), vec!["a.txt"]);
    }

    #[test]
    fn a_missing_extension_becomes_zip() {
        let base = make(&[("a.txt", b"a")]);
        let work = tempfile::tempdir().unwrap();
        let raw = work.path().join("backup");
        let report = create(&CreateRequest {
            sources: vec![base.path().join("a.txt").to_string_lossy().into_owned()],
            destination: raw.to_string_lossy().into_owned(),
            base: None,
            overwrite: false,
        })
        .unwrap();
        assert!(report.destination.ends_with("backup.zip"));
        assert!(work.path().join("backup.zip").exists());
    }

    #[test]
    fn extraction_needs_permission_to_replace_a_file() {
        let base = make(&[("a.txt", b"new")]);
        let work = tempfile::tempdir().unwrap();
        let zip_path = work.path().join("x.zip");
        create(&CreateRequest {
            sources: vec![base.path().join("a.txt").to_string_lossy().into_owned()],
            destination: zip_path.to_string_lossy().into_owned(),
            base: None,
            overwrite: false,
        })
        .unwrap();

        let out = tempfile::tempdir().unwrap();
        fs::write(out.path().join("a.txt"), b"old").unwrap();
        let report = extract(&ExtractRequest {
            archive: zip_path.to_string_lossy().into_owned(),
            destination: out.path().to_string_lossy().into_owned(),
            overwrite: false,
        })
        .unwrap();
        assert_eq!(report.files, 0);
        assert_eq!(report.skipped, 1);
        assert_eq!(fs::read(out.path().join("a.txt")).unwrap(), b"old");

        let report = extract(&ExtractRequest {
            archive: zip_path.to_string_lossy().into_owned(),
            destination: out.path().to_string_lossy().into_owned(),
            overwrite: true,
        })
        .unwrap();
        assert_eq!(report.files, 1);
        assert_eq!(fs::read(out.path().join("a.txt")).unwrap(), b"new");
    }

    #[test]
    fn traversal_names_are_rejected() {
        assert!(is_safe_rel(Path::new("a/b.txt")));
        assert!(!is_safe_rel(Path::new("")));
        assert!(!is_safe_rel(Path::new("../evil.txt")));
        assert!(!is_safe_rel(Path::new("a/../../evil.txt")));
        assert!(!is_safe_rel(Path::new("/etc/passwd")));
        #[cfg(windows)]
        assert!(!is_safe_rel(Path::new("C:\\Windows\\system32\\x.dll")));
        // A name the zip crate already refused never reaches a writer either.
        assert!(entry_name(Path::new("C:\\dest"), Path::new("C:\\dest\\..\\evil")).is_none());
    }

    #[test]
    fn an_empty_selection_is_an_error() {
        let work = tempfile::tempdir().unwrap();
        let err = create(&CreateRequest {
            sources: vec![],
            destination: work.path().join("e.zip").to_string_lossy().into_owned(),
            base: None,
            overwrite: false,
        })
        .unwrap_err();
        assert!(err.contains("at least one"), "{err}");
    }

    #[test]
    fn a_folder_with_no_files_leaves_no_partial_archive() {
        let base = tempfile::tempdir().unwrap();
        fs::create_dir_all(base.path().join("empty").join("deeper")).unwrap();
        let work = tempfile::tempdir().unwrap();
        let zip_path = work.path().join("empty.zip");
        let err = create(&CreateRequest {
            sources: vec![base.path().join("empty").to_string_lossy().into_owned()],
            destination: zip_path.to_string_lossy().into_owned(),
            base: None,
            overwrite: false,
        })
        .unwrap_err();
        assert!(err.contains("nothing to archive"), "{err}");
        assert!(!zip_path.exists());
        let leftovers = fs::read_dir(work.path()).unwrap().count();
        assert_eq!(leftovers, 0, "the .part file must be cleaned up");
    }
}
