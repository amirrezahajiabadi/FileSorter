# Build Guide — FileSorter

## Step 1 — Install PyInstaller

```bash
pip install pyinstaller
```

## Step 2 — Build the .exe

```bash
pyinstaller --onefile --windowed --name "FileSorter" file_sorter_app.py
```

- `--onefile` → single .exe file (no extra DLLs)
- `--windowed` → no black terminal window behind the app
- Output: `dist/FileSorter.exe`

---

## Step 3 — Create a proper installer (optional)

Download and install **NSIS** from https://nsis.sourceforge.io

Then create a file called `installer.nsi` with the content below and run:

```bash
makensis installer.nsi
```

### installer.nsi

```nsi
!define APP_NAME "FileSorter"
!define APP_VERSION "3.0.0"
!define PUBLISHER "Dr. Hajiabadi"
!define EXE_NAME "FileSorter.exe"
!define INSTALL_DIR "$PROGRAMFILES\FileSorter"

Name "${APP_NAME} ${APP_VERSION}"
OutFile "FileSorter_Setup.exe"
InstallDir "${INSTALL_DIR}"
RequestExecutionLevel admin

Section "Install"
  SetOutPath "$INSTDIR"
  File "dist\${EXE_NAME}"

  ; Start Menu shortcut
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${EXE_NAME}"
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${EXE_NAME}"

  ; Uninstaller
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Add to Windows Add/Remove Programs
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayName" "${APP_NAME}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "UninstallString" "$INSTDIR\Uninstall.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "Publisher" "${PUBLISHER}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}" \
    "DisplayVersion" "${APP_VERSION}"
SectionEnd

Section "Uninstall"
  Delete "$INSTDIR\${EXE_NAME}"
  Delete "$INSTDIR\Uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  RMDir "$SMPROGRAMS\${APP_NAME}"
  Delete "$DESKTOP\${APP_NAME}.lnk"
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
SectionEnd
```

This creates `FileSorter_Setup.exe` — a proper Windows installer that:
- Installs the app to `Program Files`
- Creates a Desktop shortcut
- Creates a Start Menu shortcut
- Adds to Windows "Add or Remove Programs"
- Includes an uninstaller
