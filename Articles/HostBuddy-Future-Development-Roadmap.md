# HostBuddy — Future Development Roadmap

A prioritised catalogue of feature opportunities to expand HostBuddy's utility as a runtime environment for AI-generated one-shot apps and HTML files.

---

## Current Capabilities (Baseline)

| Area | What exists today |
|---|---|
| Project creation | 3-step wizard; paste code or drag-and-drop files |
| Code support | Plain HTML (auto-wrapped) and single-file React (JSX/TSX) |
| React build pipeline | Auto-detection, pnpm dependency install, esbuild bundle, HTML fallback |
| Dependency safety | Bundled pnpm with `--ignore-scripts`, size caps, blocklist |
| Project running | Isolated BrowserWindow per project, Electron session partition, stable run directories |
| State persistence | localStorage capture/restore via `.hbproject` ZIP |
| Offline mode | Per-project toggle to persist installed dependencies |
| Storage | ZIP-based `.hbproject` files with `index.json` cache; configurable directory |
| Organisation | Folders with drag-and-drop; sidebar filtering |
| Import / Export | `.hbproject` (ZIP) and legacy `.hbproj` (JSON); export as standalone HTML |
| File association | `.hbproject` double-click opens in HostBuddy |
| Auto-thumbnails | Screenshot captured after run, stored in ZIP, shown on cards |
| AI integration | Copy AI Context template, Request Update prompt builder |
| Stub components | shadcn-style stubs for `@/components/ui/*` imports |
| Distribution | macOS (DMG/ZIP, arm64 + x64), Windows (NSIS); GitHub Actions CI |

---

## Tier 1 — High Impact / Core Utility

### 1. Built-In Code Editor

Replace the basic textarea with an embedded editor (Monaco or CodeMirror 6) providing syntax highlighting, auto-completion, bracket matching, multi-file tabs, and error markers.

### 2. Multi-File Project Editing

Add a file-tree sidebar within the project editor so users can create, rename, delete, and switch between files. Supports real app structures with separate CSS, JS modules, and multiple pages.

### 3. Live Preview / Hot Reload

Split-pane live preview that updates as the user edits. Near-instant for HTML; fast esbuild rebuild for React. Dramatically shortens the edit-run cycle.

### 4. Version History / Undo

Track revisions per project (snapshots stored in the ZIP or as separate copies). Allow diff viewing, reverting, and branching from a snapshot — especially valuable when AI-generated updates go wrong.

### 5. Console / DevTools Panel

Surface `console.log`, `console.error`, and uncaught exceptions from the runner window into a panel in the main UI via IPC. Users currently have no visibility into runtime errors without manually opening Electron DevTools.

---

## Tier 2 — Expanding Capabilities

### 6. Support for More Frameworks

Extend the build pipeline to Vue, Svelte, and vanilla TypeScript. The esbuild pipeline is already capable; this primarily requires detection heuristics, scaffold templates, and appropriate loaders per framework.

### 7. Template / Starter Library

Offer a built-in library of project templates (Dashboard, Landing Page, Todo App, Chart Viewer, etc.) that users can start from. Ship bundled or fetch from a curated repository.

### 8. AI Chat Integration

Move beyond copy-paste prompts — embed a chat interface connected to AI APIs (OpenAI, Anthropic, local models). The user describes what they want, AI generates or modifies code directly, and the user runs it immediately.

### 9. Project Search and Tagging

Full-text search across project names, descriptions, and code. User-defined tags and labels for richer organisation beyond folders.

### 10. IndexedDB / SessionStorage Persistence

Extend state persistence to IndexedDB and sessionStorage, covering apps that use client-side databases (Dexie, idb) for richer data storage.

---

## Tier 3 — Sharing & Collaboration

### 11. One-Click Publish / Deploy

Deploy a project to a static hosting service (Netlify, Vercel, Cloudflare Pages, GitHub Pages) directly from HostBuddy. Transforms HostBuddy from a local tool into a lightweight deployment pipeline.

### 12. Project Sharing via Link

Generate a shareable link for a project — upload the `.hbproject` to a cloud service or produce a static site URL. Recipients can import the project or view it in-browser.

### 13. Cloud Sync / Backup

Optional sync of the projects directory to a cloud storage provider (iCloud, Dropbox, Google Drive, or a custom backend) for backup and cross-device access.

### 14. Collaborative Editing

Multiple users work on the same project simultaneously via WebRTC or a relay server with conflict resolution.

---

## Tier 4 — Developer Experience & Polish

### 15. Custom NPM Package Allowlist / Blocklist

Let users configure allowed/blocked packages, adjust size limits, and add private registry support for power users who need larger packages or internal libraries.

### 16. Environment Variables

Per-project environment variables injected at build time or via `window.__ENV`. Useful for API keys, feature flags, or backend URLs without hardcoding.

### 17. Asset Manager

Dedicated panel for managing project assets (images, fonts, icons) with drag-and-drop upload, preview thumbnails, copy-reference-to-clipboard, and image optimisation.

### 18. Keyboard Shortcuts & Command Palette

Command palette (Cmd+K / Ctrl+K) for quick actions and keyboard shortcuts for common operations (Cmd+R to run, Cmd+S to save, Cmd+N for new project).

### 19. Plugin / Extension System

Third-party or user-authored plugins that add new build pipelines, UI components, export targets, or AI integrations without modifying core code.

### 20. Project Analytics / Usage Stats

Track run frequency, last run date, build success/failure rate, and total runtime per project. Display on project cards or in a dashboard.

### 21. Responsive Preview Modes

Toolbar in the runner window to switch between device viewports (mobile, tablet, desktop) with common breakpoints for testing responsive designs.

### 22. Dark / Light Theme Toggle

Add a light theme and system-preference auto-detection to broaden appeal and accessibility.

### 23. Localisation / i18n

Support multiple UI languages (Spanish, French, German, Japanese, Chinese) to expand the potential user base.

### 24. Auto-Update System

Implement Electron auto-update via `electron-updater` so users receive new versions without manually downloading and reinstalling.

### 25. Accessibility Improvements

Full accessibility audit: proper focus management in modals, screen reader announcements, keyboard navigation for the project grid, and high-contrast mode support.

---

## Tier 5 — Advanced / Long-Term Vision

### 26. Local API Server for Projects

Allow projects to define simple backend routes running in a sandboxed Node process, enabling mock servers and server-side logic.

### 27. Embedded Database for Projects

Offer an embedded database (SQLite via better-sqlite3 or sql.js) for persistent structured data beyond localStorage.

### 28. Multi-Window / Multi-Project Dashboard

Run multiple projects simultaneously in a tiled or tabbed view for comparing versions or running a frontend alongside a mock API.

### 29. Git Integration

Optional per-project git version control with commit history, branches, and push/pull to GitHub.

### 30. Marketplace for Shared Projects

Community hub where users publish and discover projects, browse by category, install with one click, rate and review.

---

## Notes

- **Tiers 1–2** deliver the most immediate value and build directly on the existing architecture.
- **Tiers 3–5** progressively evolve HostBuddy from a local tool into a collaborative platform.
- The current foundation — ZIP-based storage, per-project isolation, esbuild pipeline — supports all of these additions without major architectural rewrites.
