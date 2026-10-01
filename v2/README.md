# FileSorter v2 — فایل‌ساز

بازنویسی کامل فایل‌ساز با **Tauri 2 + Rust**: باینری ~۶MB (نسخهٔ قبلی ۲۷MB)، استارت زیر یک ثانیه، بدون پل Python↔Web و بدون لگ.

## قابلیت‌ها (MVP)
- اسکن سریع و موازی پوشه (کرِیت `ignore`، دستهٔ هر ~۱۵۰ms به UI)
- تحلیل تکراری‌ها سه‌مرحله‌ای: حجم → هش ۶۴KB ابتدایی → SHA-256 کامل؛ با کش ماندگار (اسکن دوباره فقط فایل‌های تغییرکرده را هش می‌کند)
- مرتب‌سازی به `sorted/<دسته>/` با نام‌گذاری `name (2).ext` — هیچ‌وقت بازنویسی نمی‌کند
- انتقال با rename درون‌هم‌درایه (آنی)، کپی+تأیید+حذف بین درایوه‌ها
- ژورنال واگرد اتمیک در `%APPDATA%\FileSorterV2\undo` — مقاوم به کرش، واگرد با یک کلیک
- فایل‌های قفل skip و گزارش می‌شوند، هرگز crash نمی‌کند
- UI دارک شیشه‌ای، RTL کامل فارسی، فونت وزیرمتن (باندل محلی)

## اجرا و بیلد
```bash
cd v2
npm install
npm run tauri dev      # اجرای توسعه
npm run tauri build    # بیلد release + نصاب NSIS
npm run tauri build -- --no-bundle   # فقط exe
```

خروجی‌ها:
- `src-tauri/target/release/filesorter2.exe` — باینری مستقل (~۶.۱MB)
- `src-tauri/target/release/bundle/nsis/FileSorter_2.0.0_x64-setup.exe` — نصاب (~۲.۱MB)

## تست‌ها
```bash
cd src-tauri && cargo test     # ۱۶ تست هسته (walk/plan/dupes/undo/categories)
cargo clippy --all-targets     # صفر هشدار
```

## معماری
```
src-tauri/src/
├── categories.rs   دسته‌بندی‌ها + تنظیمات (settings.json اتمیک)
├── walk.rs         پیمایش با StopFlag و دسته‌بندی زمانی
├── dupes.rs        خط لوله هش سه‌مرحله‌ای + کش JSON
├── plan.rs         ساخت پلن (خالص، بدون دسترسی فایل‌سیستم)
├── execute.rs      اجرای پلن + قرنطینه تکراری‌ها
└── undo.rs         ژورنال اتمیک + بازپخش معکوس
```
هر عملیات طولانی در ترد جدا اجرا و با رویداد (`scan-progress`, `sort-done`, …) به UI گزارش می‌شود؛ وب‌ویو هرگز بلاک نمی‌شود.

نسخهٔ ۱ (پایتون) دست‌نخورده در ریشه باقی است تا هم‌ترازی کامل v2.
