// Bilingual string table for FileSorter (English + Persian).
//
// Every user-facing string lives here so the UI can switch language without a
// reload and without pulling in an i18n dependency. Components receive the
// active `Locale` as a prop and resolve their strings with `getStrings()`.

export type Locale = "en" | "fa";

export const LOCALES: Locale[] = ["en", "fa"];

export const DEFAULT_LOCALE: Locale = "en";

/** Placeholder-aware formatter: fmt("Hi {name}", { name: "Ada" }) -> "Hi Ada" */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

export interface I18nStrings {
  // Search, drag & drop, history and empty-entry cleanup (phase 1)
  search_placeholder: string;
  search_clear: string;
  search_count: string;
  drop_overlay_title: string;
  drop_overlay_body: string;
  drop_needs_files: string;
  tab_history: string;
  hist_title: string;
  hist_desc: string;
  hist_col_when: string;
  hist_col_kind: string;
  hist_col_files: string;
  hist_col_size: string;
  hist_col_action: string;
  hist_kind_sort: string;
  hist_kind_quarantine: string;
  hist_kind_extras: string;
  hist_empty_title: string;
  hist_empty_body: string;
  hist_undo: string;
  hist_undo_hint: string;
  hist_empty_entries: string;
  extras_title: string;
  extras_desc: string;
  extras_btn_pick: string;
  extras_btn_scanning: string;
  extras_btn_rescan: string;
  extras_dirs: string;
  extras_files: string;
  extras_none: string;
  extras_clean: string;
  extras_done: string;
  extras_failed: string;
  extras_undo_hint: string;
  extras_scanned: string;

  // Global search, folder compare, archives and the renamer pattern method
  tab_search: string;
  tab_compare: string;
  tab_archive: string;
  gs_title: string;
  gs_desc: string;
  gs_root: string;
  gs_root_ph: string;
  gs_query: string;
  gs_query_ph: string;
  gs_mode_label: string;
  gs_mode_contains: string;
  gs_mode_regex: string;
  gs_mode_glob: string;
  gs_ext_label: string;
  gs_ext_ph: string;
  gs_min_label: string;
  gs_max_label: string;
  gs_hidden: string;
  gs_case: string;
  gs_run: string;
  gs_running: string;
  gs_stop: string;
  gs_results: string;
  gs_scanned: string;
  gs_truncated: string;
  gs_none_title: string;
  gs_none_body: string;
  gs_col_name: string;
  gs_col_folder: string;
  gs_col_size: string;
  gs_col_date: string;
  gs_reveal: string;
  gs_hint: string;
  gs_select_all: string;
  gs_selected: string;
  gs_send_zip: string;
  gs_send_rename: string;
  gs_send_hint: string;
  cmp_title: string;
  cmp_desc: string;
  cmp_left: string;
  cmp_right: string;
  cmp_pick: string;
  cmp_run: string;
  cmp_running: string;
  cmp_identical: string;
  cmp_changed: string;
  cmp_only_left: string;
  cmp_only_right: string;
  cmp_moved: string;
  cmp_files: string;
  cmp_elapsed: string;
  cmp_hidden: string;
  cmp_empty_title: string;
  cmp_empty_body: string;
  cmp_match: string;
  cmp_truncated: string;
  cmp_col_rel: string;
  cmp_col_left: string;
  cmp_col_right: string;
  cmp_running_side: string;
  cmp_side_left: string;
  cmp_side_right: string;
  arc_title: string;
  arc_desc: string;
  arc_create_title: string;
  arc_create_desc: string;
  arc_add_files: string;
  arc_add_folder: string;
  arc_clear: string;
  arc_sources_empty: string;
  arc_dest_label: string;
  arc_dest_ph: string;
  arc_choose_dest: string;
  arc_create: string;
  arc_creating: string;
  arc_done: string;
  arc_skipped: string;
  arc_extract_title: string;
  arc_extract_desc: string;
  arc_archive_label: string;
  arc_archive_ph: string;
  arc_pick_archive: string;
  arc_target_label: string;
  arc_target_ph: string;
  arc_extract: string;
  arc_extracting: string;
  arc_extracted: string;
  arc_overwrite: string;
  arc_reveal: string;
  br_method_pattern: string;
  br_pattern_label: string;
  br_pattern_ph: string;
  br_pattern_help: string;

  // Shell
  app_title: string;
  app_subtitle: string;
  nav_aria: string;
  nav_group_organize: string;
  nav_group_clean: string;
  nav_group_tools: string;
  sidebar_collapse: string;
  sidebar_expand: string;
  banner_tech: string;
  home_aria: string;
  lang_switch_label: string;
  lang_switch_title: string;

  // Theme
  reset_folder: string;
  theme_dark: string;
  theme_light: string;
  theme_title: string;
  theme_desc: string;
  theme_name_fluent: string;
  theme_desc_fluent: string;
  theme_name_dark: string;
  theme_desc_dark: string;
  theme_name_light: string;
  theme_desc_light: string;
  theme_name_aurora: string;
  theme_desc_aurora: string;
  theme_name_sunset: string;
  theme_desc_sunset: string;

  // Navigation tabs
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

  // Sort tab
  hero_title: string;
  hero_subtitle: string;
  sort_flow_title: string;
  sort_flow_desc: string;
  hero_drop_btn: string;
  hero_selected: string;
  hero_scanning: string;
  hero_files_found: string;
  hero_stop: string;
  dropzone_hint: string;
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
  preview_note: string;
  col_source: string;
  col_destination: string;
  col_category: string;
  col_size: string;
  matched_rule_title: string;
  matched_rule_badge: string;

  // Duplicates
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
  dupes_select_folder: string;
  dupes_per_file: string;
  dupes_waste: string;
  dupes_keep_tag: string;
  dupes_move_tag: string;

  // Disk
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
  disk_empty_title: string;
  disk_drives_title: string;
  disk_drive_name: string;
  disk_free_short: string;
  disk_free_of: string;

  // Junk
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
  junk_files_count: string;
  junk_empty_hint: string;
  junk_empty_title: string;
  junk_purged_detail: string;
  junk_in_use_skipped: string;

  // Watch mode
  watch_title: string;
  watch_desc: string;
  watch_toggle_active: string;
  watch_add_folder: string;
  watch_no_folders: string;
  watch_live_log: string;
  watch_empty_log: string;
  watch_event_moved: string;
  watch_event_skipped: string;
  watch_event_failed: string;
  watch_state_active: string;
  watch_state_paused: string;
  watch_active_hint: string;
  watch_monitored_folders: string;

  // Scheduler
  sched_title: string;
  sched_desc: string;
  sched_add_task: string;
  sched_no_tasks: string;
  sched_empty_title: string;
  sched_run_now: string;
  sched_last_run: string;
  sched_interval: string;
  sched_new_task: string;
  sched_task_name_ph: string;
  sched_kind_junk: string;
  sched_kind_sort: string;
  sched_folder_ph: string;
  sched_interval_label: string;
  sched_save: string;
  sched_col_task: string;
  sched_col_type: string;
  sched_col_interval: string;
  sched_col_last_run: string;
  sched_col_actions: string;
  sched_minutes: string;
  sched_never: string;
  sched_recent_runs: string;
  sched_task_executed: string;

  // Smart rules & settings
  rules_title: string;
  rules_desc: string;
  rules_add_btn: string;
  rules_no_rules: string;
  rules_rule_name: string;
  rules_category: string;
  rules_keywords: string;
  rules_name_ph: string;
  rules_keywords_ph: string;
  rules_col_name: string;
  rules_col_category: string;
  rules_col_keywords: string;
  rules_col_action: string;
  notice_rule_added: string;
  notice_rule_deleted: string;
  settings_title: string;
  settings_desc: string;
  settings_page_desc: string;
  settings_cat_title: string;
  settings_cat_desc: string;
  settings_btn_save: string;
  settings_btn_reset: string;
  settings_saved_notice: string;
  settings_reset_notice: string;
  settings_add_placeholder: string;
  settings_add_btn: string;
  settings_formats_count: string;
  ext_remove: string;

  // Updates
  update_check_btn: string;
  update_checking: string;
  update_available: string;
  update_latest: string;
  update_btn_download: string;
  um_title: string;
  um_desc: string;
  um_current: string;
  um_latest: string;
  um_highlights: string;
  um_later: string;
  um_download: string;

  // Loaders
  loader_renamer: string;
  loader_images: string;
  loader_pdf: string;

  // Common
  common_remove: string;
  common_change: string;
  common_cancel: string;
  common_browse: string;

  // Onboarding
  onboarding_btn_tour: string;
  ob_steps_aria: string;
  ob_goto_step: string;
  ob_welcome_title: string;
  ob_welcome_lead_a: string;
  ob_welcome_lead_b: string;
  ob_feature_engine_title: string;
  ob_feature_engine_desc: string;
  ob_feature_safe_title: string;
  ob_feature_safe_desc: string;
  ob_theme_title: string;
  ob_theme_lead: string;
  ob_theme_select_aria: string;
  ob_caps_title: string;
  ob_caps_lead: string;
  ob_cap1_title: string;
  ob_cap1_desc: string;
  ob_cap2_title: string;
  ob_cap2_desc: string;
  ob_cap3_title: string;
  ob_cap3_desc: string;
  ob_cap4_title: string;
  ob_cap4_desc: string;
  ob_cap5_title: string;
  ob_cap5_desc: string;
  ob_ready_title: string;
  ob_ready_lead_a: string;
  ob_ready_lead_b: string;
  ob_ready_lead_c: string;
  ob_downloads: string;
  ob_desktop: string;
  ob_pick_folder_btn: string;
  ob_go_workspace: string;
  ob_skip: string;
  ob_skip_aria: string;
  ob_back: string;
  ob_back_aria: string;
  ob_continue: string;
  ob_continue_aria: string;
  ob_get_started: string;
  ob_get_started_aria: string;

  // Batch Renamer
  br_title: string;
  br_desc: string;
  br_add_files: string;
  br_add_folder: string;
  br_clear: string;
  br_method_replace: string;
  br_method_affix: string;
  br_method_numbering: string;
  br_method_case: string;
  br_method_extension: string;
  br_find_label: string;
  br_find_ph: string;
  br_replace_label: string;
  br_replace_ph: string;
  br_match_case: string;
  br_regex: string;
  br_prefix_label: string;
  br_prefix_ph: string;
  br_suffix_label: string;
  br_suffix_ph: string;
  br_num_prefix_label: string;
  br_num_prefix_ph: string;
  br_num_suffix_label: string;
  br_num_suffix_ph: string;
  br_start_from: string;
  br_padding: string;
  br_keep_original: string;
  br_case_lower: string;
  br_case_upper: string;
  br_case_title: string;
  br_case_kebab: string;
  br_case_snake: string;
  br_change_ext: string;
  br_ext_ph: string;
  br_force_lower_ext: string;
  br_renamed_ok: string;
  br_failed: string;
  br_undo: string;
  br_restored: string;
  br_conflict: string;
  br_empty_title: string;
  br_empty_desc: string;
  br_choose_files: string;
  br_selected_count: string;
  br_will_modify: string;
  br_apply: string;
  br_renaming: string;
  br_col_original: string;
  br_col_new: string;
  br_col_status: string;
  br_status_conflict: string;
  br_status_modified: string;
  br_status_unchanged: string;
  br_remove_file: string;
  br_file_singular: string;
  br_file_plural: string;

  // Image Studio
  is_title: string;
  is_badge: string;
  is_desc: string;
  is_add_images: string;
  is_clear_all: string;
  is_success_title: string;
  is_saved_success: string;
  is_original: string;
  is_optimized: string;
  is_saved_space: string;
  is_reduction: string;
  is_open_folder: string;
  is_step1: string;
  is_step1_desc: string;
  is_fmt_webp_desc: string;
  is_fmt_jpeg_desc: string;
  is_fmt_png_desc: string;
  is_step2: string;
  is_quality_pristine: string;
  is_quality_balanced: string;
  is_quality_aggressive: string;
  is_step3: string;
  is_step3_desc: string;
  is_dim_original: string;
  is_step4: string;
  is_step4_desc: string;
  is_step4_ph: string;
  is_step5: string;
  is_choose_folder_ph: string;
  is_optimize: string;
  is_optimizing: string;
  is_empty_title: string;
  is_empty_desc: string;
  is_remove_queue: string;
  is_to: string;

  // PDF Studio
  ps_title: string;
  ps_desc: string;
  ps_mode_img2pdf: string;
  ps_mode_pdf2img: string;
  ps_add_images: string;
  ps_clear_all: string;
  ps_page_singular: string;
  ps_page_plural: string;
  ps_total: string;
  ps_page_size: string;
  ps_page_fit: string;
  ps_page_a4p: string;
  ps_page_a4l: string;
  ps_margins: string;
  ps_margin_none: string;
  ps_margin_small: string;
  ps_margin_normal: string;
  ps_building: string;
  ps_export: string;
  ps_created: string;
  ps_saved_to: string;
  ps_open_pdf: string;
  ps_reveal: string;
  ps_no_images_title: string;
  ps_no_images_desc: string;
  ps_move_earlier: string;
  ps_move_later: string;
  ps_remove_image: string;
  ps_select_pdf: string;
  ps_select_pdf_desc: string;
  ps_choose_pdf: string;
  ps_preview: string;
  ps_open_pdf_doc: string;
  ps_extract_settings: string;
  ps_image_format: string;
  ps_fmt_png: string;
  ps_fmt_jpeg: string;
  ps_res_scale: string;
  ps_res_150: string;
  ps_res_200: string;
  ps_res_300: string;
  ps_page_range_label: string;
  ps_dest_folder: string;
  ps_extracting: string;
  ps_extract_btn: string;
  ps_extracted_ok: string;
  ps_saved_size_to: string;
  ps_open_dest: string;
  ps_page_alt: string;

  // Footer
  footer_text: string;
  footer_journal: string;
}

const EN: I18nStrings = {
  search_placeholder: "Filter this list…",
  search_clear: "Clear filter",
  search_count: "{shown} of {total} shown",
  drop_overlay_title: "Drop to load",
  drop_overlay_body: "A folder starts a scan; files open in the current tool.",
  drop_needs_files: "Drop files (not folders) into this tool.",
  tab_history: "History",
  hist_title: "Operation history",
  hist_desc:
    "Every sort, quarantine and cleanup this app performed, read from the undo journal. The newest row is the one Undo replays.",
  hist_col_when: "When",
  hist_col_kind: "Operation",
  hist_col_files: "Files",
  hist_col_size: "Size",
  hist_col_action: "Action",
  hist_kind_sort: "Sort",
  hist_kind_quarantine: "Duplicates",
  hist_kind_extras: "Cleanup",
  hist_empty_title: "No operations yet",
  hist_empty_body: "Sort a folder or quarantine duplicates and it will show up here.",
  hist_undo: "Undo",
  hist_undo_hint: "Undo restores the newest operation only.",
  hist_empty_entries: "{count} empty entries",
  extras_title: "Empty folders & zero-byte files",
  extras_desc:
    "Scanned inside a folder you choose. Every removal is journaled and can be undone.",
  extras_btn_pick: "Choose folder…",
  extras_btn_scanning: "Scanning…",
  extras_btn_rescan: "Scan again",
  extras_dirs: "Empty folders",
  extras_files: "Zero-byte files",
  extras_none: "Nothing to clean in this folder.",
  extras_clean: "Remove {count}",
  extras_done: "Removed {dirs} folders and {files} files.",
  extras_failed: "{count} entries changed and were skipped.",
  extras_undo_hint: "Undo recreates them as empty paths.",
  extras_scanned: "Scanned {count} entries in {root}",

  app_title: "FileSorter",
  app_subtitle: "Ultra-fast file organizer powered by Rust & Tauri",
  nav_aria: "Main Navigation",
  nav_group_organize: "Organize",
  nav_group_clean: "Clean up",
  nav_group_tools: "Tools",
  sidebar_collapse: "Collapse Sidebar",
  sidebar_expand: "Expand Sidebar",
  banner_tech: "Tauri 2 + Rust",
  home_aria: "Home",
  lang_switch_label: "فارسی",
  lang_switch_title: "Switch to Persian",

  reset_folder: "↺ New Folder",
  theme_dark: "Switch to dark theme",
  theme_light: "Switch to light theme",
  theme_title: "Theme & Appearance",
  theme_desc:
    "Five considered themes: warm graphite, true black, paper light, deep green and warm rose.",
  theme_name_fluent: "Liquid Smoke",
  theme_desc_fluent: "Warm graphite ground with a brass signal on data",
  theme_name_dark: "Obsidian",
  theme_desc_dark: "True black, crisp white type and a steel signal",
  theme_name_light: "Crystal Frost",
  theme_desc_light: "Paper-white surfaces, ink text and a single blue signal",
  theme_name_aurora: "Liquid Prism",
  theme_desc_aurora: "Deep green-black with a mint signal on data",
  theme_name_sunset: "Rose Quartz",
  theme_desc_sunset: "Warm paper surfaces with a rosewood signal",

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

  hero_title: "Select a folder to organize",
  hero_subtitle: "Scan, plan, and categorize your files instantly without UI freezing.",
  sort_flow_title: "Where files go",
  sort_flow_desc: "A folder is created only for the file types present.",
  hero_drop_btn: "Choose Folder",
  hero_selected: "Selected folder:",
  hero_scanning: "Scanning and analyzing files…",
  hero_files_found: "files discovered so far",
  hero_stop: "Stop Scan",
  dropzone_hint: "Drop a folder here, or choose one from disk. Nothing moves until you review the plan.",
  summary_files: "Total Files",
  summary_size: "Total Size",
  summary_categories: "Categories",
  btn_sort_now: "Sort Files Now",
  btn_sorting: "Moving files…",
  btn_rescan: "Rescan",
  btn_show_moves: "Preview planned moves",
  btn_hide_moves: "Hide preview",
  btn_undo: "↩ Undo Last Sort",
  undo_success: "files restored to their original locations",
  undo_skipped: "files skipped due to collision",
  sort_done_title: "Sorting completed successfully",
  sort_done_desc: "files moved cleanly. Journal entry recorded.",
  preview_note:
    "Showing preview of first {shown} of {total} planned moves. All files will be processed on sort.",
  col_source: "Source File",
  col_destination: "Destination",
  col_category: "Category",
  col_size: "Size",
  matched_rule_title: "Matched via Smart Rule",
  matched_rule_badge: "Target: {rule}",

  dupes_title: "Content-Identical Duplicate Finder",
  dupes_desc:
    "Identify redundant files with multi-threaded SHA-256 chunked hashing to reclaim space.",
  dupes_btn_scan: "Find Duplicates",
  dupes_btn_scanning: "Hashing & comparing…",
  dupes_reclaimable: "Reclaimable space:",
  dupes_keep_oldest: "Keep oldest copy",
  dupes_keep_newest: "Keep newest copy",
  dupes_btn_quarantine: "Move duplicates to quarantine",
  dupes_empty: "No duplicate files found.",
  dupes_quarantine_done: "duplicate copies moved to quarantine.",
  dupes_select_folder: "Select a folder first to analyze duplicates.",
  dupes_per_file: "{size} per file ({count} copies)",
  dupes_waste: "Waste: {size}",
  dupes_keep_tag: "[Keep]",
  dupes_move_tag: "× [Move]",

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
  disk_pick_first: "Choose a folder to analyze its disk usage.",
  disk_empty_title: "No folder selected",
  disk_drives_title: "Detected Drives & Storage Volumes:",
  disk_drive_name: "Local Disk ({letter}:)",
  disk_free_short: "{size} free",
  disk_free_of: "{free} free of {total}",

  junk_title: "Junk & Cache Cleaner",
  junk_desc:
    "Safely scan and purge temporary caches, crash dumps, and thumbnail files without admin prompts.",
  junk_btn_scan: "Scan Junk Locations",
  junk_btn_scanning: "Scanning junk locations…",
  junk_btn_clean: "Clean Selected Junk",
  junk_btn_cleaning: "Purging junk files…",
  junk_select_all: "Select All",
  junk_deselect_all: "Deselect All",
  junk_empty: "No junk files detected in scanned locations.",
  junk_cleaned_summary: "Cleaned files successfully.",
  junk_files_count: "{count} files",
  junk_empty_hint:
    'Click "Scan Junk Locations" to discover temporary files and caches.',
  junk_empty_title: "Nothing scanned yet",
  junk_purged_detail: "Purged {files} files ({size} freed).",
  junk_in_use_skipped: "({count} in-use files safely skipped)",

  watch_title: "Background Watch Mode",
  watch_desc:
    "Monitor your Downloads or Desktop folders and auto-sort new files as they arrive.",
  watch_toggle_active: "Watch Active",
  watch_add_folder: "+ Add Watched Folder",
  watch_no_folders: "No folders are currently being watched. Add one above.",
  watch_live_log: "Live Activity Stream:",
  watch_empty_log:
    "No file events yet. Watched folders will report here automatically.",
  watch_event_moved: "Auto-sorted",
  watch_event_skipped: "Skipped",
  watch_event_failed: "Failed",
  watch_state_active: "ACTIVE",
  watch_state_paused: "PAUSED",
  watch_active_hint:
    "When active, newly appearing files in watched directories are automatically organized into categories.",
  watch_monitored_folders: "Monitored Folders ({count})",

  sched_title: "Automated Task Scheduler",
  sched_desc:
    "Keep your system clean and organized on automated timers in the background.",
  sched_add_task: "+ Add Scheduled Task",
  sched_no_tasks: "No automated tasks scheduled yet.",
  sched_empty_title: "No tasks yet",
  sched_run_now: "Run Now",
  sched_last_run: "Last run:",
  sched_interval: "Interval:",
  sched_new_task: "New Scheduled Task",
  sched_task_name_ph: "Task Name (e.g. Daily Cleanup)",
  sched_kind_junk: "Junk & Temp Cleanup",
  sched_kind_sort: "Auto-Sort Folder",
  sched_folder_ph: "Folder Path",
  sched_interval_label: "Interval (minutes):",
  sched_save: "Save Task",
  sched_col_task: "Task Name",
  sched_col_type: "Type",
  sched_col_interval: "Interval",
  sched_col_last_run: "Last Run",
  sched_col_actions: "Actions",
  sched_minutes: "{count} min",
  sched_never: "Never",
  sched_recent_runs: "Recent Automated Runs:",
  sched_task_executed: "Task executed: {summary}",

  rules_title: "Smart Keyword Rules",
  rules_desc:
    "Match keywords in filenames to prioritize specific categories before standard extensions.",
  rules_add_btn: "+ Add Smart Rule",
  rules_no_rules:
    "No smart rules configured. Add rules below to override default extension sorting.",
  rules_rule_name: "Rule Name",
  rules_category: "Target Category",
  rules_keywords: "Keywords (comma separated)",
  rules_name_ph: "Rule Name (e.g. Financial Invoices)",
  rules_keywords_ph: "Keywords (e.g. invoice, bill, receipt)",
  rules_col_name: "Rule Name",
  rules_col_category: "Target Category",
  rules_col_keywords: "Matched Keywords",
  rules_col_action: "Action",
  notice_rule_added: "Smart rule added successfully",
  notice_rule_deleted: "Smart rule deleted",
  settings_title: "Settings",
  settings_page_desc: "Categories, file types and rule-based sorting for the whole app.",
  settings_desc:
    "Customize categories, smart keyword rules, and file extension mappings.",
  settings_cat_title: "Categories & File Extensions",
  settings_cat_desc: "Assign file formats to categories or add custom extensions.",
  settings_btn_save: "Save Settings",
  settings_btn_reset: "↺ Reset Defaults",
  settings_saved_notice: "Settings saved successfully",
  settings_reset_notice: "Settings restored to defaults",
  settings_add_placeholder: "New extension (e.g. .webp)",
  settings_add_btn: "+",
  settings_formats_count: "formats",
  ext_remove: "Remove",

  update_check_btn: "Check for Updates",
  update_checking: "Checking…",
  update_available: "New update available!",
  update_latest: "FileSorter is up to date.",
  update_btn_download: "Download Update",
  um_title: "New Update Available!",
  um_desc: "A new version of FileSorter is ready to download.",
  um_current: "Current:",
  um_latest: "Latest:",
  um_highlights: "Release Highlights:",
  um_later: "Remind Me Later",
  um_download: "Download & Install Update",

  loader_renamer: "Loading Batch Renamer…",
  loader_images: "Loading Image Studio…",
  loader_pdf: "Loading PDF Studio…",

  common_remove: "Remove",
  common_change: "Change",
  common_cancel: "Cancel",
  common_browse: "Browse",

  ob_steps_aria: "Onboarding steps",
  onboarding_btn_tour: "Take Guided Tour",
  ob_goto_step: "Go to step {n}",
  ob_welcome_title: "Welcome to FileSorter",
  ob_welcome_lead_a: "Rebuilt from the ground up on ",
  ob_welcome_lead_b:
    ": a sub-second startup, lightweight native binary with zero UI freeze and instant desktop responsiveness.",
  ob_feature_engine_title: "Native Rust Engine",
  ob_feature_engine_desc:
    "Parallel disk scans, SHA-256 chunked duplicate hashing, and atomic journaled undo.",
  ob_feature_safe_title: "Never Overwrites",
  ob_feature_safe_desc:
    "Smart collision resolver automatically renames conflicts (e.g. file (2).pdf).",
  ob_theme_title: "Choose your theme",
  ob_theme_lead:
    "Five flat themes share one type system. Pick the one that suits your desk:",
  ob_theme_select_aria: "Select {name}",
  ob_caps_title: "One window for the whole clean-up",
  ob_caps_lead:
    "Sort folders, purge caches, remove duplicates and compress images without leaving the app.",
  ob_cap1_title: "Smart Organize & Rules",
  ob_cap1_desc: "Categorize by extensions or create keyword rules matching filename tokens.",
  ob_cap2_title: "Junk & Cache Cleaner",
  ob_cap2_desc:
    "Purge temporary files, browser caches, crash dumps, and thumbnail DBs safely.",
  ob_cap3_title: "Duplicates & Disk Analyzer",
  ob_cap3_desc: "Find identical files with 3-stage SHA-256 pipeline and reclaim gigabytes.",
  ob_cap4_title: "Watch Mode & Scheduler",
  ob_cap4_desc:
    "Auto-sort Downloads or Desktop on file arrival, or run background cleanup tasks.",
  ob_cap5_title: "Creative Studios",
  ob_cap5_desc:
    "Batch Renamer, Image Studio (WebP/JPEG conversion), and PDF Studio included.",
  ob_ready_title: "You're All Set!",
  ob_ready_lead_a: "Pick a messy directory (like your ",
  ob_ready_lead_b: " or ",
  ob_ready_lead_c: ") and let FileSorter work its magic safely with full undo.",
  ob_downloads: "Downloads",
  ob_desktop: "Desktop",
  ob_pick_folder_btn: "Select a Folder to Organize",
  ob_go_workspace: "Go to Workspace",
  ob_skip: "Skip",
  ob_skip_aria: "Skip onboarding tour",
  ob_back: "← Back",
  ob_back_aria: "Previous step",
  ob_continue: "Continue →",
  ob_continue_aria: "Next step",
  ob_get_started: "Get Started",
  ob_get_started_aria: "Get started",

  br_title: "Smart Batch Renamer",
  br_desc:
    "Rename multiple files and folders at once using search & replace, affixes, numbering, and case formatting.",
  br_add_files: "Add Files",
  br_add_folder: "Add Folder",
  br_clear: "Clear",
  br_method_replace: "Find & Replace",
  br_method_affix: "Prefix & Suffix",
  br_method_numbering: "Numbering Sequence",
  br_method_case: "Case Converter",
  br_method_extension: "Extension",
  br_find_label: "Find text:",
  br_find_ph: "e.g. [1080p] or copy",
  br_replace_label: "Replace with:",
  br_replace_ph: "Leave empty to remove",
  br_match_case: "Match Case",
  br_regex: "Regular Expression",
  br_prefix_label: "Prefix (Insert at start):",
  br_prefix_ph: "e.g. 2024_",
  br_suffix_label: "Suffix (Insert before extension):",
  br_suffix_ph: "e.g. _final",
  br_num_prefix_label: "Prefix Text:",
  br_num_prefix_ph: "e.g. Item_",
  br_num_suffix_label: "Suffix Text:",
  br_num_suffix_ph: "e.g. _doc",
  br_start_from: "Start From:",
  br_padding: "Padding Digits:",
  br_keep_original: "Keep Original Name",
  br_case_lower: "lowercase (my file.txt)",
  br_case_upper: "UPPERCASE (MY FILE.TXT)",
  br_case_title: "Title Case (My File.txt)",
  br_case_kebab: "kebab-case (my-file.txt)",
  br_case_snake: "snake_case (my_file.txt)",
  br_change_ext: "Change Extension to:",
  br_ext_ph: "e.g. jpg",
  br_force_lower_ext: "Force Lowercase Extension (e.g. .JPG → .jpg)",
  br_renamed_ok: "Successfully renamed {count} {unit}!",
  br_failed: "{count} failed ({errors})",
  br_undo: "↩ Undo Rename",
  br_restored: "↩ Restored {count} {unit} to their original names.",
  br_conflict:
    "Name conflict detected: multiple files would have the same name ({names}). Please refine your rules before applying.",
  br_empty_title: "No files selected for renaming",
  br_empty_desc:
    "Add files or folders to test renaming rules with live real-time preview and safe undo protection.",
  br_choose_files: "Choose Files",
  br_selected_count: "{count} files selected · ",
  br_will_modify: "{count} will be modified",
  br_apply: "Apply Rename ({count})",
  br_renaming: "⏳ Renaming…",
  br_col_original: "Original Name",
  br_col_new: "→ New Name",
  br_col_status: "Status",
  br_status_conflict: "Conflict",
  br_status_modified: "Modified",
  br_status_unchanged: "Unchanged",
  br_remove_file: "Remove file",
  br_file_singular: "file",
  br_file_plural: "files",

  is_title: "Image Studio",
  is_badge: "Lossless & Lossy Web Compressor",
  is_desc:
    "Convert images to modern WebP, JPEG, or PNG formats with live size compression and aspect-ratio preservation.",
  is_add_images: "+ Add Images",
  is_clear_all: "Clear All",
  is_success_title: "Batch Optimization Finished!",
  is_saved_success: "Successfully optimized and saved {count} images into:",
  is_original: "Original:",
  is_optimized: "Optimized:",
  is_saved_space: "Saved Space:",
  is_reduction: "({pct}% reduction)",
  is_open_folder: "Open Destination Folder",
  is_step1: "Target Format",
  is_step1_desc: "Select target format for conversion",
  is_fmt_webp_desc: "WebP: small files at high quality, well supported on the web.",
  is_fmt_jpeg_desc: "JPEG: the widest compatibility across devices and platforms.",
  is_fmt_png_desc: "PNG: lossless quality with full transparency support.",
  is_step2: "Compression Quality",
  is_quality_pristine: "Pristine visual fidelity",
  is_quality_balanced: "Balanced high quality (Recommended)",
  is_quality_aggressive: "Aggressive compression",
  is_step3: "Max Dimension Clamping",
  is_step3_desc: "Limit maximum width or height preserving aspect ratio",
  is_dim_original: "Original",
  is_step4: "Filename Suffix",
  is_step4_desc: "Appended to name (leave blank to keep name)",
  is_step4_ph: "e.g. _optimized or leave empty",
  is_step5: "Destination Folder",
  is_choose_folder_ph: "Click to choose folder...",
  is_optimize: "Optimize & Export",
  is_optimizing: "⏳ Optimizing",
  is_empty_title: "No Images Added Yet",
  is_empty_desc:
    "Click here to select photos or graphics for batch compression.",
  is_remove_queue: "Remove from queue",
  is_to: "To:",

  ps_title: "PDF Studio",
  ps_desc:
    "Convert images into PDF documents or extract all pages as high-resolution image files.",
  ps_mode_img2pdf: "Images to PDF",
  ps_mode_pdf2img: "PDF to Images",
  ps_add_images: "Add Images",
  ps_clear_all: "Clear All",
  ps_page_singular: "page",
  ps_page_plural: "pages",
  ps_total: "Total:",
  ps_page_size: "Page Size:",
  ps_page_fit: "Fit to Image Size",
  ps_page_a4p: "Standard A4 Portrait",
  ps_page_a4l: "Standard A4 Landscape",
  ps_margins: "Margins:",
  ps_margin_none: "None (Full Bleed)",
  ps_margin_small: "Small (15 pt)",
  ps_margin_normal: "Normal (30 pt)",
  ps_building: "⏳ Building PDF…",
  ps_export: "Export to PDF",
  ps_created: "PDF Successfully Created!",
  ps_saved_to: "Saved to:",
  ps_open_pdf: "Open PDF",
  ps_reveal: "Reveal in Folder",
  ps_no_images_title: "No images added yet",
  ps_no_images_desc:
    "Click to browse JPG, PNG, WebP or BMP images to compile into a single PDF document.",
  ps_move_earlier: "Move Earlier",
  ps_move_later: "Move Later",
  ps_remove_image: "Remove Image",
  ps_select_pdf: "Select PDF Document",
  ps_select_pdf_desc:
    "Choose any PDF to render and extract each page as high-res PNG or JPEG image.",
  ps_choose_pdf: "Choose PDF",
  ps_preview: "Preview",
  ps_open_pdf_doc: "Open PDF Document",
  ps_extract_settings: "Extraction Settings",
  ps_image_format: "Image Format:",
  ps_fmt_png: "PNG (Lossless High Quality)",
  ps_fmt_jpeg: "JPEG (Compact File Size)",
  ps_res_scale: "Resolution Scale:",
  ps_res_150: "Standard Quality (150 DPI)",
  ps_res_200: "High Quality (200 DPI - Recommended)",
  ps_res_300: "Ultra Crisp (300 DPI - Print Ready)",
  ps_page_range_label: "Page Range (e.g. all or 1-3, 5):",
  ps_dest_folder: "Destination Folder:",
  ps_extracting: "⏳ Extracting",
  ps_extract_btn: "Extract Pages ({count})",
  ps_extracted_ok: "Successfully Extracted {count} Images!",
  ps_saved_size_to: "Saved {size} to:",
  ps_open_dest: "Open Destination Folder",
  ps_page_alt: "Page {n}",

  tab_search: "Global Search",
  tab_compare: "Folder Compare",
  tab_archive: "Archives",
  gs_title: "Global search",
  gs_desc: "Search a folder (or a whole drive) by name, extension, size and modified date; every hit can be opened in its own folder.",
  gs_root: "Search folder",
  gs_root_ph: "No folder chosen",
  gs_query: "Query",
  gs_query_ph: "File name, or a path like invoices/2024",
  gs_mode_label: "Mode",
  gs_mode_contains: "Contains",
  gs_mode_regex: "Regex",
  gs_mode_glob: "Glob",
  gs_ext_label: "Extensions (comma separated)",
  gs_ext_ph: "jpg, png, pdf",
  gs_min_label: "Min size (MB)",
  gs_max_label: "Max size (MB)",
  gs_hidden: "Include hidden files",
  gs_case: "Match case",
  gs_run: "Search",
  gs_running: "⏳ Searching…",
  gs_stop: "Stop",
  gs_results: "{count} results",
  gs_scanned: "{count} files checked in {ms} ms",
  gs_truncated: "Showing the first {count} matches — narrow the filters to see the rest.",
  gs_none_title: "Nothing matched",
  gs_none_body: "Try a shorter query, or remove the extension and size filters.",
  gs_col_name: "Name",
  gs_col_folder: "Folder",
  gs_col_size: "Size",
  gs_col_date: "Modified",
  gs_reveal: "Show in folder",
  gs_hint: "Glob mode accepts * and ?; regex mode accepts patterns like (jpg|png)$.",
  gs_select_all: "Select all",
  gs_selected: "{count} selected",
  gs_send_zip: "Zip selected",
  gs_send_rename: "Send to Renamer",
  gs_send_hint: "Tick results to zip them together or send them to the renamer.",
  cmp_title: "Compare folders",
  cmp_desc: "Compare two trees by SHA-256 to see what is identical, changed, moved, or only on one side.",
  cmp_left: "First folder",
  cmp_right: "Second folder",
  cmp_pick: "Choose folder",
  cmp_run: "Compare",
  cmp_running: "⏳ Comparing…",
  cmp_identical: "Identical",
  cmp_changed: "Changed",
  cmp_only_left: "Only in first",
  cmp_only_right: "Only in second",
  cmp_moved: "Moved / renamed",
  cmp_files: "{count} files",
  cmp_elapsed: "compared in {ms} ms",
  cmp_hidden: "Include hidden files",
  cmp_empty_title: "No comparison yet",
  cmp_empty_body: "Pick two folders: every file is hashed on both sides and the differences are grouped for you.",
  cmp_match: "The two folders match exactly",
  cmp_truncated: "Some lists were shortened for speed; the counts above are still exact.",
  cmp_col_rel: "Relative path",
  cmp_col_left: "First",
  cmp_col_right: "Second",
  cmp_running_side: "{side}: {count} files hashed",
  cmp_side_left: "First",
  cmp_side_right: "Second",
  arc_title: "Archives",
  arc_desc: "Collect files and folders into a zip, or unpack one while keeping its folder structure.",
  arc_create_title: "Create a zip",
  arc_create_desc: "Folder structure is preserved; a chosen folder keeps its own name inside the archive.",
  arc_add_files: "+ Add files",
  arc_add_folder: "+ Add folder",
  arc_clear: "Clear",
  arc_sources_empty: "Nothing selected to compress yet.",
  arc_dest_label: "Archive path",
  arc_dest_ph: "e.g. D:\\backup\\photos.zip",
  arc_choose_dest: "Choose path…",
  arc_create: "Create archive",
  arc_creating: "⏳ Creating…",
  arc_done: "Archived {count} files ({size}) to:",
  arc_skipped: "{count} items were skipped",
  arc_extract_title: "Extract a zip",
  arc_extract_desc: "Only safe entries are written to the destination folder; ../ paths are refused.",
  arc_archive_label: "Zip file",
  arc_archive_ph: "No archive chosen",
  arc_pick_archive: "Choose zip",
  arc_target_label: "Destination folder",
  arc_target_ph: "No folder chosen",
  arc_extract: "Extract",
  arc_extracting: "⏳ Extracting…",
  arc_extracted: "Extracted {count} files ({size}) to:",
  arc_overwrite: "Replace existing files",
  arc_reveal: "Open folder",
  br_method_pattern: "Pattern",
  br_pattern_label: "Name pattern",
  br_pattern_ph: "{name}_{index}{ext}",
  br_pattern_help: "Tokens: {name} {ext} {index} {date} {time} {parent} — {NAME} and {EXT} are upper-case.",

  footer_text:
    "FileSorter · Fast, non-blocking native architecture with Rust & Tauri · Journal:",
  footer_journal: "%APPDATA%\\FileSorterV2\\undo",
};

const FA: I18nStrings = {
  search_placeholder: "فیلتر این فهرست…",
  search_clear: "پاک‌کردن فیلتر",
  search_count: "{shown} از {total} نمایش داده شد",
  drop_overlay_title: "رها کنید تا بارگذاری شود",
  drop_overlay_body: "پوشه یک اسکن شروع می‌کند؛ فایل‌ها در ابزار فعلی باز می‌شوند.",
  drop_needs_files: "فقط فایل را داخل این ابزار رها کنید، نه پوشه.",
  tab_history: "تاریخچه",
  hist_title: "تاریخچهٔ عملیات",
  hist_desc:
    "هر مرتب‌سازی، قرنطینه و پاک‌سازی که این برنامه انجام داده، از دفتر روزانهٔ undo خوانده می‌شود. جدیدترین ردیف همان چیزی است که Undo بازمی‌گرداند.",
  hist_col_when: "زمان",
  hist_col_kind: "عملیات",
  hist_col_files: "فایل‌ها",
  hist_col_size: "حجم",
  hist_col_action: "اقدام",
  hist_kind_sort: "مرتب‌سازی",
  hist_kind_quarantine: "تکراری‌ها",
  hist_kind_extras: "پاک‌سازی",
  hist_empty_title: "هنوز عملیاتی انجام نشده",
  hist_empty_body: "یک پوشه را مرتب کنید یا تکراری‌ها را قرنطینه کنید تا اینجا نمایش داده شود.",
  hist_undo: "بازگردانی",
  hist_undo_hint: "Undo فقط جدیدترین عملیات را بازمی‌گرداند.",
  hist_empty_entries: "{count} مورد خالی",
  extras_title: "پوشه‌های خالی و فایل‌های صفر بایت",
  extras_desc:
    "داخل پوشه‌ای که انتخاب می‌کنید جست‌وجو می‌شود. هر حذف در دفتر روزانه ثبت می‌شود و قابل بازگردانی است.",
  extras_btn_pick: "انتخاب پوشه…",
  extras_btn_scanning: "در حال بررسی…",
  extras_btn_rescan: "بررسی دوباره",
  extras_dirs: "پوشه‌های خالی",
  extras_files: "فایل‌های صفر بایت",
  extras_none: "در این پوشه چیزی برای پاک‌کردن نیست.",
  extras_clean: "حذف {count} مورد",
  extras_done: "{dirs} پوشه و {files} فایل حذف شد.",
  extras_failed: "{count} مورد تغییر کرده بود و رد شد.",
  extras_undo_hint: "بازگردانی آن‌ها را به‌صورت مسیر خالی بازمی‌سازد.",
  extras_scanned: "{count} مورد در {root} بررسی شد",

  app_title: "FileSorter",
  app_subtitle: "سازماندهی فوق‌العاده سریع فایل‌ها با قدرت Rust و Tauri",
  nav_aria: "ناوبری اصلی",
  nav_group_organize: "سازمان‌دهی",
  nav_group_clean: "پاک‌سازی",
  nav_group_tools: "ابزارها",
  sidebar_collapse: "جمع‌کردن نوار کناری",
  sidebar_expand: "بازکردن نوار کناری",
  banner_tech: "Tauri 2 + Rust",
  home_aria: "خانه",
  lang_switch_label: "English",
  lang_switch_title: "تغییر زبان به انگلیسی",

  reset_folder: "↺ پوشه جدید",
  theme_dark: "تغییر به پوسته تاریک",
  theme_light: "تغییر به پوسته روشن",
  theme_title: "پوسته و ظاهر",
  theme_desc:
    "پنج پوسته سنجیده: گرافیت گرم، سیاه مطلق، کاغذ روشن، سبز عمیق و رز گرم.",
  theme_name_fluent: "دودِ شیشه‌ای",
  theme_desc_fluent: "گرافیت گرم با نشان برنجی روی داده‌ها",
  theme_name_dark: "اُبسیدین",
  theme_desc_dark: "سیاه مطلق با متن سفید و نشان فولادی",
  theme_name_light: "یخ کریستالی",
  theme_desc_light: "سطوح کاغذی روشن، متن جوهری و یک نشان آبی",
  theme_name_aurora: "منشور مایع",
  theme_desc_aurora: "سبز-سیاه عمیق با نشان نعنایی روی داده‌ها",
  theme_name_sunset: "کوارتز رُز",
  theme_desc_sunset: "سطوح کاغذی گرم با نشان رزچوبی",

  tab_sort: "دسته‌بندی فایل‌ها",
  tab_junk: "پاک‌سازی زائدها",
  tab_dupes: "یافتن تکراری‌ها",
  tab_disk: "فضای دیسک",
  tab_watch: "حالت پایش",
  tab_schedule: "زمان‌بند",
  tab_pdf: "استودیوی PDF",
  tab_renamer: "تغییر نام گروهی",
  tab_images: "استودیوی تصویر",
  tab_settings: "تنظیمات",

  hero_title: "پوشه‌ای را برای سازماندهی انتخاب کنید",
  hero_subtitle: "فایل‌ها را فوراً اسکن، برنامه‌ریزی و دسته‌بندی کنید، بدون قفل شدن رابط کاربری.",
  sort_flow_title: "فایل‌ها کجا می‌روند",
  sort_flow_desc: "پوشه فقط برای پسوندهایی ساخته می‌شود که واقعاً وجود دارند.",
  hero_drop_btn: "انتخاب پوشه",
  hero_selected: "پوشه انتخاب‌شده:",
  hero_scanning: "در حال اسکن و تحلیل فایل‌ها…",
  hero_files_found: "فایل تا این لحظه پیدا شد",
  hero_stop: "توقف اسکن",
  dropzone_hint: "پوشه را اینجا رها کنید یا از دیسک انتخاب کنید. تا بازبینی برنامه، هیچ فایلی جابه‌جا نمی‌شود.",
  summary_files: "کل فایل‌ها",
  summary_size: "حجم کل",
  summary_categories: "دسته‌ها",
  btn_sort_now: "همین حالا دسته‌بندی کن",
  btn_sorting: "در حال جابه‌جایی فایل‌ها…",
  btn_rescan: "اسکن دوباره",
  btn_show_moves: "پیش‌نمایش جابه‌جایی‌های برنامه‌ریزی‌شده",
  btn_hide_moves: "بستن پیش‌نمایش",
  btn_undo: "↩ بازگردانی آخرین دسته‌بندی",
  undo_success: "فایل به مکان‌های اصلی بازگردانده شد",
  undo_skipped: "فایل به دلیل تداخل نادیده گرفته شد",
  sort_done_title: "دسته‌بندی با موفقیت انجام شد",
  sort_done_desc: "فایل با موفقیت جابه‌جا شد. یادداشت در دفتر روزانه ثبت شد.",
  preview_note:
    "پیش‌نمایش {shown} مورد نخست از {total} جابه‌جایی برنامه‌ریزی‌شده. هنگام دسته‌بندی همه فایل‌ها پردازش می‌شوند.",
  col_source: "فایل مبدأ",
  col_destination: "مقصد",
  col_category: "دسته",
  col_size: "حجم",
  matched_rule_title: "تطبیق با قانون هوشمند",
  matched_rule_badge: "هدف: {rule}",

  dupes_title: "یافتن فایل‌های تکراری یکسان",
  dupes_desc: "شناسایی فایل‌های اضافی با هش تکه‌تکه SHA-256 چندنخی برای بازیابی فضا.",
  dupes_btn_scan: "یافتن تکراری‌ها",
  dupes_btn_scanning: "در حال هش و مقایسه…",
  dupes_reclaimable: "فضای قابل بازیابی:",
  dupes_keep_oldest: "نگه‌داشتن قدیمی‌ترین نسخه",
  dupes_keep_newest: "نگه‌داشتن جدیدترین نسخه",
  dupes_btn_quarantine: "انتقال تکراری‌ها به قرنطینه",
  dupes_empty: "هیچ فایل تکراری پیدا نشد.",
  dupes_quarantine_done: "نسخه تکراری به قرنطینه منتقل شد.",
  dupes_select_folder: "برای تحلیل تکراری‌ها ابتدا یک پوشه انتخاب کنید.",
  dupes_per_file: "{size} برای هر فایل ({count} نسخه)",
  dupes_waste: "هدررفت: {size}",
  dupes_keep_tag: "[نگه‌داشتن]",
  dupes_move_tag: "× [انتقال]",

  disk_title: "میزان استفاده از فضای دیسک",
  disk_desc: "تفکیک دقیق مصرف دیسک بر اساس دسته و بزرگ‌ترین فایل‌های یافت‌شده.",
  disk_total_files: "کل فایل‌های اسکن‌شده",
  disk_total_size: "فضای اشغال‌شده",
  disk_category_breakdown: "سهم دیسک بر اساس دسته:",
  disk_largest_files: "۲۰ فایل بزرگ‌تر:",
  disk_col_name: "نام فایل",
  disk_col_size: "حجم",
  disk_col_path: "مسیر کامل",
  disk_loading: "در حال بارگذاری آمار فضای دیسک…",
  disk_pick_first: "برای تحلیل میزان استفاده از دیسک، یک پوشه انتخاب کنید.",
  disk_empty_title: "پوشه‌ای انتخاب نشده",
  disk_drives_title: "درایوها و حافظه‌های شناسایی‌شده:",
  disk_drive_name: "دیسک محلی ({letter}:)",
  disk_free_short: "{size} آزاد",
  disk_free_of: "{free} آزاد از {total}",

  junk_title: "پاک‌کننده فایل‌های زائد و کش",
  junk_desc: "جست‌وجو و حذف ایمن کش‌های موقت، فایل‌های خطا و تصاویر بندانگشتی، بدون نیاز به دسترسی مدیر.",
  junk_btn_scan: "اسکن مکان‌های زائد",
  junk_btn_scanning: "در حال اسکن مکان‌های زائد…",
  junk_btn_clean: "پاک‌سازی موارد انتخاب‌شده",
  junk_btn_cleaning: "در حال پاک‌سازی فایل‌های زائد…",
  junk_select_all: "انتخاب همه",
  junk_deselect_all: "لغو انتخاب همه",
  junk_empty: "هیچ فایل زائدی در مکان‌های اسکن‌شده یافت نشد.",
  junk_cleaned_summary: "فایل‌ها با موفقیت پاک‌سازی شدند.",
  junk_files_count: "{count} فایل",
  junk_empty_hint: "برای یافتن فایل‌های موقت و کش‌ها، روی «اسکن مکان‌های زائد» کلیک کنید.",
  junk_empty_title: "هنوز چیزی اسکن نشده",
  junk_purged_detail: "{files} فایل پاک شد ({size} آزاد شد).",
  junk_in_use_skipped: "({count} فایل در حال استفاده به‌صورت ایمن نادیده گرفته شد)",

  watch_title: "حالت پایش پس‌زمینه",
  watch_desc: "پوشه‌های دانلود یا میزکار خود را پایش کنید و فایل‌های جدید را هنگام رسیدن خودکار دسته‌بندی کنید.",
  watch_toggle_active: "پایش فعال",
  watch_add_folder: "+ افزودن پوشه پایش",
  watch_no_folders: "هیچ پوشه‌ای در حال پایش نیست. یکی در بالا اضافه کنید.",
  watch_live_log: "جریان فعالیت زنده:",
  watch_empty_log: "هنوز رویداد فایلی ثبت نشده است. پوشه‌های پایش‌شده خودکار اینجا گزارش می‌دهند.",
  watch_event_moved: "دسته‌بندی خودکار",
  watch_event_skipped: "نادیده گرفته شد",
  watch_event_failed: "ناموفق",
  watch_state_active: "فعال",
  watch_state_paused: "متوقف",
  watch_active_hint: "وقتی فعال باشد، فایل‌های جدید در پوشه‌های پایش‌شده خودکار در دسته‌ها سازماندهی می‌شوند.",
  watch_monitored_folders: "پوشه‌های پایش‌شده ({count})",

  sched_title: "زمان‌بند خودکار وظایف",
  sched_desc: "سیستم خود را با تایمرهای خودکار در پس‌زمینه تمیز و مرتب نگه دارید.",
  sched_add_task: "+ افزودن وظیفه زمان‌بندی‌شده",
  sched_no_tasks: "هنوز وظیفه خودکاری زمان‌بندی نشده است.",
  sched_empty_title: "هنوز وظیفه‌ای نیست",
  sched_run_now: "اجرای فوری",
  sched_last_run: "آخرین اجرا:",
  sched_interval: "بازه:",
  sched_new_task: "وظیفه زمان‌بندی‌شده جدید",
  sched_task_name_ph: "نام وظیفه (مثلاً پاک‌سازی روزانه)",
  sched_kind_junk: "پاک‌سازی زائدها و فایل‌های موقت",
  sched_kind_sort: "دسته‌بندی خودکار پوشه",
  sched_folder_ph: "مسیر پوشه",
  sched_interval_label: "بازه (دقیقه):",
  sched_save: "ذخیره وظیفه",
  sched_col_task: "نام وظیفه",
  sched_col_type: "نوع",
  sched_col_interval: "بازه",
  sched_col_last_run: "آخرین اجرا",
  sched_col_actions: "عملیات",
  sched_minutes: "{count} دقیقه",
  sched_never: "هرگز",
  sched_recent_runs: "اجراهای خودکار اخیر:",
  sched_task_executed: "وظیفه اجرا شد: {summary}",

  rules_title: "قوانین هوشمند کلیدواژه",
  rules_desc: "تطبیق کلیدواژه‌ها در نام فایل برای اولویت‌دهی به دسته‌های خاص پیش از پسوندهای استاندارد.",
  rules_add_btn: "+ افزودن قانون هوشمند",
  rules_no_rules: "هیچ قانون هوشمندی تنظیم نشده است. برای بازنویسی دسته‌بندی پیش‌فرض، قانون اضافه کنید.",
  rules_rule_name: "نام قانون",
  rules_category: "دسته هدف",
  rules_keywords: "کلیدواژه‌ها (با کاما جدا شوند)",
  rules_name_ph: "نام قانون (مثلاً فاکتورهای مالی)",
  rules_keywords_ph: "کلیدواژه‌ها (مثلاً فاکتور، قبض، رسید)",
  rules_col_name: "نام قانون",
  rules_col_category: "دسته هدف",
  rules_col_keywords: "کلیدواژه‌های منطبق",
  rules_col_action: "عملیات",
  notice_rule_added: "قانون هوشمند با موفقیت اضافه شد",
  notice_rule_deleted: "قانون هوشمند حذف شد",
  settings_title: "تنظیمات",
  settings_page_desc: "دسته‌ها، پسوندهای فایل و قوانین دسته‌بندی کل برنامه.",
  settings_desc: "دسته‌ها، قوانین هوشمند کلیدواژه و نگاشت پسوند فایل‌ها را سفارشی کنید.",
  settings_cat_title: "دسته‌ها و پسوند فایل‌ها",
  settings_cat_desc: "قالب‌های فایل را به دسته‌ها اختصاص دهید یا پسوند سفارشی اضافه کنید.",
  settings_btn_save: "ذخیره تنظیمات",
  settings_btn_reset: "↺ بازگردانی پیش‌فرض‌ها",
  settings_saved_notice: "تنظیمات با موفقیت ذخیره شد",
  settings_reset_notice: "تنظیمات به حالت پیش‌فرض بازگشت",
  settings_add_placeholder: "پسوند جدید (مثلاً .webp)",
  settings_add_btn: "+",
  settings_formats_count: "قالب",
  ext_remove: "حذف",

  update_check_btn: "بررسی به‌روزرسانی",
  update_checking: "در حال بررسی…",
  update_available: "به‌روزرسانی جدید موجود است!",
  update_latest: "FileSorter به‌روز است.",
  update_btn_download: "دانلود به‌روزرسانی",
  um_title: "به‌روزرسانی جدید موجود است!",
  um_desc: "نسخه جدیدی از FileSorter آماده دانلود است.",
  um_current: "فعلی:",
  um_latest: "جدیدترین:",
  um_highlights: "نکات برجسته این انتشار:",
  um_later: "بعداً یادآوری کن",
  um_download: "دانلود و نصب به‌روزرسانی",

  loader_renamer: "در حال بارگذاری تغییر نام گروهی…",
  loader_images: "در حال بارگذاری استودیوی تصویر…",
  loader_pdf: "در حال بارگذاری استودیوی PDF…",

  common_remove: "حذف",
  common_change: "تغییر",
  common_cancel: "انصراف",
  common_browse: "انتخاب",

  ob_steps_aria: "مراحل تور راهنما",
  onboarding_btn_tour: "مشاهده تور راهنما",
  ob_goto_step: "رفتن به مرحله {n}",
  ob_welcome_title: "به FileSorter خوش آمدید",
  ob_welcome_lead_a: "به‌طور کامل بر پایه ",
  ob_welcome_lead_b:
    " بازنویسی شده است: راه‌اندازی زیر یک ثانیه، برنامه بومی سبک، رابط کاربری بدون قفل شدن و پاسخ‌دهی فوری.",
  ob_feature_engine_title: "موتور بومی Rust",
  ob_feature_engine_desc:
    "اسکن موازی دیسک، هش تکه‌تکه SHA-256 برای تکراری‌ها و بازگردانی اتمی مبتنی بر دفتر روزانه.",
  ob_feature_safe_title: "هرگز بازنویسی نمی‌کند",
  ob_feature_safe_desc:
    "حل‌کننده هوشمند تداخل، نام‌های تکراری را خودکار تغییر می‌دهد (مثلاً file (2).pdf).",
  ob_theme_title: "پوسته خود را انتخاب کنید",
  ob_theme_lead:
    "پنج پوسته تخت با یک سامانه تایپوگرافی مشترک. پوسته‌ای را انتخاب کنید که به میز کار شما می‌آید:",
  ob_theme_select_aria: "انتخاب {name}",
  ob_caps_title: "یک پنجره برای همه کارهای پاک‌سازی",
  ob_caps_lead: "پوشه‌ها را مرتب کنید، کش‌ها را پاک کنید، تکراری‌ها را حذف کنید و تصاویر را فشرده کنید، همه در همین برنامه.",
  ob_cap1_title: "سازماندهی هوشمند و قوانین",
  ob_cap1_desc: "دسته‌بندی بر اساس پسوند یا ساخت قوانین کلیدواژه‌ای مطابق با بخش‌های نام فایل.",
  ob_cap2_title: "پاک‌کننده زائدها و کش",
  ob_cap2_desc: "پاک‌سازی ایمن فایل‌های موقت، کش مرورگر، خروجی‌های خطا و پایگاه تصاویر بندانگشتی.",
  ob_cap3_title: "تحلیلگر تکراری‌ها و دیسک",
  ob_cap3_desc: "یافتن فایل‌های یکسان با خط لوله سه‌مرحله‌ای SHA-256 و آزادسازی گیگابایت‌ها فضا.",
  ob_cap4_title: "حالت پایش و زمان‌بند",
  ob_cap4_desc: "هنگام رسیدن فایل، دانلود یا میزکار را خودکار دسته‌بندی کنید یا وظایف پاک‌سازی را در پس‌زمینه اجرا کنید.",
  ob_cap5_title: "استودیوهای خلاق",
  ob_cap5_desc: "تغییر نام گروهی، استودیوی تصویر (تبدیل WebP/JPEG) و استودیوی PDF همگی شامل می‌شوند.",
  ob_ready_title: "همه‌چیز آماده است!",
  ob_ready_lead_a: "یک پوشه به‌هم‌ریخته (مثل ",
  ob_ready_lead_b: " یا ",
  ob_ready_lead_c: ") انتخاب کنید و بگذارید FileSorter کار خود را با بازگردانی کامل و ایمن انجام دهد.",
  ob_downloads: "دانلودها",
  ob_desktop: "میزکار",
  ob_pick_folder_btn: "انتخاب پوشه‌ای برای سازماندهی",
  ob_go_workspace: "رفتن به فضای کار",
  ob_skip: "رد کردن",
  ob_skip_aria: "رد کردن تور راهنما",
  ob_back: "→ بازگشت",
  ob_back_aria: "مرحله قبل",
  ob_continue: "← ادامه",
  ob_continue_aria: "مرحله بعد",
  ob_get_started: "شروع کنید",
  ob_get_started_aria: "شروع",

  br_title: "تغییر نام گروهی هوشمند",
  br_desc: "تغییر نام همزمان چندین فایل و پوشه با جست‌وجو و جایگذاری، پیشوند/پسوند، شماره‌گذاری و قالب‌بندی حروف.",
  br_add_files: "افزودن فایل‌ها",
  br_add_folder: "افزودن پوشه",
  br_clear: "پاک کردن",
  br_method_replace: "جست‌وجو و جایگذاری",
  br_method_affix: "پیشوند و پسوند",
  br_method_numbering: "دنباله شماره‌گذاری",
  br_method_case: "تبدیل حروف",
  br_method_extension: "پسوند",
  br_find_label: "متن جست‌وجو:",
  br_find_ph: "مثلاً [1080p] یا copy",
  br_replace_label: "جایگذاری با:",
  br_replace_ph: "برای حذف، خالی بگذارید",
  br_match_case: "تطبیق حروف بزرگ و کوچک",
  br_regex: "الگوی regex",
  br_prefix_label: "پیشوند (در ابتدا درج می‌شود):",
  br_prefix_ph: "مثلاً 2024_",
  br_suffix_label: "پسوند (پیش از پسوند فایل):",
  br_suffix_ph: "مثلاً _final",
  br_num_prefix_label: "متن پیشوند:",
  br_num_prefix_ph: "مثلاً Item_",
  br_num_suffix_label: "متن پسوند:",
  br_num_suffix_ph: "مثلاً _doc",
  br_start_from: "شروع از:",
  br_padding: "تعداد ارقام:",
  br_keep_original: "نگه‌داشتن نام اصلی",
  br_case_lower: "حروف کوچک (my file.txt)",
  br_case_upper: "حروف بزرگ (MY FILE.TXT)",
  br_case_title: "حالت عنوان (My File.txt)",
  br_case_kebab: "کیباب-کیس (my-file.txt)",
  br_case_snake: "اسنیک-کیس (my_file.txt)",
  br_change_ext: "تغییر پسوند به:",
  br_ext_ph: "مثلاً jpg",
  br_force_lower_ext: "اجبار پسوند به حروف کوچک (مثلاً .JPG → .jpg)",
  br_renamed_ok: "{count} {unit} با موفقیت تغییر نام یافت!",
  br_failed: "{count} ناموفق ({errors})",
  br_undo: "↩ بازگردانی تغییر نام",
  br_restored: "↩ {count} {unit} به نام اصلی خود بازگردانده شد.",
  br_conflict:
    "تداخل نام شناسایی شد: چند فایل نام یکسان خواهند داشت ({names}). لطفاً پیش از اعمال، قوانین را اصلاح کنید.",
  br_empty_title: "هیچ فایلی برای تغییر نام انتخاب نشده",
  br_empty_desc: "برای آزمایش قوانین تغییر نام با پیش‌نمایش زنده و بازگردانی ایمن، فایل یا پوشه اضافه کنید.",
  br_choose_files: "انتخاب فایل‌ها",
  br_selected_count: "{count} فایل انتخاب شده · ",
  br_will_modify: "{count} مورد تغییر خواهد کرد",
  br_apply: "اعمال تغییر نام ({count})",
  br_renaming: "⏳ در حال تغییر نام…",
  br_col_original: "نام اصلی",
  br_col_new: "← نام جدید",
  br_col_status: "وضعیت",
  br_status_conflict: "تداخل",
  br_status_modified: "تغییر یافته",
  br_status_unchanged: "بدون تغییر",
  br_remove_file: "حذف فایل",
  br_file_singular: "فایل",
  br_file_plural: "فایل",

  is_title: "استودیوی تصویر",
  is_badge: "فشرده‌ساز وب بدون اتلاف و با اتلاف",
  is_desc: "تصاویر را به قالب‌های مدرن WebP، JPEG یا PNG تبدیل کنید، با فشرده‌سازی زنده و حفظ نسبت ابعاد.",
  is_add_images: "+ افزودن تصاویر",
  is_clear_all: "پاک کردن همه",
  is_success_title: "بهینه‌سازی گروهی پایان یافت!",
  is_saved_success: "{count} تصویر با موفقیت بهینه و ذخیره شد در:",
  is_original: "اصلی:",
  is_optimized: "بهینه‌شده:",
  is_saved_space: "فضای آزادشده:",
  is_reduction: "(کاهش {pct}٪)",
  is_open_folder: "بازکردن پوشه مقصد",
  is_step1: "قالب هدف",
  is_step1_desc: "قالب هدف برای تبدیل را انتخاب کنید",
  is_fmt_webp_desc: "WebP: فایل کوچک با کیفیت بالا و پشتیبانی گسترده در وب.",
  is_fmt_jpeg_desc: "JPEG: بیشترین سازگاری میان دستگاه‌ها و پلتفرم‌ها.",
  is_fmt_png_desc: "PNG: کیفیت بدون اتلاف با پشتیبانی کامل از شفافیت.",
  is_step2: "کیفیت فشرده‌سازی",
  is_quality_pristine: "کیفیت بصری دست‌نخورده",
  is_quality_balanced: "کیفیت بالا و متعادل (توصیه‌شده)",
  is_quality_aggressive: "فشرده‌سازی شدید",
  is_step3: "محدودسازی حداکثر ابعاد",
  is_step3_desc: "محدودسازی حداکثر عرض یا ارتفاع با حفظ نسبت ابعاد",
  is_dim_original: "اصلی",
  is_step4: "پسوند نام فایل",
  is_step4_desc: "به نام اضافه می‌شود (برای حفظ نام، خالی بگذارید)",
  is_step4_ph: "مثلاً _optimized یا خالی بگذارید",
  is_step5: "پوشه مقصد",
  is_choose_folder_ph: "برای انتخاب پوشه کلیک کنید...",
  is_optimize: "بهینه‌سازی و خروجی",
  is_optimizing: "⏳ در حال بهینه‌سازی",
  is_empty_title: "هنوز تصویری اضافه نشده",
  is_empty_desc:
    "برای انتخاب عکس یا گرافیک جهت فشرده‌سازی گروهی، اینجا کلیک کنید.",
  is_remove_queue: "حذف از فهرست",
  is_to: "به:",

  ps_title: "استودیوی PDF",
  ps_desc: "تصاویر را به اسناد PDF تبدیل کنید یا همه صفحات را به‌صورت تصویر با کیفیت بالا استخراج کنید.",
  ps_mode_img2pdf: "تصویر به PDF",
  ps_mode_pdf2img: "PDF به تصویر",
  ps_add_images: "افزودن تصاویر",
  ps_clear_all: "پاک کردن همه",
  ps_page_singular: "صفحه",
  ps_page_plural: "صفحه",
  ps_total: "مجموع:",
  ps_page_size: "اندازه صفحه:",
  ps_page_fit: "متناسب با اندازه تصویر",
  ps_page_a4p: "A4 عمودی استاندارد",
  ps_page_a4l: "A4 افقی استاندارد",
  ps_margins: "حاشیه‌ها:",
  ps_margin_none: "بدون حاشیه (تمام‌صفحه)",
  ps_margin_small: "کوچک (۱۵ نقطه)",
  ps_margin_normal: "معمولی (۳۰ نقطه)",
  ps_building: "⏳ در حال ساخت PDF…",
  ps_export: "خروجی به PDF",
  ps_created: "PDF با موفقیت ساخته شد!",
  ps_saved_to: "ذخیره شد در:",
  ps_open_pdf: "بازکردن PDF",
  ps_reveal: "نمایش در پوشه",
  ps_no_images_title: "هنوز تصویری اضافه نشده",
  ps_no_images_desc: "برای انتخاب تصاویر JPG، PNG، WebP یا BMP و ساخت یک سند PDF کلیک کنید.",
  ps_move_earlier: "انتقال به قبل",
  ps_move_later: "انتقال به بعد",
  ps_remove_image: "حذف تصویر",
  ps_select_pdf: "انتخاب سند PDF",
  ps_select_pdf_desc: "یک PDF انتخاب کنید تا هر صفحه به‌صورت تصویر PNG یا JPEG با کیفیت بالا استخراج شود.",
  ps_choose_pdf: "انتخاب PDF",
  ps_preview: "پیش‌نمایش",
  ps_open_pdf_doc: "بازکردن سند PDF",
  ps_extract_settings: "تنظیمات استخراج",
  ps_image_format: "قالب تصویر:",
  ps_fmt_png: "PNG (بدون اتلاف، کیفیت بالا)",
  ps_fmt_jpeg: "JPEG (حجم فایل کم)",
  ps_res_scale: "مقیاس وضوح:",
  ps_res_150: "کیفیت استاندارد (۱۵۰ DPI)",
  ps_res_200: "کیفیت بالا (۲۰۰ DPI - توصیه‌شده)",
  ps_res_300: "فوق‌العاده واضح (۳۰۰ DPI - آماده چاپ)",
  ps_page_range_label: "محدوده صفحات (مثلاً all یا 1-3, 5):",
  ps_dest_folder: "پوشه مقصد:",
  ps_extracting: "⏳ در حال استخراج",
  ps_extract_btn: "استخراج صفحات ({count})",
  ps_extracted_ok: "{count} تصویر با موفقیت استخراج شد!",
  ps_saved_size_to: "{size} ذخیره شد در:",
  ps_open_dest: "بازکردن پوشه مقصد",
  ps_page_alt: "صفحه {n}",

  tab_search: "جست‌وجوی سراسری",
  tab_compare: "مقایسهٔ پوشه‌ها",
  tab_archive: "آرشیوها",
  gs_title: "جست‌وجوی سراسری",
  gs_desc:
    "در یک پوشه (یا کل درایو) بر اساس نام، پسوند، حجم و تاریخ تغییر جست‌وجو کنید؛ هر نتیجه را می‌توانید مستقیم در پوشه‌اش باز کنید.",
  gs_root: "پوشهٔ جست‌وجو",
  gs_root_ph: "پوشه‌ای انتخاب نشده",
  gs_query: "عبارت جست‌وجو",
  gs_query_ph: "نام فایل، یا مسیری مثل invoices/2024",
  gs_mode_label: "حالت",
  gs_mode_contains: "شامل",
  gs_mode_regex: "Regex",
  gs_mode_glob: "Glob",
  gs_ext_label: "پسوندها (با کاما جدا کنید)",
  gs_ext_ph: "jpg, png, pdf",
  gs_min_label: "حداقل حجم (مگابایت)",
  gs_max_label: "حداکثر حجم (مگابایت)",
  gs_hidden: "فایل‌های مخفی هم باشند",
  gs_case: "حساس به بزرگی و کوچکی حروف",
  gs_run: "جست‌وجو",
  gs_running: "در حال جست‌وجو…",
  gs_stop: "توقف",
  gs_results: "{count} نتیجه",
  gs_scanned: "{count} فایل در {ms} میلی‌ثانیه بررسی شد",
  gs_truncated: "فقط {count} نتیجهٔ اول نمایش داده شده؛ برای دیدن بقیه فیلترها را محدودتر کنید.",
  gs_none_title: "چیزی پیدا نشد",
  gs_none_body: "عبارت را کوتاه‌تر کنید یا فیلتر پسوند و حجم را بردارید.",
  gs_col_name: "نام",
  gs_col_folder: "پوشه",
  gs_col_size: "حجم",
  gs_col_date: "تاریخ تغییر",
  gs_reveal: "نمایش در پوشه",
  gs_hint: "در حالت Glob از * و ? استفاده کنید؛ در حالت Regex الگویی مثل (jpg|png)$ کار می‌کند.",
  gs_select_all: "انتخاب همه",
  gs_selected: "{count} مورد انتخاب‌شده",
  gs_send_zip: "ساخت zip از انتخاب‌شده‌ها",
  gs_send_rename: "ارسال به تغییر نام",
  gs_send_hint: "نتیجه‌ها را تیک بزنید تا با هم zip شوند یا به تب تغییر نام بروند.",
  cmp_title: "مقایسهٔ دو پوشه",
  cmp_desc:
    "دو درخت را با SHA-256 مقایسه کنید تا بدانید چه چیزی یکسان، تغییرکرده، جابه‌جا شده یا فقط در یک طرف است.",
  cmp_left: "پوشهٔ اول",
  cmp_right: "پوشهٔ دوم",
  cmp_pick: "انتخاب پوشه",
  cmp_run: "مقایسه",
  cmp_running: "در حال مقایسه…",
  cmp_identical: "یکسان",
  cmp_changed: "تغییرکرده",
  cmp_only_left: "فقط در اولی",
  cmp_only_right: "فقط در دومی",
  cmp_moved: "جابه‌جا یا تغییرنام‌یافته",
  cmp_files: "{count} فایل",
  cmp_elapsed: "مقایسه در {ms} میلی‌ثانیه",
  cmp_hidden: "فایل‌های مخفی هم باشند",
  cmp_empty_title: "هنوز مقایسه‌ای انجام نشده",
  cmp_empty_body:
    "دو پوشه انتخاب کنید؛ هر فایل در دو طرف هش می‌شود و اختلاف‌ها دسته‌بندی می‌شوند.",
  cmp_match: "دو پوشه کاملاً یکسان‌اند",
  cmp_truncated: "برخی فهرست‌ها برای سرعت کوتاه شده‌اند؛ شمارش‌های بالا دقیق‌اند.",
  cmp_col_rel: "مسیر نسبی",
  cmp_col_left: "اولی",
  cmp_col_right: "دومی",
  cmp_running_side: "{side}: {count} فایل هش شد",
  cmp_side_left: "اولی",
  cmp_side_right: "دومی",
  arc_title: "آرشیوها",
  arc_desc: "فایل‌ها و پوشه‌ها را در یک zip جمع کنید یا یک zip را با حفظ ساختار پوشه‌ها باز کنید.",
  arc_create_title: "ساخت zip",
  arc_create_desc: "ساختار پوشه‌ها حفظ می‌شود؛ پوشهٔ انتخابی با نام خودش داخل آرشیو می‌آید.",
  arc_add_files: "+ افزودن فایل",
  arc_add_folder: "+ افزودن پوشه",
  arc_clear: "پاک کردن",
  arc_sources_empty: "هنوز چیزی برای فشرده‌سازی انتخاب نشده است.",
  arc_dest_label: "مسیر آرشیو",
  arc_dest_ph: "مثلاً D:\\backup\\photos.zip",
  arc_choose_dest: "انتخاب مسیر…",
  arc_create: "ساخت آرشیو",
  arc_creating: "در حال ساخت…",
  arc_done: "{count} فایل ({size}) در این مسیر آرشیو شد:",
  arc_skipped: "{count} مورد رد شد",
  arc_extract_title: "باز کردن zip",
  arc_extract_desc:
    "فقط مدخل‌های امن در پوشهٔ مقصد نوشته می‌شوند؛ مسیرهای ../ رد می‌شوند.",
  arc_archive_label: "فایل zip",
  arc_archive_ph: "آرشیوی انتخاب نشده",
  arc_pick_archive: "انتخاب zip",
  arc_target_label: "پوشهٔ مقصد",
  arc_target_ph: "پوشه‌ای انتخاب نشده",
  arc_extract: "باز کردن",
  arc_extracting: "در حال باز کردن…",
  arc_extracted: "{count} فایل ({size}) در این مسیر باز شد:",
  arc_overwrite: "فایل‌های موجود جایگزین شوند",
  arc_reveal: "باز کردن پوشه",
  br_method_pattern: "الگو",
  br_pattern_label: "الگوی نام",
  br_pattern_ph: "{name}_{index}{ext}",
  br_pattern_help:
    "توکن‌ها: {name} {ext} {index} {date} {time} {parent} — {NAME} و {EXT} با حروف بزرگ.",

  footer_text:
    "FileSorter · معماری بومی و بی‌وقفه با Rust و Tauri · دفتر روزانه:",
  footer_journal: "%APPDATA%\\FileSorterV2\\undo",
};

export const TRANSLATIONS: Record<Locale, I18nStrings> = { en: EN, fa: FA };

export function getStrings(lang: Locale): I18nStrings {
  return TRANSLATIONS[lang] ?? TRANSLATIONS[DEFAULT_LOCALE];
}

export const CATEGORY_LABELS: Record<Locale, Record<string, string>> = {
  en: {
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
  },
  fa: {
    images: "تصاویر",
    documents: "اسناد",
    videos: "ویدیوها",
    audio: "صدا",
    archives: "آرشیوها",
    code: "کد منبع",
    data: "فایل‌های داده",
    ebooks: "کتاب الکترونیکی",
    executables: "فایل‌های اجرایی",
    fonts: "فونت‌ها",
    others: "سایر فایل‌ها",
  },
};

export function getCategoryLabel(lang: Locale, key: string): string {
  const table = CATEGORY_LABELS[lang] ?? CATEGORY_LABELS[DEFAULT_LOCALE];
  return table[key] ?? key;
}

/** Best-effort initial locale from a saved choice or the OS/browser language. */
export function detectInitialLocale(): Locale {
  const saved = typeof localStorage !== "undefined" ? localStorage.getItem("fs_lang") : null;
  if (saved === "en" || saved === "fa") return saved;
  const nav = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "";
  return nav.startsWith("fa") || nav.startsWith("pe") ? "fa" : DEFAULT_LOCALE;
}
