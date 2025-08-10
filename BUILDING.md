### Building HostBuddy for distribution

Prereqs:
- macOS: Xcode CLT, Node 18+, pnpm installed (dev only), Apple Silicon recommended.
- Windows: Node 18+, Git for Windows. Build on Windows for .exe/NSIS.

Install dependencies:
- macOS: `npm ci`
- Windows: `npm ci`

Icons:
- Place icons at `build/icon.icns` (mac) and `build/icon.ico` (win). Already present in repo.

macOS builds (recommended to build each arch with matching node_modules):
- For Apple Silicon (arm64):
  1. `npm run dist:mac:arm64`
- For Intel (x64) on Apple Silicon (Rosetta):
  1. `npm run dist:mac:x64`
- Output DMG is unsigned by default. Configure Apple signing/notarization before wide distribution.

Windows build (run on Windows):
1. `npm ci`
2. `npm run dist:win`

Code signing (optional but recommended):
- macOS: Configure Apple ID API key/team and hardened runtime/entitlements in electron-builder.
- Windows: Provide a code-signing cert (PFX) and set env vars for electron-builder.

Notes:
- Packaging bundles a local copy of `pnpm` and uses it at runtime to install client-side packages for user projects.
- Cross-compiling is discouraged due to native optional deps (e.g., esbuild). Build on the target platform/arch when possible.

CI builds:
- You can trigger GitHub Actions workflow "Build Electron Artifacts" (workflow_dispatch) to build macOS arm64 DMG and Windows EXE and upload artifacts.


