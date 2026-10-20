export interface I18nStrings {
  app_title: string;
  app_subtitle: string;
  reset_folder: string;
  theme_dark: string;
  theme_light: string;
  tab_sort: string;
  tab_dupes: string;
  tab_disk: string;
  tab_settings: string;
  hero_title: string;
  hero_subtitle: string;
  hero_drop_btn: string;
  hero_selected: string;
  hero_scanning: string;
  hero_files_found: string;
  hero_stop: string;
  summary_files: string;
  summary_size: string;
  summary_categories: string;
  btn_sort_now: string;
  btn_sorting: string;
  btn_rescan: string;
  btn_show_moves: string;
  btn_hide_moves: string;
  btn_undo: string;
  undo_success: string;
  undo_skipped: string;
  sort_done_title: string;
  sort_done_desc: string;
  dupes_title: string;
  dupes_desc: string;
  dupes_btn_scan: string;
  dupes_btn_scanning: string;
  dupes_reclaimable: string;
  dupes_keep_oldest: string;
  dupes_keep_newest: string;
  dupes_btn_quarantine: string;
  dupes_empty: string;
  dupes_quarantine_done: string;
  disk_title: string;
  disk_desc: string;
  disk_total_files: string;
  disk_total_size: string;
  disk_category_breakdown: string;
  disk_largest_files: string;
  disk_col_name: string;
  disk_col_size: string;
  disk_col_path: string;
  disk_loading: string;
  disk_pick_first: string;
  settings_title: string;
  settings_desc: string;
  settings_cat_title: string;
  settings_cat_desc: string;
  settings_btn_save: string;
  settings_btn_reset: string;
  settings_saved_notice: string;
  settings_reset_notice: string;
  settings_add_placeholder: string;
  settings_add_btn: string;
  settings_formats_count: string;
  footer_text: string;
  footer_journal: string;
}

export const STRINGS: I18nStrings = {
  app_title: "FileSorter v2",
  app_subtitle: "Ultra-fast file organizer powered by Rust & Tauri",
  reset_folder: "↺ New Folder",
  theme_dark: "Switch to dark theme",
  theme_light: "Switch to light theme",
  tab_sort: "File Sorter",
  tab_dupes: "Duplicate Finder",
  tab_disk: "Disk Space Analyzer",
  tab_settings: "Settings",
  hero_title: "Select a folder to organize",
  hero_subtitle: "Scan, plan, and categorize your files instantly without UI freezing.",
  hero_drop_btn: "📁 Browse Folder",
  hero_selected: "Selected folder:",
  hero_scanning: "Scanning and analyzing files…",
  hero_files_found: "files discovered so far",
  hero_stop: "Stop Scan",
  summary_files: "Total Files",
  summary_size: "Total Size",
  summary_categories: "Categories",
  btn_sort_now: "⚡ Sort Files Now",
  btn_sorting: "Moving files…",
  btn_rescan: "Rescan",
  btn_show_moves: "Preview planned moves",
  btn_hide_moves: "Hide preview",
  btn_undo: "↩ Undo Last Sort",
  undo_success: "files restored to their original locations",
  undo_skipped: "files skipped due to collision",
  sort_done_title: "✓ Sorting completed successfully",
  sort_done_desc: "files moved cleanly. Journal entry recorded.",
  dupes_title: "Content-Identical Duplicate Finder",
  dupes_desc: "Identify redundant files with multi-threaded SHA-256 chunked hashing to reclaim space.",
  dupes_btn_scan: "🔍 Find Duplicates",
  dupes_btn_scanning: "Hashing & comparing…",
  dupes_reclaimable: "Reclaimable space:",
  dupes_keep_oldest: "Keep oldest copy",
  dupes_keep_newest: "Keep newest copy",
  dupes_btn_quarantine: "Move duplicates to quarantine",
  dupes_empty: "No duplicate files found.",
  dupes_quarantine_done: "duplicate copies moved to quarantine.",
  disk_title: "Disk Space Utilization",
  disk_desc: "Detailed breakdown of disk usage per category and largest files found.",
  disk_total_files: "Total Scanned Files",
  disk_total_size: "Space Occupied",
  disk_category_breakdown: "Disk share by category:",
  disk_largest_files: "Top 20 Largest Files:",
  disk_col_name: "File Name",
  disk_col_size: "Size",
  disk_col_path: "Full Path",
  disk_loading: "Loading disk usage stats…",
  disk_pick_first: "Select a folder from the File Sorter tab first.",
  settings_title: "Settings",
  settings_desc: "Customize categories and file extension rules.",
  settings_cat_title: "Categories & File Extensions",
  settings_cat_desc: "Assign file formats to categories or add custom extensions.",
  settings_btn_save: "💾 Save Settings",
  settings_btn_reset: "↺ Reset Defaults",
  settings_saved_notice: "Settings saved successfully",
  settings_reset_notice: "Settings restored to defaults",
  settings_add_placeholder: "New extension (e.g. .webp)",
  settings_add_btn: "+",
  settings_formats_count: "formats",
  footer_text: "FileSorter v2 · Fast, non-blocking native architecture with Rust & Tauri · Journal:",
  footer_journal: "%APPDATA%\\FileSorterV2\\undo",
};

export const CATEGORY_LABELS: Record<string, string> = {
  images: "Images",
  documents: "Documents",
  videos: "Videos",
  audio: "Audio",
  archives: "Archives",
  code: "Source Code",
  data: "Data Files",
  ebooks: "E-Books",
  executables: "Executables",
  fonts: "Fonts",
  others: "Other Files",
};
