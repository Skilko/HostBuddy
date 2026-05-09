## HostBuddy

Run-time environment for AI one‑shot apps and HTML files. Create, manage, and run small client‑side projects locally on macOS and Windows.

### Why HostBuddy?
HostBuddy lets you paste either a complete HTML snippet or a single‑file React component and run it safely in a desktop app. It handles dependency setup for React projects using a bundled package manager with safeguards, so you don’t need system‑wide npm/yarn.

## Features
- **HTML or React**: Paste plain HTML or a single React component with a default export. HTML projects also support multi-file drop (one main HTML + supporting attachments).
- **File attachments**: Attach images, CSS, and JS files to any project. References by filename (e.g. `<img src="logo.png">`) are automatically resolved at runtime.
- **Safe dependency installs**: Uses a bundled `pnpm` with strict caps and `--ignore-scripts` to add client‑side packages referenced by your code.
- **Offline mode (per project)**: Persist dependencies for a project so it can run later without internet.
- **Zero Node integration in UI**: Renderer runs with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`.
- **ZIP-based project storage**: Projects saved as `.hbproject` ZIP files (manifest + source + assets) under your user data directory.
- **Import/Export projects**: Export a project to a portable `.hbproject` file and import one or multiple projects back into the app. Legacy `.hbproj` / `.json` files are also supported on import.
- **Folders and drag‑and‑drop**: Create, rename, and delete folders; drag project cards into folders to organize. Drop onto "All Projects" to unassign.
- **Improved creation flow & accessibility**: Step‑by‑step modal for creating projects, icon buttons with `aria-label`s, and better keyboard/assistive support.

### What's new since v0.1.1
- Project storage migrated to `.hbproject` ZIP format (manifest + source + assets + optional localStorage state + thumbnail).
- Project import/export via `.hbproject` ZIP files; legacy `.hbproj` / `.json` import still supported.
- Multi-file drag-and-drop on create: drop a folder's worth of files and HostBuddy picks the main HTML automatically.
- Folders sidebar: create/rename/delete and drag‑and‑drop project assignment.
- Revamped project creation modal with a guided step layout.
- Accessibility improvements to action buttons and dialogs.

## Quick Start (Development)
### Prerequisites
- Node 18+
- macOS or Windows

### Install and run
```bash
npm ci
npm start
```

### Tests
```bash
npm test
```
Jest runs in a Node environment. Current tests cover the `ProjectsStore`.

## Using the App
1. Click "New Project" and enter a Title.
2. Paste or drop your code:
   - **HTML**: a complete snippet (inline CSS/JS allowed). You can also **drag and drop multiple files** — HostBuddy selects the first `.html` file as the main entry and treats the rest as attachments.
   - **React**: a single component file exporting default (JSX/TSX), e.g. `export default function App() { ... }`.
3. Optional: attach supporting files (images, CSS, JS) via the attachment picker. Reference them by filename in your code — HostBuddy resolves them at runtime.
4. Optional: enable "Offline use" to persist dependencies locally for offline runs.
5. Save, then click "Run" on a project card.

### Organizing with folders
- Use the Folders sidebar to **Add**, **Rename**, or **Delete** folders.
- Drag project cards into a folder to assign them. Click a folder to filter the grid.
- Drop a project onto "All Projects" to remove its folder assignment.

### Importing and exporting projects
- **Export**: On a project card, click Export to save a `.hbproject` (ZIP) file you can share or back up.
- **Import**: Click the top‑bar Import button and select one or more `.hbproject` files. Legacy `.hbproj` / `.json` files from older versions are also accepted.
- **Drag to import**: Drag a `.hbproject` file directly onto the HostBuddy window to import it.

### Supported code and imports
- HTML is rendered as provided. If your snippet lacks a full document, HostBuddy wraps it in a minimal HTML shell.
- React components are bundled with `esbuild` at runtime.
- Imports are scanned; safe, non‑Node packages may be auto‑added and installed with size caps. Examples: `react`, `react-dom`, `lucide-react`, `recharts`.
- You can import primitives via the alias `@/components/ui/*` (Card, CardHeader, CardContent, CardTitle, Button, Input, Textarea, Label, Tabs, TabsList, TabsTrigger, TabsContent, Switch). Minimal stubs are provided when referenced.

## How It Works
- **Main process** (`src/main/main.js`): Creates the window and initializes IPC. Handles `open-file` events and CLI arguments for `.hbproject` files.
- **IPC handlers** (`src/main/ipc.js`):
  - Project CRUD: `projects:list|create|update|delete`
  - Project import/export: `projects:import` (reads `.hbproject` ZIP or legacy `.hbproj`/`.json`), `projects:export` (writes `.hbproject` ZIP)
  - Folder management: `folders:list`, `folders:create`, `folders:rename`, `folders:delete`
  - Run project: Detects HTML vs React. For React, prepares a temp or persistent project directory, installs dependencies via bundled `pnpm`, bundles with `esbuild`, then loads `index.html`. For HTML, writes the main file and all attachments to the run directory and preprocesses asset references. On failure, it logs and gracefully falls back to HTML rendering.
  - Feedback: Opens the project page in your browser.
- **Preload** (`src/preload.js`): Exposes safe APIs to the renderer via `contextBridge`.
- **Renderer UI** (`src/renderer/*`): Minimal UI to manage and run projects.
- **Project storage** (`src/main/projectsStore.js`): Each project is stored as a `.hbproject` ZIP file containing `manifest.json`, `files/<mainFile>` (source), `assets/` (attachments), and optional `thumbnail.png` / `state/localstorage.json`.

## Security Model
- Renderer windows run with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`.
- React dependency installation uses the bundled `pnpm` with:
  - `--ignore-scripts`, `--no-optional`
  - Download size caps (per package and total)
  - Basic npm name validation and blocklist for Node built‑ins
- Do not run untrusted code. HostBuddy is optimized for small, client‑only apps.

## Data & Paths
- App data directory (per OS):
  - macOS: `~/Library/Application Support/HostBuddy`
  - Windows: `%APPDATA%/HostBuddy`
- Projects are stored as individual `.hbproject` ZIP files in a `projects/` subdirectory under the app data directory above.
- Each `.hbproject` ZIP contains: `manifest.json`, `files/<mainFile>` (source), `assets/` (attachments), and optionally `thumbnail.png`, `icon.<ext>`, and `state/localstorage.json`.
- Exported projects: portable `.hbproject` ZIP files you can share or re‑import. Legacy `.hbproj` (JSON) files from older versions can still be imported.
- React run logs (helpful for troubleshooting):
  - `last-react-run-error.log`
  - `last-react-run-debug.log`

## Building for Distribution
Use `electron-builder` scripts in `package.json`.

Common commands:
```bash
# macOS (build each arch on matching hardware)
npm run dist:mac:arm64
npm run dist:mac:x64

# Windows (run on Windows)
npm run dist:win
```
See `BUILDING.md` for detailed steps, signing, and CI notes. Installation steps for end users are in `INSTALLATION.md`.

## Project Structure
```
assets/
  default-app.png
src/
  main/            # Electron main process + IPC + store
  preload.js       # Safe API surface to renderer
  renderer/        # UI (HTML/CSS/JS)
tests/             # Jest tests
```

Default app icon (used by the renderer): `assets/default-app.png`.

## Troubleshooting
- First‑run dependency install fails (React projects): ensure internet access to the npm registry. Corporate proxies/firewalls may need configuration.
- On macOS, for unsigned builds, you may need to open via Finder context menu → Open (see `INSTALLATION.md`).
- If a React run fails, HostBuddy logs the error and falls back to HTML rendering so you still see output. Check the log files in your app data directory.

## Feedback
Use the in‑app "Feedback" button, or visit the project page: `https://www.bboxai.co.uk/projects/host-buddy`.

## Contributing
- Keep changes minimal and consistent with existing patterns.
- Add or update tests for major functionality (`npm test`).
- Mind cross‑platform behavior (macOS/Windows) and ensure no sensitive paths or credentials are committed.

## License
MIT


