//! Path-safety helpers.
//!
//! Every name that reaches the filesystem from outside the process — a
//! category key from the settings UI, a batch-rename target, an extracted
//! image name — is just a string until something proves it is one ordinary
//! path component. `Path::join` silently drops the base when given an
//! absolute path (`base.join("D:\\x") == "D:\\x"`), and `..\\..` climbs out
//! of the tree, so an unvalidated name can move or overwrite files anywhere
//! on the disk. All callers go through [`is_safe_component`] /
//! [`safe_file_name`] instead.

use std::path::{Component, Path};

/// Characters Windows rejects in a file name (plus the control range).
fn is_forbidden(c: char) -> bool {
    matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || c.is_control()
}

const RESERVED_STEMS: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// True when `name` is exactly one ordinary path component: no separators, no
/// drive/UNC prefix, no `.`/`..`, no Windows-reserved characters or device
/// names, and no trailing dot/space.
pub fn is_safe_component(name: &str) -> bool {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return false;
    }
    if trimmed.chars().any(is_forbidden) {
        return false;
    }
    if trimmed.ends_with('.') || trimmed.ends_with(' ') {
        return false;
    }
    // `components()` is the authority on what Windows considers a separator:
    // exactly one `Normal` component means "a plain name", while `..`, `C:\x`
    // and `\\server\share` all produce something else.
    let mut components = Path::new(trimmed).components();
    if !matches!(components.next(), Some(Component::Normal(_))) || components.next().is_some() {
        return false;
    }
    let stem = trimmed.split('.').next().unwrap_or("").to_ascii_uppercase();
    !RESERVED_STEMS.contains(&stem.as_str())
}

/// Turn a caller-supplied file name into something safe to write inside a
/// chosen folder: directory parts are dropped, forbidden characters replaced,
/// and `None` means "nothing usable left".
pub fn safe_file_name(name: &str) -> Option<String> {
    let base = Path::new(name).file_name()?.to_string_lossy().into_owned();
    let cleaned: String = base
        .chars()
        .map(|c| if is_forbidden(c) { '_' } else { c })
        .collect();
    let cleaned = cleaned.trim().trim_end_matches('.').trim_end().to_string();
    if cleaned.is_empty() || !is_safe_component(&cleaned) {
        return None;
    }
    Some(cleaned)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_plain_names() {
        for name in ["images", "Work Docs", "invoice-1403.pdf", "file (2).txt", ".gitignore"] {
            assert!(is_safe_component(name), "{name} should be allowed");
        }
    }

    #[test]
    fn rejects_traversal_absolute_and_reserved_names() {
        for name in [
            "",
            "   ",
            ".",
            "..",
            "..\\..\\Users",
            "../../etc",
            "sub/file.txt",
            "C:\\Windows",
            "\\\\server\\share",
            "D:backup",
            "bad:name",
            "trailing.",
            "CON",
            "lpt1.txt",
        ] {
            assert!(!is_safe_component(name), "{name:?} must be rejected");
        }
    }

    #[test]
    fn safe_file_name_strips_directories_and_bad_chars() {
        assert_eq!(safe_file_name("..\\evil\\photo.jpg").as_deref(), Some("photo.jpg"));
        assert_eq!(safe_file_name("page?.png").as_deref(), Some("page_.png"));
        assert_eq!(safe_file_name("   "), None);
        assert_eq!(safe_file_name("../"), None);
    }
}
