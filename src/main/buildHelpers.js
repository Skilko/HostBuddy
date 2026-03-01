const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SAFE_MAX_PACKAGES = 20;
const SAFE_MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const SAFE_MAX_PER_PKG_BYTES = 12 * 1024 * 1024;

function stripComments(source) {
  return String(source)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\n)\s*\/\/.*(?=\n|$)/g, '$1');
}

function extractPackageName(specifier) {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('data:') || specifier.startsWith('node:')) return null;
  if (specifier.startsWith('@/')) return null;
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/');
    return (scope && name) ? `${scope}/${name}` : null;
  }
  return specifier.split('/')[0] || null;
}

function isLikelySafePackageName(name) {
  if (!name) return false;
  if (!/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)) return false;
  const blocked = new Set(['electron', 'fs', 'child_process', 'path', 'http', 'https', 'os', 'vm', 'worker_threads']);
  return !blocked.has(name);
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
    if (pkg && isLikelySafePackageName(pkg)) found.add(pkg);
  }
  return Array.from(found);
}

function resolveBundledPnpmPath() {
  const devPath = path.join(__dirname, '..', '..', 'node_modules', 'pnpm', 'dist', 'pnpm.cjs');
  if (fs.existsSync(devPath)) return devPath;
  return path.join(process.resourcesPath || '', 'pnpm', 'pnpm.cjs');
}

function runPnpm(args, options = {}) {
  return spawnSync(process.execPath, [resolveBundledPnpmPath(), ...args], {
    ...options,
    stdio: options.stdio || 'pipe',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...(options.env || {}) },
    encoding: 'utf8'
  });
}

function pnpmViewJson(cwd, pkg) {
  try {
    const res = runPnpm(['view', pkg, 'version', 'dist.unpackedSize', 'dist.size', '--json'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    const text = (res.stdout || '').trim();
    if (text) { const p = JSON.parse(text); if (p && typeof p === 'object' && !Array.isArray(p)) return p; }
  } catch (_) {}
  try {
    const res = runPnpm(['view', pkg, '--json'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    const text = (res.stdout || '').trim();
    if (!text) return null;
    const p = JSON.parse(text);
    return p && typeof p === 'object' ? p : null;
  } catch (_) { return null; }
}

function selectSafePackages(cwd, candidates) {
  const selected = [];
  let totalBytes = 0;
  for (const name of candidates.slice(0, SAFE_MAX_PACKAGES)) {
    const meta = pnpmViewJson(cwd, name);
    if (!meta) continue;
    const version = meta.version || (meta['dist-tags'] && meta['dist-tags'].latest) || null;
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
  const pkgPath = path.join(runDir, 'package.json');
  let pkgJson;
  try { pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch (_) { return; }
  const baselineDeps = new Set(Object.keys(pkgJson.dependencies || {}));
  const imported = parseImportedPackagesFromCode(userCode).filter(n => !baselineDeps.has(n));
  if (imported.length === 0) return;
  const safe = selectSafePackages(runDir, imported);
  if (safe.length === 0) return;
  pkgJson.dependencies = pkgJson.dependencies || {};
  for (const { name, version } of safe) pkgJson.dependencies[name] = `^${version}`;
  fs.writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2));
}

function preprocessHtmlWithAttachments(html, attachments) {
  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) return html;
  let result = html;
  const map = {};
  for (const att of attachments) { if (att.filename && att.data) map[att.filename] = att.data; }
  for (const [filename, dataUri] of Object.entries(map)) {
    const esc = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patterns = [
      new RegExp(`src=["']${esc}["']`, 'gi'), new RegExp(`src=${esc}(?=[\\s>])`, 'gi'),
      new RegExp(`href=["']${esc}["']`, 'gi'), new RegExp(`href=${esc}(?=[\\s>])`, 'gi')
    ];
    for (const pat of patterns) {
      result = result.replace(pat, m => m.startsWith('src=') ? `src="${dataUri}"` : m.startsWith('href=') ? `href="${dataUri}"` : m);
    }
  }
  return result;
}

function ensureHtmlDocument(userHtml) {
  if (/<html[\s\S]*<\/html>/i.test(userHtml)) return userHtml;
  return `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Project</title><style>html,body{height:100%;margin:0}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif}</style></head><body>${userHtml}</body></html>`;
}

function detectCodeType(code) {
  if (!code) return 'html';
  const t = String(code).trim();
  if (/\bfrom\s+['\"]react['\"]/i.test(t) || /\bimport\s+React\b/.test(t) || /\bexport\s+default\b/.test(t)) return 'react';
  if (/^(?:\s*<!doctype\s+html|\s*<html[\s>]|\s*<head[\s>]|\s*<body[\s>])/i.test(t)) return 'html';
  if (/^\s*</.test(t)) return 'html';
  return 'html';
}

function writeDetectionDebugLog(app, code, extras = {}) {
  try {
    const base = path.join(app.getPath('userData'), 'HostBuddy');
    fs.mkdirSync(base, { recursive: true });
    const t = String(code).trim();
    fs.writeFileSync(path.join(base, 'detect-debug.log'), JSON.stringify({
      ts: new Date().toISOString(), preview: String(code).slice(0, 200).replace(/\n/g, '\\n'),
      looksLikeFullHtmlDoc: /^(?:\s*<!doctype\s+html|\s*<html[\s>]|\s*<head[\s>]|\s*<body[\s>])/i.test(t),
      hasReactFrom: /\bfrom\s+['\"]react['\"]/i.test(t), hasImportReactIdent: /\bimport\s+React\b/.test(t),
      hasDefaultExport: /\bexport\s+default\b/.test(t), startsWithTag: /^\s*</.test(t), ...extras,
    }, null, 2));
  } catch (_) {}
}

function makeRunDir(base) {
  return fs.mkdtempSync(path.join(base, 'hb-run-'));
}

function writeStubShadcnComponents(rootDir) {
  const uiDir = path.join(rootDir, 'components', 'ui');
  fs.mkdirSync(uiDir, { recursive: true });
  const files = {
    'card.tsx': `import React from 'react';\nfunction cn(...c: Array<string | undefined>) { return c.filter(Boolean).join(' '); }\nexport function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('bg-white rounded-xl border border-slate-200 shadow-sm', className)} {...rest} />; }\nexport function CardHeader({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('px-4 pt-4', className)} {...rest} />; }\nexport function CardContent({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) { return <div className={cn('px-4 pb-4', className)} {...rest} />; }\nexport function CardTitle({ className, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) { return <h3 className={cn('font-semibold tracking-tight', className)} {...rest} />; }\n`,
    'button.tsx': `import React from 'react';\nfunction cn(...c: Array<string | undefined>) { return c.filter(Boolean).join(' '); }\ntype Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'secondary' | 'destructive' };\nexport function Button({ variant = 'default', className, ...rest }: Props) {\n  const base = 'inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors';\n  const variants: Record<string,string> = { default: 'bg-slate-900 text-white hover:bg-slate-800', secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200', destructive: 'bg-red-600 text-white hover:bg-red-700' };\n  return <button className={cn(base, variants[variant], className)} {...rest} />;\n}\n`,
    'input.tsx': `import React from 'react';\nfunction cn(...c: Array<string | undefined>) { return c.filter(Boolean).join(' '); }\nexport function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) { return <input className={cn('w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm', className)} {...props} />; }\n`,
    'textarea.tsx': `import React from 'react';\nfunction cn(...c: Array<string | undefined>) { return c.filter(Boolean).join(' '); }\nexport function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className={cn('w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm', className)} {...props} />; }\n`,
    'label.tsx': `import React from 'react';\nfunction cn(...c: Array<string | undefined>) { return c.filter(Boolean).join(' '); }\nexport function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) { return <label className={cn('text-sm font-medium text-slate-700', className)} {...props} />; }\n`,
    'tabs.tsx': `import React from 'react';\ntype TabsContextType = { value: string; setValue: (v: string) => void };\nconst Ctx = React.createContext<TabsContextType | null>(null);\nexport function Tabs({ defaultValue = '', value: controlled, onValueChange, children }: any) { const [uncontrolled, setUnc] = React.useState(defaultValue); const value = controlled ?? uncontrolled; const setValue = (v: string) => { setUnc(v); onValueChange?.(v); }; return <Ctx.Provider value={{ value, setValue }}>{children}</Ctx.Provider>; }\nexport function TabsList({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) { return <div className={className} {...rest} />; }\nexport function TabsTrigger({ value, children }: any){ const ctx = React.useContext(Ctx)!; const active = ctx.value === value; return <button onClick={() => ctx.setValue(value)} className={(active? 'bg-slate-900 text-white':'bg-slate-100 text-slate-900') + ' rounded-md px-3 py-1 text-sm mr-2'}>{children}</button>; }\nexport function TabsContent({ value, children }: any){ const ctx = React.useContext(Ctx)!; if (ctx.value !== value) return null; return <div>{children}</div>; }\n`,
    'switch.tsx': `import React from 'react';\nexport function Switch({ checked, onChange, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) { return <input type="checkbox" checked={!!checked} onChange={onChange as any} {...rest} />; }\n`,
  };
  for (const [file, content] of Object.entries(files)) fs.writeFileSync(path.join(uiDir, file), content);
}

function writeReactScaffold(runDir, code) {
  fs.writeFileSync(path.join(runDir, 'package.json'), JSON.stringify({
    name: 'hb-react-run', private: true, type: 'module',
    dependencies: { react: '^18.2.0', 'react-dom': '^18.2.0', 'lucide-react': '^0.474.0', recharts: '^2.12.7', '@twind/core': '^1.1.3', '@twind/preset-tailwind': '^1.1.4' }
  }, null, 2));
  fs.writeFileSync(path.join(runDir, 'index.html'),
    `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>React Project</title><style>html,body,#root{height:100%}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif}</style></head><body><div id="root"></div><script type="module" src="./bundle.js"></script></body></html>`);
  const rewritten = code.replace(/from\s+(['"])@\//g, (_m, q) => `from ${q}./`);
  fs.writeFileSync(path.join(runDir, 'App.tsx'), rewritten);
  fs.writeFileSync(path.join(runDir, 'index.tsx'),
    `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport App from './App';\nimport { install } from '@twind/core';\nimport presetTailwind from '@twind/preset-tailwind';\ninstall({ presets: [presetTailwind()], hash: false });\nconst root = createRoot(document.getElementById('root')!);\nroot.render(React.createElement(App));`);
  if (/@\/components\/ui\//.test(code)) writeStubShadcnComponents(runDir);
  augmentDependenciesFromCode(runDir, code);
}

function prepareReactProject(code, baseDir) {
  const runDir = makeRunDir(baseDir);
  writeReactScaffold(runDir, code);
  return runDir;
}

function prepareReactProjectPersistent(code, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  writeReactScaffold(targetDir, code);
  return targetDir;
}

function installDependenciesWithPnpm(app, dir, { preferOffline = false } = {}) {
  const storeDir = path.join(app.getPath('userData'), 'HostBuddy', 'pnpm-store');
  const args = ['install', '--prod', '--ignore-scripts', '--no-optional', '--reporter', 'silent', '--store-dir', storeDir, '--registry', 'https://registry.npmjs.org/'];
  if (preferOffline) args.push('--prefer-offline');
  const res = runPnpm(args, { cwd: dir });
  if (res.error || res.status !== 0) {
    const details = (res && (res.stderr || res.stdout)) ? `\n${(res.stderr || res.stdout).toString().slice(0, 2000)}` : '';
    throw new Error('Failed to install React dependencies. Ensure you are online.' + details);
  }
}

function resolveEsbuildBinaryPath() {
  const binName = process.platform === 'win32' ? 'esbuild.exe' : 'esbuild';
  if (process.resourcesPath) {
    const candidates = [
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'esbuild', 'bin', binName),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', `esbuild-${process.platform}-${process.arch}`, 'bin', binName),
    ];
    for (const p of candidates) { try { if (fs.existsSync(p)) return p; } catch (_) {} }
  } else {
    const dev = path.join(__dirname, '..', '..', 'node_modules', `esbuild-${process.platform}-${process.arch}`, 'bin', binName);
    try { if (fs.existsSync(dev)) return dev; } catch (_) {}
  }
  return null;
}

async function bundleWithEsbuild(dir) {
  const binPath = resolveEsbuildBinaryPath();
  if (binPath) process.env.ESBUILD_BINARY_PATH = binPath;
  const esbuild = require('esbuild');
  try {
    const base = path.join(require('electron').app.getPath('userData'), 'HostBuddy');
    fs.mkdirSync(base, { recursive: true });
    fs.writeFileSync(path.join(base, 'last-react-run-debug.log'), `binPath=${binPath || ''}\nresourcesPath=${process.resourcesPath || ''}\n`);
  } catch (_) {}
  await esbuild.build({
    entryPoints: [path.join(dir, 'index.tsx')], outfile: path.join(dir, 'bundle.js'),
    bundle: true, format: 'esm', platform: 'browser', sourcemap: false, logLevel: 'silent',
    jsx: 'automatic', loader: { '.ts': 'ts', '.tsx': 'tsx' }, absWorkingDir: dir,
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.json'], alias: { '@': '.' },
    define: { 'process.env.NODE_ENV': '"production"' }
  });
}

module.exports = {
  preprocessHtmlWithAttachments, ensureHtmlDocument, detectCodeType,
  writeDetectionDebugLog, makeRunDir, prepareReactProject,
  prepareReactProjectPersistent, installDependenciesWithPnpm, bundleWithEsbuild,
};
