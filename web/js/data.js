// ============================================
// Category Metadata
// ============================================
// Icons and bilingual display names for each category.
// Actual extensions and file counts come from AppController via pywebview.

const CATEGORY_META = {
    images:      { icon: '📸', nameEn: 'Images',      nameFa: 'تصاویر' },
    documents:   { icon: '📄', nameEn: 'Documents',   nameFa: 'اسناد' },
    videos:      { icon: '🎬', nameEn: 'Videos',      nameFa: 'ویدئو' },
    audio:       { icon: '🎵', nameEn: 'Audio',       nameFa: 'صوتی' },
    archives:    { icon: '📦', nameEn: 'Archives',    nameFa: 'آرشیو' },
    code:        { icon: '💻', nameEn: 'Code',        nameFa: 'کد' },
    data:        { icon: '🗃️', nameEn: 'Data',        nameFa: 'داده' },
    ebooks:      { icon: '📚', nameEn: 'E-Books',     nameFa: 'کتاب‌ها' },
    executables: { icon: '⚙️', nameEn: 'Executables', nameFa: 'اجراپذیرها' },
    fonts:       { icon: '🔤', nameEn: 'Fonts',       nameFa: 'فونت‌ها' },
    others:      { icon: '❓', nameEn: 'Unknown',     nameFa: 'ناشناس' },
};
