"""Translations (fa / en) and language-aware UI helpers.

Every user-facing string lives in STRINGS. get_font()/anchor_for()/
justify_for() pick the right font family and text direction for the
active language (Tahoma + right-aligned for Persian, Segoe UI + left
for English — Tkinter has no true RTL, so this is an approximation).
"""

from app.constants import APP_VERSION


# ══════════════════════════════════════════════════════════════════
#  Translations
# ══════════════════════════════════════════════════════════════════
STRINGS = {
    "en": {
        "app_title": "File Sorter",
        "header_subtitle": "Select a folder and click Analyze & Sort",
        "dev_line": f"Developed by HajAmir  •  v{APP_VERSION}",
        "settings_btn": "⚙  Settings",
        "selected_folder_label": "Selected Folder:",
        "no_folder": "No folder selected",
        "browse_btn": "📂  Browse",
        "analyze_btn": "🔍  Analyze & Sort",
        "analyzing_btn": "⏳  Analyzing...",
        "sorting_btn": "⏳  Sorting...",
        "copied_label": "✅  Copied:",
        "skipped_label": "⏭  Skipped:",
        "errors_label": "❌  Errors:",
        "log_header": "Operation Log",
        "clear_btn": "Clear",
        "ready_log": "Ready — select a folder and click Analyze & Sort.",
        "folder_selected_log": "📂  Folder selected:\n    {path}",
        "no_folder_warning_title": "No Folder",
        "no_folder_warning_msg": "Please select a folder first.",
        "settings_saved_log": "✅  Settings saved successfully.",
        "done_log": "\n🎉  Done!\n    ✅ {copied} copied   |   ⏭ {skipped} skipped   |   ❌ {errors} errors\n    📁 Output:  {target}",
        "fatal_error_log": "❌  Fatal error:\n    {error}",
        "copied_log": "✅  Copied:   {name}   →   {category}/",
        "skipped_log": "⏭  Skipped (duplicate):   {name}",
        "error_log": "❌  Error:   {name}\n    {error}",

        "splash_title": "File Sorter",
        "splash_dev": "Developed by HajAmir",

        "settings_window_title": "Settings — File Categories",
        "settings_header": "⚙  Settings — File Categories",
        "settings_subheader": "Customize which extensions go into each category",
        "categories_label": "Categories",
        "add_cat_btn": "+ Add",
        "remove_cat_btn": "− Remove",
        "select_category_placeholder": "Select a category",
        "extensions_for": "Extensions for:  {cat}",
        "add_ext_btn": "+ Add Extension",
        "remove_ext_btn": "− Remove Selected",
        "restore_defaults_btn": "Restore Defaults",
        "save_close_btn": "✅  Save & Close",
        "cancel_btn": "Cancel",
        "no_category_warning_title": "No Category",
        "no_category_warning_msg": "Select a category first.",
        "new_category_title": "New Category",
        "new_category_label": "Category name:",
        "create_btn": "Create",
        "cannot_remove_title": "Cannot Remove",
        "cannot_remove_others_msg": "'others' category cannot be removed.",
        "remove_category_confirm_title": "Remove Category",
        "remove_category_confirm_msg": "Remove '{cat}' and all its extensions?",
        "restore_defaults_confirm_title": "Restore Defaults",
        "restore_defaults_confirm_msg": "Reset all categories to default?",

        "analysis_window_title": "Folder Analysis",
        "analysis_header": "🔍  Folder Analysis",
        "analysis_subheader": "Review the report below before sorting",
        "total_files": "Total Files",
        "total_size": "Total Size",
        "large_files": "Large Files",
        "old_files": "Old Files",
        "files_by_category": "Files by Category",
        "smart_suggestions": "💡  Smart Suggestions",
        "no_issues": "✅  No issues found — folder looks clean!",
        "proceed_btn": "▶  Proceed with Sort",
        "files_count_suffix": "{count} files",

        "suggestion_large": "⚠  {n} large file(s) found (>100MB). Consider archiving them to save space.",
        "suggestion_old": "📅  {n} file(s) older than 1 year. Consider archiving or deleting.",
        "suggestion_unknown": "❓  Unknown extensions found: {exts}. Add them to Settings → Categories.",
        "suggestion_others": "📁  {n} file(s) will go to 'others'. Open Settings to assign their extensions.",

        "lang_toggle_to": "فا",
        "theme_toggle_to_dark": "🌙",
        "theme_toggle_to_light": "☀",
    },
    "fa": {
        "app_title": "مرتب‌کننده فایل",
        "header_subtitle": "یک پوشه انتخاب کنید و روی «تحلیل و مرتب‌سازی» کلیک کنید",
        "dev_line": f"توسعه‌یافته توسط HajAmir  •  نسخه {APP_VERSION}",
        "settings_btn": "⚙  تنظیمات",
        "selected_folder_label": "پوشه انتخاب‌شده:",
        "no_folder": "پوشه‌ای انتخاب نشده",
        "browse_btn": "📂  انتخاب پوشه",
        "analyze_btn": "🔍  تحلیل و مرتب‌سازی",
        "analyzing_btn": "⏳  در حال تحلیل...",
        "sorting_btn": "⏳  در حال مرتب‌سازی...",
        "copied_label": "✅  کپی‌شده:",
        "skipped_label": "⏭  رد شده:",
        "errors_label": "❌  خطاها:",
        "log_header": "گزارش عملیات",
        "clear_btn": "پاک کردن",
        "ready_log": "آماده — یک پوشه انتخاب کنید و روی «تحلیل و مرتب‌سازی» کلیک کنید.",
        "folder_selected_log": "📂  پوشه انتخاب شد:\n    {path}",
        "no_folder_warning_title": "پوشه‌ای انتخاب نشده",
        "no_folder_warning_msg": "لطفاً ابتدا یک پوشه انتخاب کنید.",
        "settings_saved_log": "✅  تنظیمات با موفقیت ذخیره شد.",
        "done_log": "\n🎉  تمام شد!\n    ✅ {copied} کپی‌شده   |   ⏭ {skipped} رد شده   |   ❌ {errors} خطا\n    📁 خروجی:  {target}",
        "fatal_error_log": "❌  خطای بحرانی:\n    {error}",
        "copied_log": "✅  کپی شد:   {name}   ←   {category}/",
        "skipped_log": "⏭  رد شد (تکراری):   {name}",
        "error_log": "❌  خطا:   {name}\n    {error}",

        "splash_title": "مرتب‌کننده فایل",
        "splash_dev": "توسعه‌یافته توسط HajAmir",

        "settings_window_title": "تنظیمات — دسته‌بندی فایل‌ها",
        "settings_header": "⚙  تنظیمات — دسته‌بندی فایل‌ها",
        "settings_subheader": "تعیین کنید هر پسوند به کدام دسته برود",
        "categories_label": "دسته‌بندی‌ها",
        "add_cat_btn": "+ افزودن",
        "remove_cat_btn": "− حذف",
        "select_category_placeholder": "یک دسته انتخاب کنید",
        "extensions_for": "پسوندهای دسته:  {cat}",
        "add_ext_btn": "+ افزودن پسوند",
        "remove_ext_btn": "− حذف انتخاب‌شده",
        "restore_defaults_btn": "بازگردانی پیش‌فرض‌ها",
        "save_close_btn": "✅  ذخیره و بستن",
        "cancel_btn": "انصراف",
        "no_category_warning_title": "دسته‌ای انتخاب نشده",
        "no_category_warning_msg": "لطفاً ابتدا یک دسته انتخاب کنید.",
        "new_category_title": "دسته جدید",
        "new_category_label": "نام دسته:",
        "create_btn": "ایجاد",
        "cannot_remove_title": "غیرقابل حذف",
        "cannot_remove_others_msg": "دسته «others» قابل حذف نیست.",
        "remove_category_confirm_title": "حذف دسته",
        "remove_category_confirm_msg": "دسته «{cat}» و تمام پسوندهای آن حذف شود؟",
        "restore_defaults_confirm_title": "بازگردانی پیش‌فرض",
        "restore_defaults_confirm_msg": "تمام دسته‌بندی‌ها به حالت پیش‌فرض بازگردانده شود؟",

        "analysis_window_title": "تحلیل پوشه",
        "analysis_header": "🔍  تحلیل پوشه",
        "analysis_subheader": "قبل از مرتب‌سازی، گزارش زیر را بررسی کنید",
        "total_files": "کل فایل‌ها",
        "total_size": "حجم کل",
        "large_files": "فایل‌های حجیم",
        "old_files": "فایل‌های قدیمی",
        "files_by_category": "فایل‌ها بر اساس دسته",
        "smart_suggestions": "💡  پیشنهادهای هوشمند",
        "no_issues": "✅  مشکلی پیدا نشد — پوشه تمیز است!",
        "proceed_btn": "▶  ادامه مرتب‌سازی",
        "files_count_suffix": "{count} فایل",

        "suggestion_large": "⚠  {n} فایل حجیم (بیش از ۱۰۰ مگابایت) پیدا شد. بهتر است آرشیو شوند.",
        "suggestion_old": "📅  {n} فایل قدیمی‌تر از ۱ سال پیدا شد. بهتر است آرشیو یا حذف شوند.",
        "suggestion_unknown": "❓  پسوندهای ناشناخته پیدا شد: {exts}. آن‌ها را در تنظیمات → دسته‌بندی‌ها اضافه کنید.",
        "suggestion_others": "📁  {n} فایل به دسته «others» می‌روند. برای دسته‌بندی آن‌ها به تنظیمات مراجعه کنید.",

        "lang_toggle_to": "EN",
        "theme_toggle_to_dark": "🌙",
        "theme_toggle_to_light": "☀",
    },
}


def get_font(lang: str, size: int = 10, weight: str = "normal") -> tuple:
    """Return a font tuple appropriate for the given language.

    Tahoma renders Persian glyphs correctly on Windows; Segoe UI is used
    for English to match the original design.

    Args:
        lang: Either "fa" or "en".
        size: Font point size.
        weight: "normal" or "bold".

    Returns:
        A tkinter-compatible font tuple.
    """
    family = "Tahoma" if lang == "fa" else "Segoe UI"
    if weight == "normal":
        return (family, size)
    return (family, size, weight)


def anchor_for(lang: str) -> str:
    """Return the text anchor ("e" for Persian/RTL-ish, "w" for English)."""
    return "e" if lang == "fa" else "w"


def justify_for(lang: str) -> str:
    """Return the text justify mode matching the language's reading direction."""
    return "right" if lang == "fa" else "left"
