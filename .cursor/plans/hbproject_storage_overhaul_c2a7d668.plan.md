---
name: HBProject Storage Overhaul
overview: Migrate HostBuddy from a monolithic projects.json storage model to individual ZIP-based .hbproject files with multi-file support, runtime state persistence via Electron session partitions, a drag-and-drop creation UX, user-configurable storage directory, file type association, and auto-thumbnails.
todos:
  - id: phase1-zip-storage
    content: "Phase 1: Implement ZIP-based .hbproject storage -- add adm-zip, create settingsStore.js, rewrite projectsStore.js for ZIP read/write, update ipc.js handlers, add migration from projects.json"
    status: completed
  - id: phase2-multifile-ux
    content: "Phase 2: Multi-file project support and creation UX -- new data model with mainFile/files, drag-and-drop zone in renderer, file list with main file selector, update preload.js and ipc.js for multi-file payloads"
    status: completed
  - id: phase3-runtime-persistence
    content: "Phase 3: Runtime persistence -- stable per-project run directories, Electron session partitions for localStorage/IndexedDB, state capture/restore for export, new runnerPreload.js"
    status: completed
  - id: phase4-storage-directory
    content: "Phase 4: User-selectable storage directory -- settings UI with directory picker, IPC handlers for get/set, project migration between directories, settingsStore integration in main.js"
    status: completed
  - id: phase5-file-association
    content: "Phase 5: File type association -- electron-builder fileAssociations config, open-file event handling on macOS, process.argv handling on Windows/Linux, import-on-open flow"
    status: completed
  - id: phase6-sharing
    content: "Phase 6: Enhanced sharing -- global drag-to-import on main window, optional export-as-standalone-HTML feature"
    status: completed
  - id: phase7-thumbnails
    content: "Phase 7: Auto-thumbnails -- capturePage after run, resize and store in .hbproject ZIP, display on project cards"
    status: completed
  - id: tests
    content: "Tests: Rewrite projectsStore tests for ZIP format, add settingsStore tests, add migration tests"
    status: completed
isProject: false
---

# HBProject Storage and UX Overhaul

This plan transforms HostBuddy's project storage from a single `projects.json` file into individual ZIP-based `.hbproject` bundles, adds multi-file project support, persistent runtime state, a drag-and-drop creation flow, configurable storage directory, and native file association.

The work is sequenced so each phase builds on the previous one. Phases 1-4 are the core structural changes; Phases 5-7 are UX polish.

---

## Phase 1: ZIP-Based .hbproject as Primary Storage

**Goal:** Replace the monolithic `projects.json` with individual `.hbproject` ZIP files on disk, and a lightweight `index.json` metadata cache.

### .hbproject Internal Structure (ZIP)

```
my-app.hbproject (ZIP archive)
  manifest.json       # id, title, description, version, mainFile, createdAt, updatedAt, offline
  icon.png            # project icon (raw binary)
  files/
    index.html        # main entry file
    about.html        # additional files (future)
  assets/
    logo.png          # images/media referenced by code
  state/
    localstorage.json # runtime state snapshot (Phase 3)
  thumbnail.png       # auto-generated preview (Phase 7)
```

### Files to Change

- **Add dependency**: `adm-zip` in [package.json](package.json) for reading/writing ZIP archives (lightweight, zero native deps, works in ASAR)
- **New file**: `src/main/settingsStore.js` -- reads/writes a small `settings.json` in `app.getPath('userData')` with `projectsDir` path and format version
- **Rewrite**: [src/main/projectsStore.js](src/main/projectsStore.js) -- the core storage layer
  - Constructor takes a directory path (from settings, not hardcoded)
  - `create()` builds a ZIP from the provided data and writes `{slug}-{shortId}.hbproject` to the projects directory
  - `readAll()` / `getAll()` reads from `index.json` cache (title, id, description, icon thumbnail path, timestamps). Rebuilds cache from `.hbproject` files if missing or stale
  - `getById(id)` extracts the full project from the ZIP on demand
  - `update(id, updates)` opens the ZIP, modifies manifest/files, rewrites it
  - `delete(id)` removes the `.hbproject` file and updates the cache
  - Folders data moves into `index.json` (lightweight metadata file, not per-project)
- **Update**: [src/main/ipc.js](src/main/ipc.js) -- adapt all IPC handlers to the new store API
  - `projects:create` passes a structured object with `files[]` and `assets[]` arrays instead of a single `code` string
  - `projects:export` simply copies the `.hbproject` file to the user-chosen location (no JSON serialization needed)
  - `projects:import` copies the `.hbproject` file into the projects directory and updates the index

### Migration

- On first launch after the update, detect if `projects.json` exists in the old location
- For each project in it, create a corresponding `.hbproject` ZIP file in the new projects directory
- After successful migration, rename `projects.json` to `projects.json.migrated` as a backup
- This logic lives in a `migrateFromLegacy()` method on `ProjectsStore`

---

## Phase 2: Multi-File Project Data Model and Creation UX

**Goal:** Support dragging single/multiple HTML files (plus images) into the app, selecting the main file, and storing them in the ZIP.

### Data Model Changes

The `manifest.json` inside each `.hbproject` gains:

- `mainFile`: string (e.g., `"index.html"`) -- identifies the entry point
- `files`: array of `{ path, mimeType }` entries describing what is in `files/` and `assets/`

The old `code` string and `attachments[]` array are replaced by actual files inside the ZIP.

### Renderer Changes -- [src/renderer/index.html](src/renderer/index.html) and [src/renderer/renderer.js](src/renderer/renderer.js)

**Replace the "Manage Code" stage (Stage 2)** with a unified file input area:

- A large drop zone that accepts `.html`, `.css`, `.js`, image files, and `.hbproject` files via drag-and-drop
- A "Paste Code" button that creates a virtual `index.html` from clipboard text (preserving the current paste workflow)
- A file list below the drop zone showing all added files with:
  - Radio buttons or a dropdown to designate the main HTML file
  - Remove buttons per file
  - File size indicators
- Auto-detection: if exactly one `.html` file is dropped, auto-select it as main. If `index.html` exists among multiple, auto-select it
- The textarea remains accessible via a "Paste Code" tab for users who prefer it

**Keep Stage 1 (Setup)** mostly as-is (title, description, icon, offline toggle). Remove the separate "Attach files" step since files are now added in Stage 2.

### Preload / IPC Changes

- [src/preload.js](src/preload.js): Add `createProjectFromFiles(payload)` where payload includes `{ title, description, icon: File, mainFile: string, files: [{ path, content, mimeType }] }`
- The renderer reads dropped files via `FileReader` and sends the structured payload through IPC
- [src/main/ipc.js](src/main/ipc.js): `projects:create` handler accepts the new multi-file payload and passes it to the store which builds the ZIP

### Backward Compatibility

- If a project has only one file and no explicit `mainFile`, treat the single file as the entry point
- The "Paste Code" flow creates a project with a single `files/index.html` internally

---

## Phase 3: Runtime Persistence via Electron Session Partitions

**Goal:** Each project gets a stable run directory and isolated browser storage that persists across runs.

### Changes to [src/main/ipc.js](src/main/ipc.js) -- `projects:run` Handler

Current flow: creates temp dir -> writes HTML -> loads file -> temp dir cleaned up after 24h.

New flow:

1. **Stable run directory**: `{projectsDir}/.runs/{projectId}/` (not temp, never auto-cleaned)
2. On each run, extract `files/` and `assets/` from the `.hbproject` ZIP into the run directory, overwriting previous files
3. For HTML projects: write extracted files, then `preprocessHtmlWithAttachments()` against real file paths instead of data URIs (since assets are now real files on disk alongside the HTML)
4. For React projects: same as current `prepareReactProjectPersistent()` but using the stable directory

**Session partition** for isolated localStorage/IndexedDB per project:

```javascript
const runner = new BrowserWindow({
  webPreferences: {
    partition: `persist:project-${project.id}`,
    // ... existing prefs
  }
});
```

This gives each project its own isolated browser storage that Electron persists automatically in `{userData}/Partitions/persist:project-{id}/`.

### State Capture for Export

- Before export or on project close, inject a small script via `webContents.executeJavaScript()` to serialize `localStorage` to JSON
- Write the result into the `.hbproject` ZIP as `state/localstorage.json`
- On import + first run, a preload-like script restores the state from `state/localstorage.json` into the new partition's localStorage before the app code executes
- Add a new preload script specifically for runner windows: `src/main/runnerPreload.js` that handles state restoration

### Asset References

Replace the current `preprocessHtmlWithAttachments()` data-URI approach:

- Since assets now live as real files alongside HTML in the run directory, `<img src="logo.png">` just works with `file://` protocol
- Remove the base64 encoding/inlining step entirely for local runs
- Only use data-URI inlining for the "Export as standalone HTML" feature (Phase 6)

---

## Phase 4: User-Selectable Storage Directory

**Goal:** Let users choose where `.hbproject` files are stored.

### New File: `src/main/settingsStore.js`

```javascript
class SettingsStore {
  constructor(userDataPath) { /* reads/writes {userData}/hostbuddy-settings.json */ }
  get(key) { ... }
  set(key, value) { ... }
  getProjectsDir() { /* returns configured dir or default */ }
  setProjectsDir(newPath) { /* validates, updates, returns old path */ }
}
```

- Default projects directory: `~/Documents/HostBuddyProjects/` (more discoverable than Application Support)
- Settings file location: `{app.getPath('userData')}/hostbuddy-settings.json` (fixed, never moves)

### IPC Handlers in [src/main/ipc.js](src/main/ipc.js)

- `settings:getProjectsDir` -- returns current path
- `settings:setProjectsDir` -- opens `dialog.showOpenDialog({ properties: ['openDirectory'] })`, validates, moves/copies existing projects if user confirms, updates setting

### Preload in [src/preload.js](src/preload.js)

- `getProjectsDir()` and `setProjectsDir()` exposed to renderer

### Renderer -- Settings UI

Add a simple settings panel (accessible from a gear icon in the header or a "Settings" button):

- Shows current projects directory path
- "Change Directory" button
- Option to move existing projects to the new directory or leave them

### Main Process in [src/main/main.js](src/main/main.js)

- Initialize `SettingsStore` alongside `ProjectsStore`
- Pass `settingsStore.getProjectsDir()` to `ProjectsStore` constructor
- When the directory changes at runtime, reinitialize the store and refresh the renderer

---

## Phase 5: File Type Association (Double-Click to Open)

**Goal:** `.hbproject` files open in HostBuddy when double-clicked.

### [package.json](package.json) -- electron-builder Config

Add `fileAssociations` to the `build` config:

```json
"fileAssociations": [
  {
    "ext": "hbproject",
    "name": "HostBuddy Project",
    "description": "HostBuddy Project File",
    "mimeType": "application/x-hbproject",
    "role": "Editor"
  }
]
```

### [src/main/main.js](src/main/main.js) -- Open File Handling

- **macOS**: Handle `app.on('open-file', (event, filePath) => ...)` to import the `.hbproject` file
- **Windows/Linux**: Check `process.argv` for a `.hbproject` path on launch
- On receiving a file: show a confirmation dialog ("Import 'Project Name' into HostBuddy?"), copy the file to the projects directory, refresh the project list
- If the app is already running, focus the main window and trigger the import

---

## Phase 6: Enhanced Sharing Features

**Goal:** Improve export/import ergonomics.

### Drag-to-Import on Main Window

- Add a global `dragover`/`drop` handler on the main window (not just the create modal)
- When a `.hbproject` file is dropped on the project list, trigger the import flow with confirmation
- Visual feedback: show a full-window drop overlay ("Drop to import project")

### Export as Standalone HTML (Optional)

- Add a secondary export option: "Export as HTML" on the project card context menu
- Extracts the project, inlines all assets as data URIs, produces a single self-contained `.html` file
- Useful for sharing with non-HostBuddy users

---

## Phase 7: Auto-Thumbnails

**Goal:** Generate visual previews for project cards.

### Implementation in [src/main/ipc.js](src/main/ipc.js)

- After a successful `projects:run`, capture a screenshot via `runner.webContents.capturePage()`
- Resize to ~400x300 thumbnail
- Write into the `.hbproject` ZIP as `thumbnail.png`
- Update the `index.json` cache with a base64 thumbnail or extracted file path
- The project card in the renderer uses this thumbnail as the card image (falling back to the uploaded icon or default)

---

## File Change Summary


| File                          | Action                                          | Phase   |
| ----------------------------- | ----------------------------------------------- | ------- |
| `package.json`                | Add `adm-zip` dependency                        | 1       |
| `src/main/settingsStore.js`   | **New** -- settings persistence                 | 1, 4    |
| `src/main/projectsStore.js`   | **Rewrite** -- ZIP-based storage                | 1       |
| `src/main/ipc.js`             | **Major update** -- all handlers adapted        | 1-7     |
| `src/main/main.js`            | Add settings init, file association handling    | 1, 4, 5 |
| `src/main/runnerPreload.js`   | **New** -- state restoration for runner windows | 3       |
| `src/preload.js`              | Add settings + multi-file APIs                  | 2, 4    |
| `src/renderer/index.html`     | Redesign Stage 2, add settings UI, drop zone    | 2, 4, 6 |
| `src/renderer/renderer.js`    | Drop zone logic, file list, settings panel      | 2, 4, 6 |
| `src/renderer/styles.css`     | Drop zone styles, settings panel styles         | 2, 4, 6 |
| `tests/projectsStore.test.js` | **Rewrite** -- test ZIP-based store             | 1       |
| `tests/settingsStore.test.js` | **New** -- test settings store                  | 4       |


---

## Key Decisions and Constraints

- **adm-zip** is chosen over `archiver` because it supports both read and write, is pure JS (no native deps), and works inside Electron ASAR
- The `index.json` cache is a performance optimization only -- it can always be rebuilt from scanning `.hbproject` files. This makes the system resilient to manual file operations (drag files in/out of the folder in Finder)
- Session partitions (`persist:project-{id}`) are an Electron built-in -- no custom serialization needed for basic localStorage/IndexedDB persistence during runs. State capture into the ZIP is only needed for the export/share scenario
- The migration from `projects.json` is a one-time operation that runs automatically on upgrade
- All phases maintain backward compatibility with existing `.hbproj` import (the import handler detects old JSON format vs new ZIP format)

