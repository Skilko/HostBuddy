## Installing HostBuddy (macOS and Windows)

This guide explains how to install and run the HostBuddy app from the provided distribution files on macOS (.dmg) and Windows (.exe).

### What you’ll download
- macOS: a `.dmg` disk image, e.g., `HostBuddy-0.1.0-arm64.dmg` (Apple Silicon) or `HostBuddy-0.1.0.dmg` (Intel x64)
- Windows: an installer `.exe`, e.g., `HostBuddy Setup 0.1.0.exe`

### System requirements
- macOS: a recent version of macOS on Apple Silicon or Intel. Use the `arm64` DMG on M1/M2/M3 Macs; use the Intel DMG on older Intel-based Macs.
- Windows: Windows 10 or Windows 11, 64-bit.

Note: Current distributions are unsigned. You may see macOS Gatekeeper or Windows SmartScreen warnings during first run.

---

### macOS installation
1. Download the `HostBuddy-<version>-<arch>.dmg` file.
2. Double-click the `.dmg` to open it (a Finder window will appear).
3. Drag the `HostBuddy` app into your `Applications` folder.
4. Eject the mounted disk image from Finder.
5. Launch HostBuddy from `Applications`.

First launch on macOS (bypassing Gatekeeper for unsigned builds):
- If you see a message like “HostBuddy can’t be opened because it is from an unidentified developer,” do one of the following:
  - Control-click the `HostBuddy` app in `Applications`, choose Open, then click Open in the dialog; or
  - Go to System Settings → Privacy & Security, scroll to Security, and click “Open Anyway” for HostBuddy; then click Open on the next prompt.

Apple Silicon vs Intel DMGs:
- On Apple Silicon (M1/M2/M3), prefer the `arm64` DMG.
- On Intel Macs, use the Intel/x64 DMG.

Uninstalling on macOS:
- Quit the app, then drag `HostBuddy.app` from `Applications` to Trash.
- Optional: remove app data at `~/Library/Application Support/HostBuddy` to fully reset.

---

### Windows installation
1. Download `HostBuddy Setup <version>.exe`.
2. Double-click the installer. If prompted by User Account Control (UAC), click Yes to proceed.
3. Follow the installer prompts (for one-click installers, it will finish automatically).
4. Launch HostBuddy from the Start Menu (or Desktop shortcut, if created).

SmartScreen (unsigned builds):
- If Windows SmartScreen warns you, click “More info,” then “Run anyway.”

Uninstalling on Windows:
- Go to Settings → Apps → Installed apps → HostBuddy → Uninstall, or use the “Uninstall HostBuddy” shortcut if present.
- Optional: remove app data at `%APPDATA%\HostBuddy` to fully reset.

---

### Where your data is stored
- macOS: `~/Library/Application Support/HostBuddy`
- Windows: `%APPDATA%\HostBuddy`

Deleting the above directory removes all saved projects and local settings.

---

### Running your first project
1. Open HostBuddy.
2. Click “New Project” and provide a Title and either:
   - Plain HTML (self-contained), or
   - A single-file React component with a default export.
3. Optionally enable “Offline use” if you want dependencies cached persistently for offline runs.
4. Click Save, then Run.

About dependencies:
- For React projects, HostBuddy may need to download client-side packages (e.g., React) on first run.
- Installs are performed via a bundled package manager with safeguards and no lifecycle scripts.
- For “Offline use,” the initial install requires an internet connection; subsequent runs can be offline.

---

### Troubleshooting
macOS
- “HostBuddy can’t be opened because it is from an unidentified developer”:
  - Control-click → Open → Open, or allow in System Settings → Privacy & Security → “Open Anyway.”
- “App is damaged and can’t be opened” after download:
  - Re-download the DMG. If the message persists, you can remove the quarantine attribute as an advanced step:
    ```bash
    xattr -dr com.apple.quarantine /Applications/HostBuddy.app
    ```
    Then try opening the app again (Control-click → Open).
- App doesn’t start or stays on “Verifying…”:
  - Quit the app, eject the DMG if mounted, and try again. If using Intel build on Apple Silicon, install the arm64 build instead.

Windows
- SmartScreen warning:
  - Click “More info” → “Run anyway.”
- Installer blocked by antivirus or corporate policy:
  - Temporarily allow the installer or contact your administrator.
- App won’t start:
  - Reboot and try launching from the Start Menu; check that your security software isn’t blocking it.

Networking and proxies
- If dependency installation fails for a React project, ensure your internet connection allows access to the npm registry and that any system proxies are configured correctly.

---

### FAQ
- Does HostBuddy auto-update?
  - Not currently. Install new versions by replacing the app (macOS) or re-running the installer (Windows).
- Does HostBuddy run code safely?
  - User code runs in a browser-like environment with Node integration disabled and context isolation enabled. Avoid running untrusted code.


