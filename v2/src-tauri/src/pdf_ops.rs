//! PDF Studio helper operations: native file pickers, binary I/O, batch saving, and explorer opening.

use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Deserialize)]
pub struct ExtractedImage {
    pub filename: String,
    pub data: Vec<u8>,
}

#[derive(Serialize)]
pub struct SaveImagesReport {
    pub target_dir: String,
    pub saved_count: usize,
    pub total_bytes: u64,
    pub file_paths: Vec<String>,
}

#[tauri::command]
pub fn pick_image_files(app: AppHandle) -> Result<Option<Vec<String>>, String> {
    let paths = app
        .dialog()
        .file()
        .add_filter("Images (*.jpg, *.jpeg, *.png, *.webp, *.bmp, *.gif)", &["jpg", "jpeg", "png", "webp", "bmp", "gif"])
        .blocking_pick_files();
    Ok(paths.map(|list| list.into_iter().map(|p| p.to_string()).collect()))
}

#[tauri::command]
pub fn pick_pdf_file(app: AppHandle) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .add_filter("PDF Document (*.pdf)", &["pdf"])
        .blocking_pick_file();
    Ok(path.map(|p| p.to_string()))
}

#[tauri::command]
pub fn pick_save_pdf(app: AppHandle, default_name: Option<String>) -> Result<Option<String>, String> {
    let name = default_name.unwrap_or_else(|| "document.pdf".into());
    let path = app
        .dialog()
        .file()
        .add_filter("PDF Document (*.pdf)", &["pdf"])
        .set_file_name(&name)
        .blocking_save_file();
    Ok(path.map(|p| p.to_string()))
}

#[tauri::command]
pub fn pick_output_folder(app: AppHandle) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .blocking_pick_folder();
    Ok(path.map(|p| p.to_string()))
}

#[tauri::command]
pub fn read_file_binary(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| format!("Could not read {}: {}", path, e))
}

#[tauri::command]
pub fn write_file_binary(path: String, data: Vec<u8>) -> Result<u64, String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(p, &data).map_err(|e| e.to_string())?;
    Ok(data.len() as u64)
}

#[tauri::command]
pub fn save_extracted_images(target_dir: String, images: Vec<ExtractedImage>) -> Result<SaveImagesReport, String> {
    let target = Path::new(&target_dir);
    fs::create_dir_all(target).map_err(|e| format!("Failed to create folder {}: {}", target_dir, e))?;

    let mut saved_count = 0;
    let mut total_bytes = 0u64;
    let mut file_paths = Vec::new();

    for img in images {
        let dest = target.join(&img.filename);
        fs::write(&dest, &img.data).map_err(|e| format!("Failed writing {}: {}", dest.display(), e))?;
        total_bytes += img.data.len() as u64;
        saved_count += 1;
        file_paths.push(dest.to_string_lossy().into_owned());
    }

    Ok(SaveImagesReport {
        target_dir,
        saved_count,
        total_bytes,
        file_paths,
    })
}

#[tauri::command]
pub fn open_in_file_manager(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    #[cfg(target_os = "windows")]
    {
        if p.is_file() {
            std::process::Command::new("explorer")
                .args(["/select,", &path])
                .spawn()
                .map_err(|e| e.to_string())?;
        } else {
            std::process::Command::new("explorer")
                .arg(&path)
                .spawn()
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = p;
        Ok(())
    }
}
