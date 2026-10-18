export type Lang = "fa" | "en";

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
  settings_lang_title: string;
  settings_lang_desc: string;
  settings_lang_fa: string;
  settings_lang_en: string;
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

export const STRINGS: Record<Lang, I18nStrings> = {
  fa: {
    app_title: "فایل‌ساز v2",
    app_subtitle: "مرتب‌ساز فوق‌سریع فایل‌ها — قدرت گرفته از Rust & Tauri",
    reset_folder: "↺ پوشه جدید",
    theme_dark: "تغییر به تم تاریک",
    theme_light: "تغییر به تم روشن",
    tab_sort: "مرتب‌سازی فایل‌ها",
    tab_dupes: "فایل‌های تکراری",
    tab_disk: "تحلیل فضای دیسک",
    tab_settings: "تنظیمات و زبان",
    hero_title: "انتخاب پوشه برای سازمان‌دهی",
    hero_subtitle: "برای اسکن سریع و دسته‌بندی فایل‌ها بدون قفل شدن برنامه، پوشه مورد نظرتان را انتخاب کنید.",
    hero_drop_btn: "📁 انتخاب پوشه",
    hero_selected: "پوشه انتخابی:",
    hero_scanning: "در حال بررسی و شمارش فایل‌ها…",
    hero_files_found: "فایل تا الان شناسایی شد",
    hero_stop: "توقف اسکن",
    summary_files: "تعداد فایل‌ها",
    summary_size: "حجم کل",
    summary_categories: "دسته‌ها",
    btn_sort_now: "⚡ مرتب‌سازی سریع",
    btn_sorting: "در حال جابجایی فایل‌ها…",
    btn_rescan: "اسکن مجدد",
    btn_show_moves: "مشاهده پیش‌نمایش جابجایی",
    btn_hide_moves: "بستن پیش‌نمایش",
    btn_undo: "↩ بازگردانی آخرین مرتب‌سازی",
    undo_success: "فایل با موفقیت به جای قبلی بازگردانده شد",
    undo_skipped: "فایل به دلیل تداخل رد شد",
    sort_done_title: "✓ مرتب‌سازی با موفقیت انجام شد",
    sort_done_desc: "فایل با موفقیت جابجا شدند. گزارش در ژورنال ثبت شد.",
    dupes_title: "یافتن فایل‌های کاملاً تکراری",
    dupes_desc: "شناسایی فایل‌های هم‌اندازه با مقایسه محتوایی SHA-256 جهت آزادسازی حجم دیسک",
    dupes_btn_scan: "🔍 جستجوی تکراری‌ها",
    dupes_btn_scanning: "در حال هش‌گیری و مقایسه…",
    dupes_reclaimable: "فضای قابل آزادسازی:",
    dupes_keep_oldest: "نگه‌داشتن نسخه قدیمی‌تر",
    dupes_keep_newest: "نگه‌داشتن نسخه جدیدتر",
    dupes_btn_quarantine: "انتقال کپی‌های اضافه به پوشه قرنطینه",
    dupes_empty: "هیچ فایل تکراری شناسایی نشد.",
    dupes_quarantine_done: "کپی تکراری به پوشه قرنطینه منتقل شد.",
    disk_title: "آمار و تحلیل فضای مصرفی",
    disk_desc: "بررسی تفکیکی حجم هر پسوند و مشاهده حجیم‌ترین فایل‌های موجود در پوشه",
    disk_total_files: "کل فایل‌های اسکن‌شده",
    disk_total_size: "فضای اشغال‌شده",
    disk_category_breakdown: "سهم دسته‌بندی‌ها از دیسک:",
    disk_largest_files: "۲۰ فایل حجیم‌تر:",
    disk_col_name: "نام فایل",
    disk_col_size: "حجم",
    disk_col_path: "مسیر کامل",
    disk_loading: "در حال بارگذاری اطلاعات دیسک…",
    disk_pick_first: "ابتدا از برگه مرتب‌سازی پوشه‌ای را انتخاب کنید.",
    settings_title: "تنظیمات برنامه",
    settings_desc: "مدیریت زبان رابط کاربری، فرمت‌های فایل و شخصی‌سازی دسته‌بندی‌ها",
    settings_lang_title: "زبان رابط کاربری (Language)",
    settings_lang_desc: "انتخاب زبان برنامه برای تمامی بخش‌ها و متون",
    settings_lang_fa: "🇮🇷 فارسی (Persian)",
    settings_lang_en: "🇬🇧 English (انگلیسی)",
    settings_cat_title: "دسته‌بندی‌ها و فرمت‌های فایل",
    settings_cat_desc: "تعیین فرمت‌های تحت پوشش هر دسته یا افزودن پسوندهای سفارشی",
    settings_btn_save: "💾 ذخیره تنظیمات",
    settings_btn_reset: "↺ بازگردانی پیش‌فرض",
    settings_saved_notice: "تنظیمات با موفقیت ذخیره شد",
    settings_reset_notice: "تنظیمات به حالت پیش‌فرض بازگشت",
    settings_add_placeholder: "پسوند جدید (مثال: .webp)",
    settings_add_btn: "+",
    settings_formats_count: "فرمت",
    footer_text: "فایل‌ساز نسخه ۲ · معماری مدرن، موازی و ۱۰۰٪ ایمن با Rust & Tauri · ژورنال:",
    footer_journal: "%APPDATA%\\FileSorterV2\\undo",
  },
  en: {
    app_title: "FileSorter v2",
    app_subtitle: "Ultra-fast file organizer powered by Rust & Tauri",
    reset_folder: "↺ New Folder",
    theme_dark: "Switch to dark theme",
    theme_light: "Switch to light theme",
    tab_sort: "File Sorter",
    tab_dupes: "Duplicate Finder",
    tab_disk: "Disk Space Analyzer",
    tab_settings: "Settings & Language",
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
    settings_desc: "Customize application language, categories, and file extension rules.",
    settings_lang_title: "Application Language",
    settings_lang_desc: "Switch between Persian and English UI language and direction.",
    settings_lang_fa: "🇮🇷 فارسی (Persian)",
    settings_lang_en: "🇬🇧 English",
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
  },
};

export const CATEGORY_LABELS_BILINGUAL: Record<Lang, Record<string, string>> = {
  fa: {
    images: "تصاویر",
    documents: "اسناد",
    videos: "ویدیوها",
    audio: "صداها",
    archives: "آرشیوها",
    code: "کدها",
    data: "داده‌ها",
    ebooks: "کتاب‌ها",
    executables: "برنامه‌ها",
    fonts: "فونت‌ها",
    others: "سایر",
  },
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
};
