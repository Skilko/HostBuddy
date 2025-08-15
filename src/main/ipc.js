const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const { dialog, shell } = require('electron');

// --- Helpers for safe package auto-installation ---
const SAFE_MAX_PACKAGES = 20; // prevent abuse
const SAFE_MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 MB cap
const SAFE_MAX_PER_PKG_BYTES = 12 * 1024 * 1024; // 12 MB per package cap

function stripComments(source) {
  // Removes // and /* */ comments to avoid false-positive import matches
  return String(source)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '$1');
}

function extractPackageName(specifier) {
  // Ignore relative and protocol imports
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('data:') || specifier.startsWith('node:')) return null;
  // Ignore local alias used by our bundler setup
  if (specifier.startsWith('@/')) return null;
  // Map subpath to package root
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/');
    return (scope && name) ? `${scope}/${name}` : null;
  }
  const parts = specifier.split('/');
  return parts[0] || null;
}

function isLikelySafePackageName(name) {
  // Conservative npm name validation (no spaces or special chars)
  if (!name) return false;
  const pattern = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
  if (!pattern.test(name)) return false;
  // Block clearly unsafe or irrelevant targets
  const blocked = new Set(['electron', 'fs', 'child_process', 'path', 'http', 'https', 'os', 'vm', 'worker_threads']);
  if (blocked.has(name)) return false;
  return true;
}

function parseImportedPackagesFromCode(code) {
  const src = stripComments(code);
  const found = new Set();
  const importRe = /(?:import\s+[^'"\n]+\s+from\s+(["'])([^"']+)\1)|(?:import\s*\((["'])([^"']+)\3\))|(?:import\s+(["'])([^"']+)\5\s*;)|(?:export\s+[^'"\n]+\s+from\s+(["'])([^"']+)\7)|(?:require\s*\((["'])([^"']+)\9\))/g;
  let match;
  while ((match = importRe.exec(src)) !== null) {
    const spec = match[2] || match[4] || match[6] || match[8] || match[10];
    const mapped = spec === 'react-dom/client' ? 'react-dom' : spec;
    const pkg = extractPackageName(mapped);
    if (pkg && isLikelySafePackageName(pkg)) {
      found.add(pkg);
    }
  }
  return Array.from(found);
}

function resolveBundledPnpmPath() {
  // Dev path: project/node_modules/pnpm/dist/pnpm.cjs
  const devPath = path.join(__dirname, '..', '..', 'node_modules', 'pnpm', 'dist', 'pnpm.cjs');
  if (fs.existsSync(devPath)) return devPath;
  // Production path: inside app resources
  return path.join(process.resourcesPath || '', 'pnpm', 'pnpm.cjs');
}

function runPnpm(args, options = {}) {
  const pnpmCli = resolveBundledPnpmPath();
  const result = spawnSync(process.execPath, [pnpmCli, ...args], {
    ...options,
    // In GUI context (packaged app), there is no TTY to inherit; use pipes for reliability
    stdio: options.stdio || 'pipe',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...(options.env || {}) },
    encoding: 'utf8'
  });
  return result;
}

function pnpmViewJson(cwd, pkg) {
  // Try narrow query first
  try {
    const res = runPnpm(['view', pkg, 'version', 'dist.unpackedSize', 'dist.size', '--json'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    const text = (res.stdout || '').trim();
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    }
  } catch (_) {}
  try {
    const res = runPnpm(['view', pkg, '--json'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    const text = (res.stdout || '').trim();
    if (!text) return null;
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function selectSafePackages(cwd, candidates) {
  const selected = [];
  let totalBytes = 0;
  for (const name of candidates.slice(0, SAFE_MAX_PACKAGES)) {
    const meta = pnpmViewJson(cwd, name);
    if (!meta) continue;
    const version = (meta['version']) || (meta['dist-tags'] && meta['dist-tags'].latest) || null;
    const sizeBytes = (meta.dist && (meta.dist.unpackedSize || meta.dist.size)) || meta['dist.unpackedSize'] || meta['dist.size'] || 0;
    if (!version) continue;
    if (sizeBytes > 0 && sizeBytes > SAFE_MAX_PER_PKG_BYTES) continue;
    if (sizeBytes > 0 && totalBytes + sizeBytes > SAFE_MAX_TOTAL_BYTES) continue;
    selected.push({ name, version });
    totalBytes += sizeBytes || 0;
  }
  return selected;
}

function augmentDependenciesFromCode(runDir, userCode) {
  // Read existing package.json
  const pkgPath = path.join(runDir, 'package.json');
  let pkgJson;
  try {
    pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch (_) {
    return; // nothing we can do
  }
  const baselineDeps = new Set(Object.keys(pkgJson.dependencies || {}));
  const imported = parseImportedPackagesFromCode(userCode)
    .filter((n) => !baselineDeps.has(n));
  if (imported.length === 0) return;
  const safe = selectSafePackages(runDir, imported);
  if (safe.length === 0) return;
  pkgJson.dependencies = pkgJson.dependencies || {};
  for (const { name, version } of safe) {
    // Use caret range to keep minor updates flexible
    pkgJson.dependencies[name] = `^${version}`;
  }
  fs.writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2));
}

function ensureHtmlDocument(userHtml) {
  const hasHtmlTags = /<html[\s\S]*<\/html>/i.test(userHtml);
  if (hasHtmlTags) return userHtml;
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Project</title><style>html,body{height:100%;margin:0}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif}</style></head><body>${userHtml}</body></html>`;
}

function detectCodeType(code) {
  if (!code) return 'html';
  const src = String(code);
  const trimmed = src.trim();

  // React signals first (take precedence)
  const hasReactFrom = /\bfrom\s+['\"]react['\"]/i.test(trimmed);
  const hasImportReactIdent = /\bimport\s+React\b/.test(trimmed);
  const hasDefaultExport = /\bexport\s+default\b/.test(trimmed);
  if (hasReactFrom || hasImportReactIdent || hasDefaultExport) return 'react';

  // Looks like a full HTML document if it starts with one of the root tags
  const looksLikeFullHtmlDoc = /^(?:\s*<!doctype\s+html|\s*<html[\s>]|\s*<head[\s>]|\s*<body[\s>])/i.test(trimmed);
  if (looksLikeFullHtmlDoc) return 'html';

  // Heuristic: starts with a tag → treat as HTML snippet
  const startsWithTag = /^\s*</.test(trimmed);
  if (startsWithTag) return 'html';

  // Default to HTML if unsure (safer fallback)
  return 'html';
}

function writeDetectionDebugLog(app, code, extras = {}) {
  try {
    const userBase = path.join(app.getPath('userData'), 'HostBuddy');
    fs.mkdirSync(userBase, { recursive: true });
    const sample = String(code).slice(0, 200).replace(/\n/g, '\\n');
    const trimmed = String(code).trim();
    const log = {
      ts: new Date().toISOString(),
      preview: sample,
      looksLikeFullHtmlDoc: /^(?:\s*<!doctype\s+html|\s*<html[\s>]|\s*<head[\s>]|\s*<body[\s>])/i.test(trimmed),
      hasReactFrom: /\bfrom\s+['\"]react['\"]/i.test(trimmed),
      hasImportReactIdent: /\bimport\s+React\b/.test(trimmed),
      hasDefaultExport: /\bexport\s+default\b/.test(trimmed),
      startsWithTag: /^\s*</.test(trimmed),
      ...extras,
    };
    fs.writeFileSync(path.join(userBase, 'detect-debug.log'), JSON.stringify(log, null, 2));
  } catch (_) {}
}

function makeRunDir(base) {
  const runDir = fs.mkdtempSync(path.join(base, 'hb-run-'));
  return runDir;
}

function writeStubShadcnComponents(rootDir) {
  const uiDir = path.join(rootDir, 'components', 'ui');
  fs.mkdirSync(uiDir, { recursive: true });
  const files = {
    'card.tsx': `import React from 'react';
function cn(...c: Array<string | undefined>) { return c.filter(Boolean).join(' '); }
export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('bg-white rounded-xl border border-slate-200 shadow-sm', className)} {...rest} />; }
export function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('px-4 pt-4', className)} {...rest} />; }
export function CardContent({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('px-4 pb-4', className)} {...rest} />; }
export function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) { return <h3 className={cn('font-semibold tracking-tight', className)} {...rest} />; }
`,
    'button.tsx': `import React from 'react';
function cn(...c: Array<string | undefined>) { return c.filter(Boolean).join(' '); }
type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'secondary' | 'destructive' };
export function Button({ variant = 'default', className, ...rest }: Props) {
  const base = 'inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors';
  const variants: Record<string,string> = {
    default: 'bg-slate-900 text-white hover:bg-slate-800',
    secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
    destructive: 'bg-red-600 text-white hover:bg-red-700'
  };
  return <button className={cn(base, variants[variant], className)} {...rest} />;
}
`,
    'input.tsx': `import React from 'react';
function cn(...c: Array<string | undefined>) { return c.filter(Boolean).join(' '); }
export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) { return <input className={cn('w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm', className)} {...props} />; }
`,
    'textarea.tsx': `import React from 'react';
function cn(...c: Array<string | undefined>) { return c.filter(Boolean).join(' '); }
export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className={cn('w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm', className)} {...props} />; }
`,
    'label.tsx': `import React from 'react';
function cn(...c: Array<string | undefined>) { return c.filter(Boolean).join(' '); }
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) { return <label className={cn('text-sm font-medium text-slate-700', className)} {...props} />; }
`,
    'tabs.tsx': `import React from 'react';
type TabsContextType = { value: string; setValue: (v: string) => void };
const Ctx = React.createContext<TabsContextType | null>(null);
export function Tabs({ defaultValue = '', value: controlled, onValueChange, children }: any) {
  const [uncontrolled, setUnc] = React.useState(defaultValue);
  const value = controlled ?? uncontrolled;
  const setValue = (v: string) => { setUnc(v); onValueChange?.(v); };
  return <Ctx.Provider value={{ value, setValue }}>{children}</Ctx.Provider>;
}
export function TabsList({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) { return <div className={className} {...rest} />; }
export function TabsTrigger({ value, children }: any){ const ctx = React.useContext(Ctx)!; const active = ctx.value === value; return <button onClick={() => ctx.setValue(value)} className={(active? 'bg-slate-900 text-white':'bg-slate-100 text-slate-900') + ' rounded-md px-3 py-1 text-sm mr-2'}>{children}</button>; }
export function TabsContent({ value, children }: any){ const ctx = React.useContext(Ctx)!; if (ctx.value !== value) return null; return <div>{children}</div>; }
`,
    'switch.tsx': `import React from 'react';
export function Switch({ checked, onChange, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) { return <input type="checkbox" checked={!!checked} onChange={onChange as any} {...rest} />; }
`,
  };
  for (const [file, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(uiDir, file), content);
  }
}

function writeReactScaffold(runDir, code) {
  const pkg = {
    name: 'hb-react-run',
    private: true,
    type: 'module',
    dependencies: {
      react: '^18.2.0',
      'react-dom': '^18.2.0',
      'lucide-react': '^0.474.0',
      recharts: '^2.12.7',
      '@twind/core': '^1.1.3',
      '@twind/preset-tailwind': '^1.1.4'
    }
  };
  fs.writeFileSync(path.join(runDir, 'package.json'), JSON.stringify(pkg, null, 2));

  // Minimal index.html
  fs.writeFileSync(
    path.join(runDir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>React Project</title><style>html,body,#root{height:100%}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif}</style></head><body><div id="root"></div><script type="module" src="./bundle.js"></script></body></html>`
  );

  // User app code
  const appFile = path.join(runDir, 'App.tsx');
  // Rewrite alias imports like "@/components/ui/..." to relative paths, preserving quote type
  const rewritten = code.replace(/from\s+(['"])@\//g, (_m, q) => `from ${q}./`);
  fs.writeFileSync(appFile, rewritten);

  // Entry
  const indexTsx = `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { install } from '@twind/core';
import presetTailwind from '@twind/preset-tailwind';
install({ presets: [presetTailwind()], hash: false });
const root = createRoot(document.getElementById('root')!);
root.render(React.createElement(App));`;
  fs.writeFileSync(path.join(runDir, 'index.tsx'), indexTsx);

  // Write minimal stubs for shadcn-style aliases if referenced
  if (/@\/components\/ui\//.test(code)) {
    writeStubShadcnComponents(runDir);
  }

  // Extend dependencies based on user imports with safeguards
  augmentDependenciesFromCode(runDir, code);
}

function prepareReactProject(code, baseDir) {
  const runDir = makeRunDir(baseDir);
  writeReactScaffold(runDir, code);
  return runDir;
}

function prepareReactProjectPersistent(code, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  // Keep existing node_modules; just overwrite our scaffold files
  writeReactScaffold(targetDir, code);
  return targetDir;
}

function installDependenciesWithPnpm(app, dir, { preferOffline = false } = {}) {
  const storeDir = path.join(app.getPath('userData'), 'HostBuddy', 'pnpm-store');
  const args = [
    'install',
    '--prod',
    '--ignore-scripts',
    '--no-optional',
    '--reporter', 'silent',
    '--store-dir', storeDir,
    '--registry', 'https://registry.npmjs.org/'
  ];
  if (preferOffline) args.push('--prefer-offline');
  const res = runPnpm(args, { cwd: dir });
  if (res.error || res.status !== 0) {
    const details = (res && (res.stderr || res.stdout)) ? `\n${(res.stderr || res.stdout).toString().slice(0, 2000)}` : '';
    throw new Error('Failed to install React dependencies. Ensure you are online.' + details);
  }
}

function resolveEsbuildBinaryPath() {
  // Prefer unpacked binary in production (ASAR) to avoid ENOTDIR when spawning
  const binName = process.platform === 'win32' ? 'esbuild.exe' : 'esbuild';
  // Packaged app path (inside Resources/app.asar.unpacked)
  if (process.resourcesPath) {
    const packagedCandidates = [
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'esbuild', 'bin', binName),
      // Prefer platform-specific helper when available
      path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'node_modules',
        `esbuild-${process.platform}-${process.arch}`,
        'bin',
        binName
      ),
    ];
    for (const p of packagedCandidates) {
      try { if (fs.existsSync(p)) return p; } catch (_) {}
    }
  } else {
    // Development: prefer native platform-specific binary. If not found, let esbuild resolve itself
    const devPlatformSpecific = path.join(
      __dirname,
      '..',
      '..',
      'node_modules',
      `esbuild-${process.platform}-${process.arch}`,
      'bin',
      binName
    );
    try { if (fs.existsSync(devPlatformSpecific)) return devPlatformSpecific; } catch (_) {}
    // Do NOT return the JS shim at node_modules/esbuild/bin in dev; leaving env unset lets esbuild resolve correctly
  }
  return null;
}

async function bundleWithEsbuild(dir) {
  const entry = path.join(dir, 'index.tsx');
  const outFile = path.join(dir, 'bundle.js');
  // Ensure esbuild uses a real file path (not inside app.asar) when packaged
  const binPath = resolveEsbuildBinaryPath();
  if (binPath) {
    process.env.ESBUILD_BINARY_PATH = binPath;
  }
  // Require esbuild only after ESBUILD_BINARY_PATH is set, otherwise it will try to spawn from app.asar
  const esbuild = require('esbuild');
  // Debug info to help diagnose packaged runs
  try {
    const userBase = path.join(require('electron').app.getPath('userData'), 'HostBuddy');
    fs.mkdirSync(userBase, { recursive: true });
    fs.writeFileSync(path.join(userBase, 'last-react-run-debug.log'), `binPath=${binPath || ''}\nresourcesPath=${process.resourcesPath || ''}\n`);
  } catch (_) {}
  await esbuild.build({
    entryPoints: [entry],
    outfile: outFile,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    sourcemap: false,
    logLevel: 'silent',
    jsx: 'automatic',
    loader: { '.ts': 'ts', '.tsx': 'tsx' },
    absWorkingDir: dir,
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
    alias: { '@': '.' },
    define: { 'process.env.NODE_ENV': '"production"' }
  });
  // Also emit a declarations-placeholder to avoid TS parse issues on JSX-only files
}

function initIpc(ipcMain, store, app, BrowserWindow) {
  ipcMain.handle('projects:list', () => {
    return store.getAll();
  });

  ipcMain.handle('projects:create', (event, payload) => {
    const { title, description, iconBase64, code, offline, folderId } = payload || {};
    if (!title || !code) {
      throw new Error('Title and Code are required.');
    }
    return store.create({ title, description: description || '', iconBase64: iconBase64 || null, code, offline: !!offline, folderId: folderId || null });
  });

  ipcMain.handle('projects:update', (event, id, updates) => {
    return store.update(id, updates);
  });

  ipcMain.handle('projects:delete', (event, id) => {
    return store.delete(id);
  });

  // --- Folders ---
  ipcMain.handle('folders:list', () => {
    return store.getFolders();
  });

  ipcMain.handle('folders:create', (event, name) => {
    return store.createFolder(name);
  });

  ipcMain.handle('folders:delete', (event, id) => {
    return store.deleteFolder(id);
  });

  ipcMain.handle('projects:run', async (event, id) => {
    const project = store.getById(id);
    if (!project) throw new Error('Project not found');
    const runner = new BrowserWindow({
      width: 1100,
      height: 800,
      title: project.title || 'Project',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        devTools: true,
        webSecurity: true,
      }
    });
    const userCode = project.code || '';
    const codeType = detectCodeType(userCode);
    writeDetectionDebugLog(app, userCode, { detected: codeType });
    if (codeType === 'react') {
      const userBase = path.join(app.getPath('userData'), 'HostBuddy');
      const tempBase = path.join(userBase, 'react-runs');
      fs.mkdirSync(tempBase, { recursive: true });
      try {
        let dir;
        if (project.offline) {
          const offlineDir = path.join(userBase, 'offline-runs', String(project.id));
          fs.mkdirSync(path.dirname(offlineDir), { recursive: true });
          dir = prepareReactProjectPersistent(userCode, offlineDir);
          const nodeModulesPath = path.join(dir, 'node_modules');
          try {
            const hasNodeModules = fs.existsSync(nodeModulesPath);
            if (!hasNodeModules) {
              const { response } = await dialog.showMessageBox({
                type: 'question',
                buttons: ['Install', 'Cancel'],
                defaultId: 0,
                cancelId: 1,
                title: 'Install dependencies?',
                message: 'This project needs to download client-side packages (e.g. React) one time to run offline. Install now?',
                detail: 'Packages are installed with security safeguards (no scripts) and cached for reuse.'
              });
              if (response !== 0) {
                runner.close();
                throw new Error('Installation cancelled.');
              }
              installDependenciesWithPnpm(app, dir, { preferOffline: false });
            } else {
              // Try to refresh deps if new ones were added; tolerate failures
              try { installDependenciesWithPnpm(app, dir, { preferOffline: true }); } catch (_) {}
            }
          } catch (installErr) {
            if (!fs.existsSync(nodeModulesPath)) {
              throw installErr;
            }
          }
        } else {
          dir = prepareReactProject(userCode, tempBase);
          installDependenciesWithPnpm(app, dir, { preferOffline: false });
        }
        await bundleWithEsbuild(dir);
        await runner.loadFile(path.join(dir, 'index.html'));
        return true;
      } catch (err) {
        try {
          const errMsg = (err && (err.stack || err.message || String(err))) || 'Unknown error';
          // Persist last error for troubleshooting
          const logPath = path.join(userBase, 'last-react-run-error.log');
          fs.mkdirSync(userBase, { recursive: true });
          fs.writeFileSync(logPath, `[${new Date().toISOString()}]\n${errMsg}\n`);
          // Surface an error dialog in packaged runs to make failures visible
          await dialog.showMessageBox({
            type: 'error',
            title: 'React project failed to run',
            message: 'React build or dependency install failed. Falling back to HTML view.',
            detail: errMsg.slice(0, 2000),
            buttons: ['OK']
          });
        } catch (_) {}
        // Fallback gracefully to HTML so the user still sees something
        const html = ensureHtmlDocument(userCode);
        const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
        await runner.loadURL(dataUrl);
        return true;
      }
    } else {
      const html = ensureHtmlDocument(userCode);
      const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
      await runner.loadURL(dataUrl);
      return true;
    }
  });

  // --- Export / Import helpers ---
  function slugifyBase(name) {
    const base = String(name || 'hostbuddy-project')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'hostbuddy-project';
    return base;
  }

  function shapeProjectForExport(project) {
    return {
      title: project.title || '',
      description: project.description || '',
      iconBase64: typeof project.iconBase64 === 'string' ? project.iconBase64 : null,
      code: project.code || ''
    };
  }

  function coerceImportedProject(raw) {
    const title = raw && raw.title ? String(raw.title) : '';
    const code = raw && raw.code ? String(raw.code) : '';
    if (!title || !code) return null;
    const description = raw && raw.description ? String(raw.description) : '';
    const iconBase64 = raw && typeof raw.iconBase64 === 'string' && /^data:image\//.test(raw.iconBase64)
      ? raw.iconBase64
      : null;
    return { title, description, iconBase64, code, offline: false };
  }

  ipcMain.handle('projects:export', async (event, id) => {
    const project = store.getById(id);
    if (!project) throw new Error('Project not found');
    const base = slugifyBase(project.title);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Project',
      defaultPath: `${base}.hbproj`,
      filters: [
        { name: 'HostBuddy Project', extensions: ['hbproj', 'json'] }
      ]
    });
    if (canceled || !filePath) return false;
    const payload = {
      app: 'HostBuddy',
      kind: 'project',
      version: 1,
      project: shapeProjectForExport(project)
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    return true;
  });

  ipcMain.handle('projects:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import Project(s)',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'HostBuddy Project', extensions: ['hbproj', 'json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (canceled || !filePaths || filePaths.length === 0) return [];
    const results = [];
    for (const fp of filePaths) {
      try {
        const raw = fs.readFileSync(fp, 'utf8');
        const data = JSON.parse(raw);
        const maybeList = Array.isArray(data?.projects) ? data.projects :
          (data && data.app === 'HostBuddy' && (data.kind === 'project' || data.kind === 'export') && data.project ? [data.project] :
          (Array.isArray(data) ? data : [data]));
        for (const item of maybeList) {
          const shaped = coerceImportedProject(item || {});
          if (!shaped) continue;
          const created = store.create(shaped);
          results.push({ file: fp, id: created.id, title: created.title });
        }
      } catch (_) {
        // ignore bad files, continue others
      }
    }
    return results;
  });

  ipcMain.handle('app:openFeedback', async () => {
    const { response } = await dialog.showMessageBox({
      type: 'question',
      buttons: ['OK', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title: 'Open external link?',
      message: 'This will open your browser to the Host Buddy project page.',
      detail: 'You are leaving the app to visit an external website.'
    });
    if (response === 0) {
      await shell.openExternal('https://www.bboxai.co.uk/projects/host-buddy');
      return true;
    }
    return false;
  });
}

module.exports = { initIpc };


