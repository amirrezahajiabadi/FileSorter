//! Global file search over a folder, with metadata filters.
//!
//! The sort pipeline only ever looks at one scanned folder and only ever asks
//! "where does this file belong?". This module answers the other question —
//! "where is the file I am thinking of?" — across a whole tree, without
//! loading every path into the UI first.
//!
//! Matching is against the file *name* by default; a query that contains a
//! path separator is matched against the relative path instead, so
//! `invoices/2024` narrows to that folder. Three modes share one walk: plain
//! case-insensitive substring, regular expression, and `*` / `?` glob. Every
//! filter (extension, size, modified time, hidden files) is applied before a
//! file can become a hit, and the walk stops as soon as `max_results` is
//! reached rather than hashing the rest of the disk.

use std::path::{Path, PathBuf};
use std::time::{Instant, UNIX_EPOCH};

use ignore::WalkBuilder;
use regex::RegexBuilder;
use serde::{Deserialize, Serialize};

use crate::walk::StopFlag;

#[derive(Deserialize, Clone, Debug)]
pub struct SearchRequest {
    pub root: String,
    #[serde(default)]
    pub query: String,
    /// `contains` (default) | `regex` | `glob`
    #[serde(default)]
    pub mode: String,
    /// Extension filters such as `jpg`, `.PNG` or `*.pdf`; empty means any.
    #[serde(default)]
    pub extensions: Vec<String>,
    #[serde(default)]
    pub min_bytes: Option<u64>,
    #[serde(default)]
    pub max_bytes: Option<u64>,
    #[serde(default)]
    pub modified_after_ms: Option<u64>,
    #[serde(default)]
    pub modified_before_ms: Option<u64>,
    #[serde(default)]
    pub include_hidden: bool,
    #[serde(default)]
    pub case_sensitive: bool,
    #[serde(default)]
    pub max_results: Option<usize>,
}

#[derive(Serialize, Clone, Debug)]
pub struct SearchHit {
    pub path: String,
    pub name: String,
    pub folder: String,
    pub size: u64,
    pub modified_ms: u64,
    pub ext: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct SearchReport {
    pub root: String,
    pub hits: Vec<SearchHit>,
    pub scanned: u64,
    pub truncated: bool,
    pub elapsed_ms: u64,
    pub mode: String,
}

const DEFAULT_MAX_RESULTS: usize = 500;
const HARD_MAX_RESULTS: usize = 5_000;

enum Matcher {
    Contains(String),
    Regex(Box<regex::Regex>),
    /// Glob patterns are lower-cased up front; matching is case-insensitive
    /// unless `case_sensitive` flipped the haystack back to its real case.
    Glob(String),
}

impl Matcher {
    fn matches(&self, haystack: &str) -> bool {
        match self {
            Matcher::Contains(needle) => haystack.contains(needle),
            Matcher::Regex(re) => re.is_match(haystack),
            Matcher::Glob(pattern) => glob_match(pattern, haystack),
        }
    }
}

fn compile_matcher(req: &SearchRequest) -> Result<Matcher, String> {
    let query = req.query.trim();
    if query.is_empty() {
        // An empty query is legal when filters carry the search (e.g. all
        // `.psd` files above 100 MB); `contains("")` matches every name.
        return Ok(Matcher::Contains(String::new()));
    }
    match req.mode.as_str() {
        "regex" => {
            let re = RegexBuilder::new(query)
                .case_insensitive(!req.case_sensitive)
                .size_limit(1 << 20)
                .build()
                .map_err(|e| format!("Invalid regular expression: {}", e))?;
            Ok(Matcher::Regex(Box::new(re)))
        }
        "glob" => {
            let pattern = if req.case_sensitive {
                query.to_string()
            } else {
                query.to_lowercase()
            };
            Ok(Matcher::Glob(pattern))
        }
        _ => Ok(Matcher::Contains(if req.case_sensitive {
            query.to_string()
        } else {
            query.to_lowercase()
        })),
    }
}

/// Wildcard matcher with `*` (any run, including none) and `?` (one character).
/// A classic backtracking scan: linear in practice, and it cannot blow the
/// stack the way a recursive matcher does on `*a*a*a*`.
fn glob_match(pattern: &str, text: &str) -> bool {
    let p: Vec<char> = pattern.to_lowercase().chars().collect();
    let t: Vec<char> = text.to_lowercase().chars().collect();
    let (mut pi, mut ti) = (0usize, 0usize);
    let mut star: Option<usize> = None;
    let mut star_ti = 0usize;

    while ti < t.len() {
        if pi < p.len() && (p[pi] == '?' || p[pi] == t[ti]) {
            pi += 1;
            ti += 1;
        } else if pi < p.len() && p[pi] == '*' {
            star = Some(pi);
            star_ti = ti;
            pi += 1;
        } else if let Some(s) = star {
            pi = s + 1;
            star_ti += 1;
            ti = star_ti;
        } else {
            return false;
        }
    }
    while pi < p.len() && p[pi] == '*' {
        pi += 1;
    }
    pi == p.len()
}

/// `*.JPG` and `.png` both mean "jpg"/"png"; the filter works on the last
/// extension, which is what a user typing a category name expects.
fn normalize_ext(raw: &str) -> Option<String> {
    let trimmed = raw.trim().trim_start_matches("*.").trim_start_matches('.').trim();
    if trimmed.is_empty() {
        return None;
    }
    Some(trimmed.to_ascii_lowercase())
}

fn extension_of(name: &str) -> String {
    match name.rfind('.') {
        // A leading dot is a hidden name, not an extension (".gitignore").
        Some(i) if i > 0 => name[i + 1..].to_ascii_lowercase(),
        _ => String::new(),
    }
}

fn modified_ms(meta: &std::fs::Metadata) -> u64 {
    meta.modified()
        .ok()
        .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn relative_slash(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

pub fn search(req: &SearchRequest, stop: &StopFlag) -> Result<SearchReport, String> {
    let started = Instant::now();
    let root = Path::new(&req.root);
    if !root.is_dir() {
        return Err("choose a folder to search".into());
    }

    let matcher = compile_matcher(req)?;
    let mut wanted_exts: Vec<String> = req.extensions.iter().filter_map(|e| normalize_ext(e)).collect();
    wanted_exts.sort();
    wanted_exts.dedup();

    let limit = req
        .max_results
        .unwrap_or(DEFAULT_MAX_RESULTS)
        .clamp(1, HARD_MAX_RESULTS);

    // A query with a separator is about location, not just the name.
    let haystack_is_path = req.query.contains('/') || req.query.contains('\\');

    let mut builder = WalkBuilder::new(root);
    builder
        .follow_links(false)
        .git_ignore(false)
        .git_global(false)
        .git_exclude(false)
        .ignore(false)
        .parents(false)
        .hidden(!req.include_hidden);

    let mut hits: Vec<SearchHit> = Vec::new();
    let mut scanned: u64 = 0;
    let mut truncated = false;

    for entry in builder.build() {
        if stop.is_stopped() {
            break;
        }
        let Ok(entry) = entry else { continue };
        if entry.depth() == 0 {
            continue; // the root itself
        }
        let Some(ft) = entry.file_type() else { continue };
        if !ft.is_file() {
            continue;
        }
        scanned += 1;
        let Ok(meta) = entry.metadata() else { continue };

        if let Some(min) = req.min_bytes {
            if meta.len() < min {
                continue;
            }
        }
        if let Some(max) = req.max_bytes {
            if meta.len() > max {
                continue;
            }
        }
        let mtime = modified_ms(&meta);
        if let Some(after) = req.modified_after_ms {
            if mtime < after {
                continue;
            }
        }
        if let Some(before) = req.modified_before_ms {
            if mtime > before {
                continue;
            }
        }

        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        let ext = extension_of(&name);
        if !wanted_exts.is_empty() && !wanted_exts.iter().any(|w| *w == ext) {
            continue;
        }

        let haystack = if haystack_is_path {
            relative_slash(root, path)
        } else {
            name.clone()
        };
        let haystack = if req.case_sensitive || matches!(matcher, Matcher::Regex(_)) {
            haystack
        } else {
            haystack.to_lowercase()
        };
        if !matcher.matches(&haystack) {
            continue;
        }

        hits.push(SearchHit {
            path: path.to_string_lossy().into_owned(),
            name,
            folder: path
                .parent()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_default(),
            size: meta.len(),
            modified_ms: mtime,
            ext,
        });
        if hits.len() >= limit {
            truncated = true;
            break;
        }
    }

    // Newest first: a search is usually about "the file I just had".
    hits.sort_by(|a, b| b.modified_ms.cmp(&a.modified_ms).then_with(|| a.path.cmp(&b.path)));

    Ok(SearchReport {
        root: root.to_string_lossy().into_owned(),
        hits,
        scanned,
        truncated,
        elapsed_ms: started.elapsed().as_millis() as u64,
        mode: if req.mode.is_empty() { "contains".into() } else { req.mode.clone() },
    })
}

/// Every file under `root` (used by tests and by the compare panel's summary).
pub fn walk_files(root: &Path, include_hidden: bool) -> Vec<(PathBuf, u64)> {
    let mut builder = WalkBuilder::new(root);
    builder
        .follow_links(false)
        .git_ignore(false)
        .git_global(false)
        .git_exclude(false)
        .ignore(false)
        .parents(false)
        .hidden(!include_hidden);
    let mut out = Vec::new();
    for entry in builder.build().flatten() {
        if entry.depth() == 0 {
            continue;
        }
        if let (Some(ft), Ok(meta)) = (entry.file_type(), entry.metadata()) {
            if ft.is_file() {
                out.push((entry.path().to_path_buf(), meta.len()));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tree() -> tempfile::TempDir {
        let base = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(base.path().join("invoices").join("2024")).unwrap();
        std::fs::write(base.path().join("Photo.JPG"), vec![7u8; 2000]).unwrap();
        std::fs::write(base.path().join("a.txt"), b"hello").unwrap();
        std::fs::write(base.path().join("invoices").join("2024").join("march.pdf"), vec![1u8; 500]).unwrap();
        std::fs::write(base.path().join(".secret.txt"), b"hidden").unwrap();
        base
    }

    fn req(root: &Path, query: &str) -> SearchRequest {
        SearchRequest {
            root: root.to_string_lossy().into_owned(),
            query: query.to_string(),
            mode: "contains".into(),
            extensions: vec![],
            min_bytes: None,
            max_bytes: None,
            modified_after_ms: None,
            modified_before_ms: None,
            include_hidden: false,
            case_sensitive: false,
            max_results: None,
        }
    }

    #[test]
    fn contains_is_case_insensitive_and_skips_hidden_files() {
        let base = tree();
        let report = search(&req(base.path(), "photo"), &StopFlag::new()).unwrap();
        assert_eq!(report.hits.len(), 1);
        assert_eq!(report.hits[0].name, "Photo.JPG");
        assert_eq!(report.hits[0].ext, "jpg");
        assert_eq!(report.hits[0].size, 2000);
        assert!(!report.truncated);
        // Three visible files; the hidden one is never scanned.
        assert_eq!(report.scanned, 3);
    }

    #[test]
    fn hidden_files_appear_only_when_asked_for() {
        let base = tree();
        let mut r = req(base.path(), "secret");
        assert!(search(&r, &StopFlag::new()).unwrap().hits.is_empty());
        r.include_hidden = true;
        assert_eq!(search(&r, &StopFlag::new()).unwrap().hits.len(), 1);
    }

    #[test]
    fn regex_mode_reports_invalid_patterns() {
        let base = tree();
        let mut r = req(base.path(), "^Photo\\.(jpg|png)$");
        r.mode = "regex".into();
        let report = search(&r, &StopFlag::new()).unwrap();
        assert_eq!(report.hits.len(), 1);

        r.query = "Photo(".into();
        let err = search(&r, &StopFlag::new()).unwrap_err();
        assert!(err.to_lowercase().contains("regex"), "{err}");
    }

    #[test]
    fn glob_mode_matches_wildcards() {
        let base = tree();
        let mut r = req(base.path(), "pho*");
        r.mode = "glob".into();
        assert_eq!(search(&r, &StopFlag::new()).unwrap().hits.len(), 1);

        r.query = "?.txt".into();
        // a.txt matches; .secret.txt starts with a dot so it does not.
        assert_eq!(search(&r, &StopFlag::new()).unwrap().hits.len(), 1);
        assert!(glob_match("*", ""));
        assert!(!glob_match("a?c", "ab"));
        assert!(glob_match("a*b*c", "aXXbYYc"));
    }

    #[test]
    fn filters_narrow_by_extension_and_size() {
        let base = tree();
        let mut r = req(base.path(), "");
        r.extensions = vec!["*.PDF".into()];
        let report = search(&r, &StopFlag::new()).unwrap();
        assert_eq!(report.hits.len(), 1);
        assert!(report.hits[0].path.ends_with("march.pdf"));

        r.extensions.clear();
        r.min_bytes = Some(1000);
        let report = search(&r, &StopFlag::new()).unwrap();
        assert_eq!(report.hits.len(), 1);
        assert_eq!(report.hits[0].name, "Photo.JPG");

        r.min_bytes = None;
        r.max_bytes = Some(1);
        assert!(search(&r, &StopFlag::new()).unwrap().hits.is_empty());
    }

    #[test]
    fn a_query_with_a_separator_matches_the_relative_path() {
        let base = tree();
        let report = search(&req(base.path(), "invoices/2024"), &StopFlag::new()).unwrap();
        assert_eq!(report.hits.len(), 1);
        assert!(report.hits[0].path.ends_with("march.pdf"));
        // The hit's folder is absolute, so the panel can reveal it.
        assert!(report.hits[0].folder.contains("invoices"));
    }

    #[test]
    fn time_filters_exclude_old_files() {
        let base = tree();
        let mut r = req(base.path(), "");
        r.modified_before_ms = Some(1);
        assert!(search(&r, &StopFlag::new()).unwrap().hits.is_empty());
        r.modified_before_ms = None;
        r.modified_after_ms = Some(0);
        assert_eq!(search(&r, &StopFlag::new()).unwrap().hits.len(), 3);
    }

    #[test]
    fn result_limit_truncates_instead_of_walking_everything() {
        let base = tree();
        let mut r = req(base.path(), "");
        r.max_results = Some(2);
        let report = search(&r, &StopFlag::new()).unwrap();
        assert_eq!(report.hits.len(), 2);
        assert!(report.truncated);
    }

    #[test]
    fn a_missing_root_is_an_error() {
        let base = tempfile::tempdir().unwrap();
        assert!(search(&req(&base.path().join("nope"), "x"), &StopFlag::new()).is_err());
    }

    #[test]
    fn stop_flag_halts_the_walk() {
        let base = tempfile::tempdir().unwrap();
        for i in 0..50 {
            std::fs::write(base.path().join(format!("f{i}.txt")), b"x").unwrap();
        }
        let stop = StopFlag::new();
        stop.stop();
        let report = search(&req(base.path(), ""), &stop).unwrap();
        assert!(report.hits.is_empty());
    }
}
