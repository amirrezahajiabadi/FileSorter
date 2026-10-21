export interface I18nStrings {
  app_title: string;
  app_subtitle: string;
  reset_folder: string;
  theme_dark: string;
  theme_light: string;
  theme_title: string;
  theme_desc: string;
  tab_sort: string;
  tab_junk: string;
  tab_dupes: string;
  tab_disk: string;
  tab_watch: string;
  tab_schedule: string;
  tab_pdf: string;
  tab_renamer: string;
  tab_images: string;
  tab_settings: string;
  pdf_title: string;
  pdf_desc: string;
  pdf_mode_img2pdf: string;
  pdf_mode_pdf2img: string;
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
  disk_drives_title: string;
  junk_title: string;
  junk_desc: string;
  junk_btn_scan: string;
  junk_btn_scanning: string;
  junk_btn_clean: string;
  junk_btn_cleaning: string;
  junk_select_all: string;
  junk_deselect_all: string;
  junk_empty: string;
  junk_cleaned_summary: string;
  watch_title: string;
  watch_desc: string;
  watch_toggle_active: string;
  watch_add_folder: string;
  watch_no_folders: string;
  watch_live_log: string;
  watch_empty_log: string;
  sched_title: string;
  sched_desc: string;
  sched_add_task: string;
  sched_no_tasks: string;
  sched_run_now: string;
  sched_last_run: string;
  sched_interval: string;
  rules_title: string;
  rules_desc: string;
  rules_add_btn: string;
  rules_no_rules: string;
  rules_rule_name: string;
  rules_category: string;
  rules_keywords: string;
  update_check_btn: string;
  update_checking: string;
  update_available: string;
  update_latest: string;
  update_btn_download: string;
  onboarding_btn_tour: string;
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
  theme_title: "Theme & Appearance",
  theme_desc: "Choose from liquid glass themes: pure dark, crystal light, or glowing chromatic glass combinations.",
  tab_sort: "File Sorter",
  tab_junk: "Junk Cleaner",
  tab_dupes: "Duplicate Finder",
  tab_disk: "Disk Space",
  tab_watch: "Watch Mode",
  tab_schedule: "Scheduler",
  tab_pdf: "PDF Studio",
  tab_renamer: "Batch Renamer",
  tab_images: "Image Studio",
  tab_settings: "Settings",
  pdf_title: "PDF Studio",
  pdf_desc: "Convert image collections into clean PDF documents or extract all pages & pictures from existing PDFs.",
  pdf_mode_img2pdf: "Images to PDF",
  pdf_mode_pdf2img: "PDF to Images",
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
  disk_pick_first: "Select a folder or drive from below to analyze.",
  disk_drives_title: "Detected Drives & Storage Volumes:",
  junk_title: "Junk & Cache Cleaner",
  junk_desc: "Safely scan and purge temporary caches, crash dumps, and thumbnail files without admin prompts.",
  junk_btn_scan: "🔍 Scan Junk Locations",
  junk_btn_scanning: "Scanning junk locations…",
  junk_btn_clean: "🗑️ Clean Selected Junk",
  junk_btn_cleaning: "Purging junk files…",
  junk_select_all: "Select All",
  junk_deselect_all: "Deselect All",
  junk_empty: "No junk files detected in scanned locations.",
  junk_cleaned_summary: "Cleaned files successfully.",
  watch_title: "Background Watch Mode",
  watch_desc: "Monitor your Downloads or Desktop folders and auto-sort new files as they arrive.",
  watch_toggle_active: "Watch Active",
  watch_add_folder: "+ Add Watched Folder",
  watch_no_folders: "No folders are currently being watched. Add one above.",
  watch_live_log: "Live Activity Stream:",
  watch_empty_log: "No file events yet. Watched folders will report here automatically.",
  sched_title: "Automated Task Scheduler",
  sched_desc: "Keep your system clean and organized on automated timers in the background.",
  sched_add_task: "+ Add Scheduled Task",
  sched_no_tasks: "No automated tasks scheduled yet.",
  sched_run_now: "Run Now",
  sched_last_run: "Last run:",
  sched_interval: "Interval:",
  rules_title: "Smart Keyword Rules",
  rules_desc: "Match keywords in filenames to prioritize specific categories before standard extensions.",
  rules_add_btn: "+ Add Smart Rule",
  rules_no_rules: "No smart rules configured. Add rules below to override default extension sorting.",
  rules_rule_name: "Rule Name",
  rules_category: "Target Category",
  rules_keywords: "Keywords (comma separated)",
  update_check_btn: "Check for Updates",
  update_checking: "Checking…",
  update_available: "New update available!",
  update_latest: "FileSorter is up to date.",
  update_btn_download: "Download Update",
  onboarding_btn_tour: "Take Guided Tour",
  settings_title: "Settings",
  settings_desc: "Customize categories, smart keyword rules, and file extension mappings.",
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
