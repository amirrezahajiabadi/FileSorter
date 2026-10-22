//! Auto-Update — queries GitHub Releases for updates, changelog, and direct download links.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub release_name: String,
    pub release_notes: String,
    pub published_at: String,
    pub download_url: String,
    pub html_url: String,
}

#[derive(Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    published_at: Option<String>,
    html_url: Option<String>,
    #[serde(default)]
    assets: Vec<GitHubAsset>,
}

fn parse_semver(v: &str) -> (u32, u32, u32) {
    let clean = v.trim().trim_start_matches('v');
    let mut parts = clean.split('.').filter_map(|s| s.parse::<u32>().ok());
    let maj = parts.next().unwrap_or(0);
    let min = parts.next().unwrap_or(0);
    let pat = parts.next().unwrap_or(0);
    (maj, min, pat)
}

pub fn is_newer_version(latest: &str, current: &str) -> bool {
    let l = parse_semver(latest);
    let c = parse_semver(current);
    l > c
}

pub fn check_for_updates(current_version: &str) -> Result<UpdateCheckResult, String> {
    let url = "https://api.github.com/repos/amirrezahajiabadi/FileSorter/releases/latest";

    // Call curl.exe with timeout
    let mut cmd = std::process::Command::new("curl.exe");
    cmd.args([
        "-s",
        "-m",
        "10",
        url,
        "-H",
        "User-Agent: FileSorter-Desktop",
        "-H",
        "Accept: application/vnd.github.v3+json",
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let output = cmd
        .output()
        .map_err(|e| format!("Failed to check for updates: {}", e))?;

    if !output.status.success() {
        return Err("GitHub release check returned a non-zero exit code".into());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let release: GitHubRelease = serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse release metadata: {}", e))?;

    let latest_tag = release.tag_name;
    let has_update = is_newer_version(&latest_tag, current_version);

    // Look for installer or portable asset
    let download_url = release
        .assets
        .iter()
        .find(|a| a.name.ends_with("_Setup.exe"))
        .or_else(|| release.assets.iter().find(|a| a.name.ends_with("_Portable.exe")))
        .or_else(|| release.assets.first())
        .map(|a| a.browser_download_url.clone())
        .unwrap_or_else(|| release.html_url.clone().unwrap_or_default());

    Ok(UpdateCheckResult {
        current_version: current_version.to_string(),
        latest_version: latest_tag,
        has_update,
        release_name: release.name.unwrap_or_default(),
        release_notes: release.body.unwrap_or_default(),
        published_at: release.published_at.unwrap_or_default(),
        download_url,
        html_url: release.html_url.unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_semver_compare() {
        assert!(is_newer_version("v6.6.0", "v6.5.0"));
        assert!(is_newer_version("6.6.0", "6.5.0"));
        assert!(is_newer_version("v7.0.0", "v6.9.9"));
        assert!(!is_newer_version("v6.5.0", "v6.5.0"));
        assert!(!is_newer_version("v6.4.0", "v6.5.0"));
    }
}
