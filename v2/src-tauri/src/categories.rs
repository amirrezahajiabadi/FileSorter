//! Category definitions and settings persistence.
//!
//! Mirrors the v1 default categories exactly so the two editions agree on
//! behavior. The user-editable map lives in
//! `%APPDATA%\FileSorterV2\settings.json`; [`Categories`] is the immutable,
//! lookup-optimized snapshot built from that map for one scan run.

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

/// The sorter's own output folder (never scanned, never planned).
pub const OUTPUT_DIR: &str = "sorted";
/// Where detected duplicates are moved instead of being deleted, so every
/// operation stays undoable.
pub const DUPES_DIR: &str = ".filesorter-duplicates";

pub type CategoryMap = BTreeMap<String, Vec<String>>;

pub fn default_categories() -> CategoryMap {
    CategoryMap::from([
        ("images".into(), vec![".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".svg", ".webp", ".heic", ".raw", ".ico"].into_iter().map(String::from).collect()),
        ("documents".into(), vec![".pdf", ".doc", ".docx", ".txt", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".rtf", ".csv"].into_iter().map(String::from).collect()),
        ("videos".into(), vec![".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v"].into_iter().map(String::from).collect()),
        ("audio".into(), vec![".mp3", ".wav", ".aac", ".flac", ".ogg", ".m4a", ".wma"].into_iter().map(String::from).collect()),
        ("archives".into(), vec![".zip", ".rar", ".tar", ".gz", ".7z", ".bz2", ".xz"].into_iter().map(String::from).collect()),
        ("code".into(), vec![".py", ".js", ".ts", ".html", ".css", ".java", ".cpp", ".c", ".cs", ".go", ".rs", ".php", ".rb", ".swift", ".kt"].into_iter().map(String::from).collect()),
        ("data".into(), vec![".json", ".xml", ".yaml", ".yml", ".sql", ".db", ".sqlite", ".parquet"].into_iter().map(String::from).collect()),
        ("ebooks".into(), vec![".epub", ".mobi", ".azw", ".fb2"].into_iter().map(String::from).collect()),
        ("executables".into(), vec![".exe", ".msi", ".dmg", ".deb", ".rpm", ".sh", ".bat", ".ps1"].into_iter().map(String::from).collect()),
        ("fonts".into(), vec![".ttf", ".otf", ".woff", ".woff2"].into_iter().map(String::from).collect()),
        ("others".into(), vec![]),
    ])
}

#[derive(serde::Serialize, serde::Deserialize)]
struct SettingsFile {
    categories: CategoryMap,
}

/// `%APPDATA%\FileSorterV2` — overridable with [`set_data_dir`] (tests).
pub fn data_dir() -> PathBuf {
    if let Some(dir) = DATA_DIR_OVERRIDE.read().unwrap().as_ref() {
        return dir.clone();
    }
    let base = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(std::env::var("USERPROFILE").unwrap_or_default()));
    base.join("FileSorterV2")
}

static DATA_DIR_OVERRIDE: std::sync::RwLock<Option<PathBuf>> = std::sync::RwLock::new(None);

/// Point the settings/undo/cache dirs at `dir` (tests only; process-global,
/// so tests that use it must hold [`env_lock`]).
#[cfg(test)]
pub fn set_data_dir(dir: PathBuf) {
    *DATA_DIR_OVERRIDE.write().unwrap() = Some(dir);
}

/// Serialize the process-global data-dir override across parallel tests.
#[cfg(test)]
pub fn env_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());
    LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn settings_path() -> PathBuf {
    data_dir().join("settings.json")
}

pub fn load_categories() -> CategoryMap {
    match fs::read_to_string(settings_path()) {
        Ok(text) => match serde_json::from_str::<SettingsFile>(&text) {
            Ok(file) if file.categories.contains_key("others") => file.categories,
            _ => default_categories(),
        },
        Err(_) => default_categories(),
    }
}

pub fn save_categories(map: &CategoryMap) -> Result<(), String> {
    if !map.contains_key("others") {
        return Err("دستهٔ «others» باید وجود داشته باشد".into());
    }
    let dir = data_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let tmp = dir.join("settings.json.tmp");
    let json = serde_json::to_string_pretty(&SettingsFile {
        categories: map.clone(),
    })
    .map_err(|e| e.to_string())?;
    fs::write(&tmp, json).map_err(|e| e.to_string())?;
    fs::rename(&tmp, settings_path()).map_err(|e| e.to_string())?;
    Ok(())
}

/// Immutable snapshot: extension (lowercased, with dot) → dense category index.
pub struct Categories {
    names: Vec<String>,
    lookup: std::collections::HashMap<String, u8>,
    others: u8,
}

impl Categories {
    pub fn from_map(map: &CategoryMap) -> Self {
        let mut names = Vec::new();
        let mut lookup = std::collections::HashMap::new();
        let mut others = 0u8;
        for (i, (name, exts)) in map.iter().enumerate() {
            let idx = i as u8;
            if name == "others" {
                others = idx;
            }
            names.push(name.clone());
            for ext in exts {
                lookup.insert(ext.to_lowercase(), idx);
            }
        }
        Self { names, lookup, others }
    }

    /// Index for a file path; unknown or missing extension → `others`.
    pub fn index_for_path(&self, path: &std::path::Path) -> u8 {
        let ext = path
            .extension()
            .map(|e| format!(".{}", e.to_string_lossy().to_lowercase()))
            .unwrap_or_default();
        self.lookup.get(&ext).copied().unwrap_or(self.others)
    }

    pub fn name(&self, idx: u8) -> &str {
        &self.names[idx as usize]
    }

    // Used by tests and kept available for future callers.
    #[allow(dead_code)]
    pub fn others_index(&self) -> u8 {
        self.others
    }

    /// All category names in their configured order (planning uses this to
    /// report per-category counts).
    pub fn names(&self) -> &[String] {
        &self.names
    }

    #[allow(dead_code)]
    pub fn len(&self) -> usize {
        self.names.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_cover_common_extensions() {
        let cats = Categories::from_map(&default_categories());
        // Extension lookup must be case-insensitive.
        assert_eq!(
            cats.index_for_path(std::path::Path::new("x/photo.JPG")),
            cats.index_for_path(std::path::Path::new("x/photo.jpg"))
        );
        assert!(cats.len() >= 10);
    }

    #[test]
    fn unknown_extension_falls_back_to_others() {
        let cats = Categories::from_map(&default_categories());
        let others = cats.others_index();
        assert_eq!(cats.index_for_path(std::path::Path::new("file.zzzz")), others);
        assert_eq!(cats.index_for_path(std::path::Path::new("noext")), others);
    }

    #[test]
    fn save_load_roundtrip_and_validation() {
        let _guard = env_lock();
        let dir = tempfile::tempdir().unwrap();
        set_data_dir(dir.path().to_path_buf());
        let mut map = default_categories();
        map.get_mut("images").unwrap().push(".avif".to_string());
        save_categories(&map).unwrap();
        assert_eq!(load_categories().get("images").unwrap().last().unwrap(), ".avif");

        map.remove("others");
        assert!(save_categories(&map).is_err());
    }
}
