## HostBuddy

Run-time environment for AI one‑shot apps and HTML files. Create, manage, and run small client‑side projects locally on macOS and Windows.

### Why HostBuddy?
HostBuddy lets you paste either a complete HTML snippet or a single‑file React component and run it safely in a desktop app. It handles dependency setup for React projects using a bundled package manager with safeguards, so you don’t need system‑wide npm/yarn.

## Features
- **HTML or React**: Paste plain HTML or a single React component with a default export.
- **Safe dependency installs**: Uses a bundled `pnpm` with strict caps and `--ignore-scripts` to add client‑side packages referenced by your code.
- **Offline mode (per project)**: Persist dependencies for a project so it can run later without internet.
- **Zero Node integration in UI**: Renderer runs with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`.
- **Simple project storage**: Projects saved as JSON under your user data directory.

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
2. Paste either:
   - HTML: a complete snippet (inline CSS/JS allowed), or
   - React: a single component file exporting default (JSX/TSX), e.g. `export default function App() { ... }`.
3. Optional: enable "Offline use" to persist dependencies locally for offline runs.
4. Save, then click "Run" on a project card.

### Supported code and imports
- HTML is rendered as provided. If your snippet lacks a full document, HostBuddy wraps it in a minimal HTML shell.
- React components are bundled with `esbuild` at runtime.
- Imports are scanned; safe, non‑Node packages may be auto‑added and installed with size caps. Examples: `react`, `react-dom`, `lucide-react`, `recharts`.
- You can import primitives via the alias `@/components/ui/*` (Card, CardHeader, CardContent, CardTitle, Button, Input, Textarea, Label, Tabs, TabsList, TabsTrigger, TabsContent, Switch). Minimal stubs are provided when referenced.

## How It Works
- **Main process** (`src/main/main.js`): Creates the window and initializes IPC.
- **IPC handlers** (`src/main/ipc.js`):
  - Project CRUD: `projects:list|create|update|delete`
  - Run project: Detects HTML vs React. For React, prepares a temp or persistent project directory, installs dependencies via bundled `pnpm`, bundles with `esbuild`, then loads `index.html`. On failure, it logs and gracefully falls back to HTML rendering.
  - Feedback: Opens the project page in your browser.
- **Preload** (`src/preload.js`): Exposes safe APIs to the renderer via `contextBridge`.
- **Renderer UI** (`src/renderer/*`): Minimal UI to manage and run projects.
- **Project storage** (`src/main/projectsStore.js`): JSON file at user data path.

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
- Projects are stored as JSON at `projects.json` under the directory above.
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


