const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const crypto = require('crypto');
const esbuild = require('esbuild');

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

function npmViewJson(cwd, pkg) {
  // Try to fetch specific fields first to reduce payload and ensure size is available.
  try {
    const out = execSync(`npm view ${pkg} version dist.unpackedSize dist.size --json`, { cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 });
    const text = out.toString('utf8').trim();
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    }
  } catch (_) {
    // fall through to broader query
  }
  try {
    const out = execSync(`npm view ${pkg} --json`, { cwd, stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 });
    const text = out.toString('utf8').trim();
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
    const meta = npmViewJson(cwd, name);
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
  const looksLikeHtml = /<!doctype\s+html|<html|<head|<body/i.test(src.trim());
  if (looksLikeHtml) return 'html';
  const hasReactImports = /(from\s+['"]react['"])|import\s+React/.test(src);
  const hasDefaultExport = /export\s+default\s+/.test(src);
  if (hasReactImports || hasDefaultExport) return 'react';
  // Heuristic: if it begins with a '<' and not an HTML document tag, it's likely an HTML snippet
  const startsWithTag = /^\s*</.test(src);
  if (startsWithTag) return 'html';
  return 'html';
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

function installDependencies(dir) {
  try {
    execSync('npm pack >/dev/null 2>&1 || true', { cwd: dir, stdio: 'ignore' });
    // Install with strong safeguards
    execSync('npm i --silent --no-progress --no-audit --no-fund --omit=dev --ignore-scripts', { cwd: dir, stdio: 'inherit' });
  } catch (e) {
    throw new Error('Failed to install React dependencies. Ensure you are online.');
  }
}

async function bundleWithEsbuild(dir) {
  const entry = path.join(dir, 'index.tsx');
  const outFile = path.join(dir, 'bundle.js');
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
    const { title, description, iconBase64, code, offline } = payload || {};
    if (!title || !code) {
      throw new Error('Title and Code are required.');
    }
    return store.create({ title, description: description || '', iconBase64: iconBase64 || null, code, offline: !!offline });
  });

  ipcMain.handle('projects:update', (event, id, updates) => {
    return store.update(id, updates);
  });

  ipcMain.handle('projects:delete', (event, id) => {
    return store.delete(id);
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
            // If dependencies are already present, we can skip install unless we need updates
            if (!fs.existsSync(nodeModulesPath)) {
              installDependencies(dir);
            } else {
              // Best-effort install to pull new deps; tolerate failures for offline reuse
              try { installDependencies(dir); } catch (_) {}
            }
          } catch (installErr) {
            if (!fs.existsSync(nodeModulesPath)) {
              throw installErr;
            }
          }
        } else {
          dir = prepareReactProject(userCode, tempBase);
          installDependencies(dir);
        }
        await bundleWithEsbuild(dir);
        await runner.loadFile(path.join(dir, 'index.html'));
        return true;
      } catch (err) {
        // Fallback gracefully to HTML if bundling fails (the code might actually be HTML)
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
}

module.exports = { initIpc };


