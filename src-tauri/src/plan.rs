//! Sort plan construction: categorize walked files and map each to a
//! collision-free destination. Planning never touches the filesystem.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::categories::Categories;

/// One planned move. `source == destination` entries (already-in-place files)
/// are never emitted.
#[derive(serde::Serialize, Clone)]
pub struct PlannedMove {
    pub source: PathBuf,
    pub destination: PathBuf,
    pub category: String,
    pub size: u64,
    pub matched_rule: Option<String>,
}

#[derive(serde::Serialize, Default)]
pub struct SortPlan {
    pub root: PathBuf,
    pub output_dir: PathBuf,
    pub moves: Vec<PlannedMove>,
    pub total_moves: usize,
    /// Aggregate per category: index → count. Names come from `Categories`.
    pub counts: Vec<(String, u64)>,
    pub total_size: u64,
}

pub fn match_smart_rule(
    path: &Path,
    rules: &[crate::categories::SmartRule],
    valid_categories: &std::collections::HashSet<&str>,
) -> Option<(String, String)> {
    let stem = path.file_stem()?.to_string_lossy().to_lowercase();
    let tokens: Vec<&str> = stem
        .split(|c: char| !c.is_alphanumeric())
        .filter(|s| !s.is_empty())
        .collect();
    if tokens.is_empty() {
        return None;
    }
    let token_set: std::collections::HashSet<&str> = tokens.iter().copied().collect();
    let stem_norm = format!(" {} ", tokens.join(" "));

    for rule in rules {
        if !valid_categories.contains(rule.category.as_str()) {
            continue;
        }
        for kw in &rule.keywords {
            let kw_clean = kw.trim().to_lowercase();
            if kw_clean.is_empty() {
                continue;
            }
            if token_set.contains(kw_clean.as_str()) {
                return Some((rule.category.clone(), rule.name.clone()));
            }
            let kw_tokens: Vec<&str> = kw_clean
                .split(|c: char| !c.is_alphanumeric())
                .filter(|s| !s.is_empty())
                .collect();
            if kw_tokens.len() > 1 {
                let kw_norm = format!(" {} ", kw_tokens.join(" "));
                if stem_norm.contains(&kw_norm) {
                    return Some((rule.category.clone(), rule.name.clone()));
                }
            }
        }
    }
    None
}

/// Build the plan: every file goes to `root/sorted/<category>/`.
/// A file that is already in its destination directory is skipped.
/// Name collisions are resolved with `name (2).ext`, `name (3).ext`, … so
/// planning can never schedule an overwrite.
pub fn build_plan(
    root: &Path,
    files: &[(PathBuf, u64)],
    cats: &Categories,
) -> SortPlan {
    build_plan_with_rules(root, files, cats, &[])
}

pub fn build_plan_with_rules(
    root: &Path,
    files: &[(PathBuf, u64)],
    cats: &Categories,
    rules: &[crate::categories::SmartRule],
) -> SortPlan {
    let output_dir = root.join(crate::categories::OUTPUT_DIR);
    let mut plan = SortPlan {
        root: root.to_path_buf(),
        output_dir: output_dir.clone(),
        ..Default::default()
    };
    // Destination names already handed out inside each category dir.
    let mut used: HashMap<PathBuf, usize> = HashMap::new();
    let mut count_by_cat: HashMap<String, u64> = HashMap::new();
    let valid_cats: std::collections::HashSet<&str> = cats.names().iter().map(|s| s.as_str()).collect();

    for (path, size) in files {
        let (category, matched_rule) = if let Some((rule_cat, rule_name)) = match_smart_rule(path, rules, &valid_cats) {
            (rule_cat, Some(rule_name))
        } else {
            let idx = cats.index_for_path(path);
            (cats.name(idx).to_string(), None)
        };

        // A category key is user input: `Path::join` throws the output dir
        // away for an absolute name ("D:\\backup") and `..` climbs out of the
        // tree. Never let a plan move a file outside root/sorted.
        if !crate::paths::is_safe_component(&category) {
            continue;
        }

        let dest_dir = output_dir.join(&category);
        let file_name = match path.file_name() {
            Some(n) => n.to_os_string(),
            None => continue,
        };        let candidate = dest_dir.join(&file_name);
        // Loose file sitting exactly where it would be sorted: nothing to do.
        if path.parent() == Some(dest_dir.as_path()) {
            continue;
        }
        let final_dest = unique_destination(&candidate, &mut used);
        *count_by_cat.entry(category.clone()).or_insert(0) += 1;
        plan.total_size += size;
        plan.moves.push(PlannedMove {
            source: path.clone(),
            destination: final_dest,
            category,
            size: *size,
            matched_rule,
        });
    }

    plan.total_moves = plan.moves.len();
    plan.counts = cats
        .names()
        .iter()
        .filter_map(|name| count_by_cat.get(name).map(|c| (name.clone(), *c)))
        .collect();
    plan
}

/// `report.docx` → `report (2).docx` → `report (3).docx` … never colliding
/// with anything handed out before (both planned names and, in `execute`,
/// names that appeared on disk at execution time).
pub fn unique_destination(candidate: &Path, used: &mut HashMap<PathBuf, usize>) -> PathBuf {
    let n = used.entry(candidate.to_path_buf()).or_insert(0);
    *n += 1;
    let mut n = *n;
    if n == 1 {
        return candidate.to_path_buf();
    }
    let stem = candidate
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let ext = candidate
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    loop {
        let attempt = candidate.with_file_name(format!("{} ({}){}", stem, n, ext));
        let fresh = !used.contains_key(&attempt);
        used.insert(attempt.clone(), 1);
        if fresh {
            return attempt;
        }
        n += 1;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::categories::default_categories;

    fn cats() -> Categories {
        Categories::from_map(&default_categories())
    }

    #[test]
    fn plans_into_category_dirs_and_counts() {
        let root = Path::new("C:\\base");
        let files = vec![
            (PathBuf::from("C:\\base\\photo.jpg"), 10),
            (PathBuf::from("C:\\base\\doc.pdf"), 20),
            (PathBuf::from("C:\\base\\weird.xyz"), 5),
        ];
        let plan = build_plan(root, &files, &cats());
        assert_eq!(plan.moves.len(), 3);
        assert!(plan.moves[0].destination.starts_with(root.join("sorted").join("images")));
        assert!(plan.moves[1].destination.starts_with(root.join("sorted").join("documents")));
        let counts: HashMap<String, u64> = plan.counts.iter().cloned().collect();
        assert_eq!(counts["images"], 1);
        assert_eq!(counts["documents"], 1);
        assert_eq!(counts["others"], 1);
        assert_eq!(plan.total_size, 35);
    }

    #[test]
    fn name_collisions_get_parenthesized_suffixes_never_overwrite() {
        let root = Path::new("C:\\base");
        let files = vec![
            (PathBuf::from("C:\\base\\a\\note.txt"), 1),
            (PathBuf::from("C:\\base\\b\\note.txt"), 2),
            (PathBuf::from("C:\\base\\c\\note.txt"), 3),
        ];
        let plan = build_plan(root, &files, &cats());
        let dests: Vec<String> = plan
            .moves
            .iter()
            .map(|m| m.destination.file_name().unwrap().to_string_lossy().into_owned())
            .collect();
        assert_eq!(dests[0], "note.txt");
        assert_eq!(dests[1], "note (2).txt");
        assert_eq!(dests[2], "note (3).txt");
    }

    #[test]
    fn files_already_in_destination_are_skipped() {
        let root = Path::new("C:\\base");
        let files = vec![(
            PathBuf::from("C:\\base\\sorted\\images\\pic.png"),
            4,
        )];
        let plan = build_plan(root, &files, &cats());
        assert!(plan.moves.is_empty());
    }

    #[test]
    fn smart_rules_override_extension_and_match_stem() {
        let root = Path::new("C:\\base");
        let files = vec![
            (PathBuf::from("C:\\base\\invoice-2026-q1.png"), 100), // png normally -> images
            (PathBuf::from("C:\\base\\tax-return-draft.txt"), 200),
            (PathBuf::from("C:\\base\\ordinary-photo.png"), 300),
        ];
        let rules = vec![
            crate::categories::SmartRule {
                id: "r1".into(),
                name: "Financial Docs".into(),
                category: "documents".into(),
                keywords: vec!["invoice".into(), "tax".into()],
            },
        ];
        let plan = build_plan_with_rules(root, &files, &cats(), &rules);
        assert_eq!(plan.moves.len(), 3);
        // invoice-2026-q1.png should go to documents, not images
        assert_eq!(plan.moves[0].category, "documents");
        assert_eq!(plan.moves[0].matched_rule, Some("Financial Docs".into()));
        // tax-return-draft.txt should go to documents
        assert_eq!(plan.moves[1].category, "documents");
        assert_eq!(plan.moves[1].matched_rule, Some("Financial Docs".into()));
        // ordinary-photo.png should remain images
        assert_eq!(plan.moves[2].category, "images");
        assert_eq!(plan.moves[2].matched_rule, None);
    }
}

