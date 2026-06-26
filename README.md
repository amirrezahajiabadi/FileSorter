# 📁 File Sorter

A lightweight desktop application for automatically organizing files into categorized folders.

**Developed by Dr. Hajiabadi**

---

## ✨ Features

- Browse and select any folder with a single click
- Automatically sorts files into: `images`, `documents`, `videos`, `audio`, `archives`, `others`
- Real-time operation log with color-coded status messages
- Live counter showing copied / skipped / error counts
- Skips duplicate files safely (no overwriting)
- Preserves file metadata (`copy2`)
- Splash screen on startup

---

## 🚀 Getting Started

### Run from source

**Requirements:** Python 3.8+

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/FileSorter.git
cd FileSorter

# Run directly (no dependencies needed)
python file_sorter_app.py
```

### Download the installer (Windows)

Go to the [Releases](https://github.com/YOUR_USERNAME/FileSorter/releases) page and download the latest `FileSorter_Setup.exe`.

---

## 🗂 Output Structure

After sorting, a `sorted/` folder is created inside the selected directory:

```
your-folder/
└── sorted/
    ├── images/
    ├── documents/
    ├── videos/
    ├── audio/
    ├── archives/
    └── others/
```

---

## 🛠 Build Executable (Windows)

```bash
pip install pyinstaller
pyinstaller --onefile --windowed --name "FileSorter" file_sorter_app.py
```

The `.exe` will be in the `dist/` folder.

---

## 📄 License

MIT License — free to use and modify.
