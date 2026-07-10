# 🧠 Claude Context File — HajAmir

> این فایل رو هر session اول به Claude بده تا context کامل داشته باشه.
> بعد از هر پروژه یا پیشرفت مهم آپدیتش کن.

---

## 👤 Profile

- **Alias:** HajAmir
- **Goal:** MLOps Engineer
- **Current Level:** Python intermediate, ML beginner
- **Learning Style:** Project-based (ساختن پروژه = یادگیری)

---

## 🗺 Roadmap (در حال طی کردن)

- [x] Python intermediate
- [ ] Git & GitHub حرفه‌ای (در حال یادگیری)
- [ ] FastAPI
- [ ] Docker
- [ ] ML fundamentals
- [ ] MLOps (CI/CD, model registry, monitoring)

---

## ✅ Completed Projects

### 1. FileSorter
- **Repo:** https://github.com/amirrezahajiabadi/FileSorter
- **Stack:** Python, Tkinter, PyInstaller
- **Latest Version:** v3.0.0
- **v1.0 Features:** GUI desktop app, file categorization, dark UI (Catppuccin), splash screen
- **v2.0 Features:**
  - ⚙ Settings panel — customize categories & extensions
  - 🔍 Smart Analysis — folder report before sorting
  - 💡 Smart Suggestions — large files, old files, unknown extensions
  - 🎨 Modern light theme
  - 📁 New categories: code, data, ebooks, executables, fonts
  - 💾 Settings persisted to disk (`~/.filesorter_settings.json`)
- **v3.0 Features:**
  - 🌐 Bilingual UI — Persian (فارسی) و English، تعویض runtime با یک دکمه
  - 🎨 Dark / Light theme system — پالت مجزا برای هرکدوم (دارک = الهام از Catppuccin Mocha)
  - `STRINGS` dict (`fa`/`en`) برای همه متن‌های UI، `THEMES` dict برای پالت رنگ کامل هر مود
  - `_rebuild_ui()` — با تغییر زبان یا تم، کل ویجت‌ها destroy و از نو ساخته میشن (سازگاری کامل تضمین میشه)
  - `configure_ttk_style()` — رنگ‌آمیزی ویجت‌های ttk (Progressbar, Scrollbar) که به تنظیمات رنگ معمولی Tkinter واکنش نشون نمی‌دن
  - فونت وابسته به زبان: Tahoma برای فارسی (پشتیبانی درست از RTL/گلیف)، Segoe UI برای انگلیسی
  - زبان و تم هم توی `~/.filesorter_settings.json` ذخیره و بعد از ری‌استارت حفظ میشن
- **Releases:** v1.0.0, v2.0.0, v3.0.0 — exe available

### 2. PasswordGenerator
- **Repo:** https://github.com/amirrezahajiabadi/PasswordGenerator
- **Stack:** Python, Tkinter, PyInstaller, requests, pyperclip
- **Latest Version:** v1.0.0
- **Features:** 5 generation modes (PIN/Text/Mixed/Keyword/Passphrase), strength meter, breach checker (HaveIBeenPwned), password history, export, Glassmorphism dark UI
- **Release:** v1.0.0 — exe available

---

## 🔜 Next Projects (planned)

### 3. ClipMind
- **Idea:** Clipboard manager + Screenshot OCR + AI (Gemini)
- **Stack:** Python, Tkinter, pytesseract, pystray, SQLite, Google Gemini API
- **PRD:** Ready (ClipMind_PRD.md)
- **Status:** Not started

### 4. TBD — First FastAPI project
- Simple REST API روی یکی از پروژه‌های قبلی

### 5. TBD — First Docker project
- Containerize کردن FastAPI app

---

## 🛠 Tech Stack (used so far)

| Technology   | Level        | Used in                        |
|--------------|--------------|--------------------------------|
| Python       | Intermediate | All projects                   |
| Tkinter      | Good         | FileSorter, PasswordGenerator  |
| Git & GitHub | Learning     | All projects                   |
| PyInstaller  | Basic        | All projects                   |
| requests     | Basic        | PasswordGenerator              |
| JSON/SQLite  | Basic        | FileSorter v2.0/v3.0 (settings)|
| i18n (fa/en) | Basic        | FileSorter v3.0                |

---

## 📌 Working Preferences

- **زبان:** فارسی برای توضیحات، انگلیسی برای کد و کامنت‌ها
- **Git:** هر بار که Git لازم شد، مرحله به مرحله توضیح بده
- **Code style:** کامنت انگلیسی، کد تمیز، ساختار پوشه‌بندی درست
- **Developer alias:** HajAmir (در کد و UI)
- **هر پروژه شامل:** README، .gitignore، requirements.txt، GitHub Release

---

## 💬 How to use Claude effectively

### شروع هر session:
```
این context منه: [paste این فایل]
میخوام روی [موضوع] کار کنم.
```

### برای کد:
```
کد [فلان feature] رو بنویس.
باگ این کد رو پیدا کن: [کد]
این کد رو refactor کن برای [هدف]
```

### برای Git:
```
میخوام [کار] رو commit کنم، دستورش چیه؟
```

---

## 📝 Notes & Decisions

- پروژه‌های desktop با Tkinter ساخته میشن (نه web — فعلاً)
- فعلاً focus روی Python و Git — FastAPI بعداً
- هر پروژه باید روی GitHub با Release کامل باشه
- از PyInstaller برای ساخت exe استفاده میشه
- UI theme: FileSorter v3.0 حالا هم Light و هم Dark theme داره (کاربر runtime انتخاب می‌کنه) — PasswordGenerator همچنان Glassmorphism dark ثابت
- الگوی i18n که توی FileSorter v3.0 پیاده شد (`STRINGS` dict + `get_font(lang)` + `_rebuild_ui()`) می‌تونه برای پروژه‌های بعدی هم دوباره استفاده بشه

---

*Last updated: 2026-07-10*
