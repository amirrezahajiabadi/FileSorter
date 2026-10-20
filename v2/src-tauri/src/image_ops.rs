//! Image Studio operations: image file picking, batch export, and optimization reporting.

use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[derive(Deserialize)]
pub struct ProcessedImagePayload {
    pub original_path: String,
    pub output_filename: String,
    pub data: Vec<u8>,
}

#[derive(Serialize)]
pub struct ImageOptimizationReport {
    pub target_dir: String,
    pub saved_count: usize,
    pub original_total_bytes: u64,
    pub new_total_bytes: u64,
    pub saved_bytes: i64,
}

#[tauri::command]
pub fn pick_images_for_studio(app: AppHandle) -> Result<Option<Vec<String>>, String> {
    let paths = app
        .dialog()
        .file()
        .add_filter(
            "Images (*.jpg, *.jpeg, *.png, *.webp, *.bmp, *.gif, *.avif)",
            &["jpg", "jpeg", "png", "webp", "bmp", "gif", "avif"],
        )
        .blocking_pick_files();
    Ok(paths.map(|list| list.into_iter().map(|p| p.to_string()).collect()))
}

#[tauri::command]
pub fn save_optimized_images(
    target_dir: String,
    images: Vec<ProcessedImagePayload>,
) -> Result<ImageOptimizationReport, String> {
    let target = Path::new(&target_dir);
    fs::create_dir_all(target).map_err(|e| format!("Failed to create folder {}: {}", target_dir, e))?;

    let mut saved_count = 0;
    let mut original_total_bytes = 0u64;
    let mut new_total_bytes = 0u64;

    for item in images {
        if let Ok(meta) = fs::metadata(&item.original_path) {
            original_total_bytes += meta.len();
        }

        let dest = target.join(&item.output_filename);
        fs::write(&dest, &item.data)
            .map_err(|e| format!("Failed to save {}: {}", dest.display(), e))?;

        new_total_bytes += item.data.len() as u64;
        saved_count += 1;
    }

    let saved_bytes = (original_total_bytes as i64) - (new_total_bytes as i64);

    Ok(ImageOptimizationReport {
        target_dir,
        saved_count,
        original_total_bytes,
        new_total_bytes,
        saved_bytes,
    })
}
