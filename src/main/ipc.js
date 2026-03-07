const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const { dialog, shell } = require('electron');
const {
  preprocessHtmlWithAttachments, ensureHtmlDocument, detectCodeType,
  writeDetectionDebugLog, makeRunDir, prepareReactProject,
  prepareReactProjectPersistent, installDependenciesWithPnpm, bundleWithEsbuild,
} = require('./buildHelpers');

function slugifyBase(name) {
  return String(name || 'hostbuddy-project').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'hostbuddy-project';
}

function coerceImportedProject(raw) {
  const title = raw && raw.title ? String(raw.title) : '';
  const code = raw && raw.code ? String(raw.code) : '';
  if (!title || !code) return null;
  const description = raw && raw.description ? String(raw.description) : '';
  const iconBase64 = raw && typeof raw.iconBase64 === 'string' && /^data:image\//.test(raw.iconBase64) ? raw.iconBase64 : null;
  let attachments = [];
  if (Array.isArray(raw.attachments)) {
    attachments = raw.attachments
      .filter(a => a && typeof a === 'object' && a.filename && a.data && typeof a.filename === 'string' && typeof a.data === 'string')
      .map(a => ({ filename: String(a.filename), mimeType: typeof a.mimeType === 'string' ? String(a.mimeType) : 'application/octet-stream', data: String(a.data) }));
  }
  return { title, description, iconBase64, code, offline: false, attachments };
}

function initIpc(ipcMain, initialStore, settingsStore, app, BrowserWindow) {
  const ctx = { store: initialStore };

  // ---- Project CRUD ----
  ipcMain.handle('projects:list', () => ctx.store.getAll());
  ipcMain.handle('projects:get', (_event, id) => ctx.store.getById(id));

  ipcMain.handle('projects:create', (_event, payload) => {
    const { title, description, iconBase64, code, offline, attachments } = payload || {};
    if (!title || !code) throw new Error('Title and Code are required.');
    return ctx.store.create({ title, description: description || '', iconBase64: iconBase64 || null, code, offline: !!offline, attachments });
  });

  ipcMain.handle('projects:update', (_event, id, updates) => ctx.store.update(id, updates));

  ipcMain.handle('projects:delete', (_event, id) => {
    const deleted = ctx.store.delete(id);
    if (deleted) {
      const userBase = path.join(app.getPath('userData'), 'HostBuddy');
      try { const d = path.join(userBase, 'offline-runs', String(id)); if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
      try { const d = path.join(ctx.store.projectsDir, '.runs', String(id)); if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true }); } catch (_) {}
      // Clean up old temp run dirs older than 24h
      const maxAge = 24 * 60 * 60 * 1000;
      const now = Date.now();
      for (const dirName of ['html-runs', 'react-runs']) {
        try {
          const base = path.join(userBase, dirName);
          if (!fs.existsSync(base)) continue;
          for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            const dp = path.join(base, entry.name);
            try { if (now - fs.statSync(dp).mtimeMs > maxAge) fs.rmSync(dp, { recursive: true, force: true }); } catch (_) {}
          }
        } catch (_) {}
      }
    }
    return deleted;
  });

  // ---- Run (stable per-project directory + session partition) ----
  const runnerPreloadPath = path.join(__dirname, 'runnerPreload.js');
  const pendingRunnerStates = new Map();
  const activeRunners = new Map();

  ipcMain.handle('runner:getState', (event) => {
    const webContentsId = event.sender.id;
    const state = pendingRunnerStates.get(webContentsId) || null;
    pendingRunnerStates.delete(webContentsId);
    return state;
  });

  ipcMain.handle('projects:run', async (_event, id) => {
    const existing = activeRunners.get(id);
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return true;
    }

    const project = ctx.store.getById(id);
    if (!project) throw new Error('Project not found');

    const runsBase = path.join(ctx.store.projectsDir, '.runs');
    const runDir = path.join(runsBase, String(id));
    fs.mkdirSync(runDir, { recursive: true });

    const runner = new BrowserWindow({
      width: 1100, height: 800, title: project.title || 'Project',
      webPreferences: {
        nodeIntegration: false, contextIsolation: true, sandbox: false,
        preload: runnerPreloadPath,
        devTools: true, webSecurity: true,
        partition: `persist:project-${id}`
      }
    });

    activeRunners.set(id, runner);
    const savedState = _loadProjectState(ctx.store.getProjectFilePath(id));
    pendingRunnerStates.set(runner.webContents.id, savedState);

    runner.on('close', (event) => {
      event.preventDefault();
      _captureAndSaveState(runner, ctx.store, id).finally(() => {
        activeRunners.delete(id);
        runner.destroy();
      });
    });
    runner.on('closed', () => { activeRunners.delete(id); });
    runner.webContents.on('did-finish-load', () => {
      setTimeout(() => _captureThumbnail(runner, ctx.store, id), 2000);
    });

    const userCode = project.code || '';
    const codeType = detectCodeType(userCode);
    writeDetectionDebugLog(app, userCode, { detected: codeType });

    if (codeType === 'react') {
      const userBase = path.join(app.getPath('userData'), 'HostBuddy');
      try {
        if (project.offline) {
          prepareReactProjectPersistent(userCode, runDir);
          const nmPath = path.join(runDir, 'node_modules');
          try {
            if (!fs.existsSync(nmPath)) {
              const { response } = await dialog.showMessageBox({
                type: 'question', buttons: ['Install', 'Cancel'], defaultId: 0, cancelId: 1,
                title: 'Install dependencies?',
                message: 'This project needs to download client-side packages (e.g. React) one time to run offline. Install now?',
                detail: 'Packages are installed with security safeguards (no scripts) and cached for reuse.'
              });
              if (response !== 0) { runner.close(); throw new Error('Installation cancelled.'); }
              installDependenciesWithPnpm(app, runDir, { preferOffline: false });
            } else {
              try { installDependenciesWithPnpm(app, runDir, { preferOffline: true }); } catch (_) {}
            }
          } catch (e) { if (!fs.existsSync(nmPath)) throw e; }
        } else {
          prepareReactProjectPersistent(userCode, runDir);
          installDependenciesWithPnpm(app, runDir, { preferOffline: false });
        }
        await bundleWithEsbuild(runDir);
        await runner.loadFile(path.join(runDir, 'index.html'));
        return true;
      } catch (err) {
        try {
          const errMsg = (err && (err.stack || err.message || String(err))) || 'Unknown error';
          fs.mkdirSync(userBase, { recursive: true });
          fs.writeFileSync(path.join(userBase, 'last-react-run-error.log'), `[${new Date().toISOString()}]\n${errMsg}\n`);
          await dialog.showMessageBox({ type: 'error', title: 'React project failed to run', message: 'React build or dependency install failed. Falling back to HTML view.', detail: errMsg.slice(0, 2000), buttons: ['OK'] });
        } catch (_) {}
        // Fallback to HTML in the same stable run dir
        const html = ensureHtmlDocument(preprocessHtmlWithAttachments(userCode, project.attachments));
        fs.writeFileSync(path.join(runDir, 'index.html'), html, 'utf8');
        await runner.loadFile(path.join(runDir, 'index.html'));
        return true;
      }
    } else {
      // Write all assets to the run directory so file:// references work
      _writeAssetsToRunDir(runDir, project.attachments);
      const html = ensureHtmlDocument(preprocessHtmlWithAttachments(userCode, project.attachments));
      fs.writeFileSync(path.join(runDir, 'index.html'), html, 'utf8');
      await runner.loadFile(path.join(runDir, 'index.html'));
      return true;
    }
  });

  // ---- Folders ----
  ipcMain.handle('folders:list', () => ctx.store.getFolders());
  ipcMain.handle('folders:create', (_event, payload) => ctx.store.createFolder({ name: payload && payload.name ? String(payload.name).slice(0, 120) : 'New Folder' }));
  ipcMain.handle('folders:rename', (_event, id, name) => ctx.store.renameFolder(id, String(name || '')));
  ipcMain.handle('folders:delete', (_event, id) => ctx.store.deleteFolder(id));

  // ---- Export (includes latest state snapshot) ----
  ipcMain.handle('projects:export', async (_event, id) => {
    const fp = ctx.store.getProjectFilePath(id);
    if (!fp || !fs.existsSync(fp)) throw new Error('Project not found');
    const project = ctx.store.getById(id);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Project', defaultPath: `${slugifyBase(project.title)}.hbproject`,
      filters: [{ name: 'HostBuddy Project', extensions: ['hbproject'] }]
    });
    if (canceled || !filePath) return false;
    // Try to capture fresh state from any open runner for this project
    const runners = BrowserWindow.getAllWindows().filter(w => {
      try { return w.webContents.session === require('electron').session.fromPartition(`persist:project-${id}`); } catch (_) { return false; }
    });
    if (runners.length > 0) {
      try {
        const stateJson = await runners[0].webContents.executeJavaScript('JSON.stringify(localStorage)');
        _saveStateToZip(fp, JSON.parse(stateJson));
      } catch (_) {}
    }
    fs.copyFileSync(fp, filePath);
    return true;
  });

  // ---- Export as standalone HTML ----
  ipcMain.handle('projects:exportHtml', async (_event, id) => {
    const project = ctx.store.getById(id);
    if (!project) throw new Error('Project not found');
    const base = slugifyBase(project.title);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export as Standalone HTML', defaultPath: `${base}.html`,
      filters: [{ name: 'HTML File', extensions: ['html'] }]
    });
    if (canceled || !filePath) return false;
    const html = ensureHtmlDocument(preprocessHtmlWithAttachments(project.code || '', project.attachments));
    fs.writeFileSync(filePath, html, 'utf8');
    return true;
  });

  // ---- Import (supports both legacy .hbproj JSON and new .hbproject ZIP) ----
  ipcMain.handle('projects:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import Project(s)', properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'HostBuddy Project', extensions: ['hbproject', 'hbproj', 'json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (canceled || !filePaths || filePaths.length === 0) return [];
    const results = [];
    for (const fp of filePaths) {
      try {
        if (fp.endsWith('.hbproject')) {
          const imported = _importZipProject(fp, ctx.store);
          if (imported) results.push(imported);
        } else {
          const imported = _importLegacyJson(fp, ctx.store);
          results.push(...imported);
        }
      } catch (_) {}
    }
    return results;
  });

  ipcMain.handle('projects:importFile', async (_event, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) return [];
    const results = [];
    try {
      if (filePath.endsWith('.hbproject')) {
        const imported = _importZipProject(filePath, ctx.store);
        if (imported) results.push(imported);
      } else {
        results.push(..._importLegacyJson(filePath, ctx.store));
      }
    } catch (_) {}
    return results;
  });

  // ---- Settings ----
  ipcMain.handle('settings:getProjectsDir', () => settingsStore.getProjectsDir());
  ipcMain.handle('settings:setProjectsDir', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose Projects Directory', properties: ['openDirectory', 'createDirectory']
    });
    if (canceled || !filePaths || filePaths.length === 0) return null;
    const newDir = filePaths[0];
    settingsStore.setProjectsDir(newDir);
    const ProjectsStore = require('./projectsStore');
    ctx.store = new ProjectsStore(newDir);
    return newDir;
  });

  // ---- Misc ----
  ipcMain.handle('app:openFeedback', async () => {
    const { response } = await dialog.showMessageBox({
      type: 'question', buttons: ['OK', 'Cancel'], defaultId: 0, cancelId: 1,
      title: 'Open external link?', message: 'This will open your browser to the Host Buddy project page.',
      detail: 'You are leaving the app to visit an external website.'
    });
    if (response === 0) { await shell.openExternal('https://www.bboxai.co.uk/projects/host-buddy'); return true; }
    return false;
  });

  ipcMain.handle('app:getVersion', () => {
    try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')).version || '0.0.0'; }
    catch (_) { return '0.0.0'; }
  });
}

function _importZipProject(fp, store) {
  const zip = new AdmZip(fp);
  let manifest;
  try { manifest = JSON.parse(zip.readAsText('manifest.json')); } catch (_) { return null; }
  const mainFile = manifest.mainFile || 'index.html';
  let code = '';
  try { code = zip.readAsText(`files/${mainFile}`); } catch (_) {}
  if (!manifest.title || !code) return null;

  let iconBase64 = null;
  for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg']) {
    const entry = zip.getEntry(`icon.${ext}`);
    if (entry) {
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      iconBase64 = `data:${mime};base64,${entry.getData().toString('base64')}`;
      break;
    }
  }

  const attachments = [];
  for (const entry of zip.getEntries()) {
    if (entry.entryName.startsWith('assets/') && !entry.isDirectory) {
      const filename = path.basename(entry.entryName);
      const ext = path.extname(filename).toLowerCase().slice(1);
      const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', css: 'text/css', js: 'application/javascript' };
      const mimeType = mimeMap[ext] || 'application/octet-stream';
      attachments.push({ filename, mimeType, data: `data:${mimeType};base64,${entry.getData().toString('base64')}` });
    }
  }

  const created = store.create({
    title: manifest.title, description: manifest.description || '',
    iconBase64, code, offline: !!manifest.offline, attachments
  });
  return { file: fp, id: created.id, title: created.title };
}

function _importLegacyJson(fp, store) {
  const raw = fs.readFileSync(fp, 'utf8');
  const data = JSON.parse(raw);
  const maybeList = Array.isArray(data?.projects) ? data.projects
    : (data && data.app === 'HostBuddy' && (data.kind === 'project' || data.kind === 'export') && data.project ? [data.project]
    : (Array.isArray(data) ? data : [data]));
  const results = [];
  for (const item of maybeList) {
    const shaped = coerceImportedProject(item || {});
    if (!shaped) continue;
    const created = store.create(shaped);
    results.push({ file: fp, id: created.id, title: created.title });
  }
  return results;
}

// ---- State persistence helpers ----

function _loadProjectState(hbprojectPath) {
  if (!hbprojectPath || !fs.existsSync(hbprojectPath)) return null;
  try {
    const zip = new AdmZip(hbprojectPath);
    const entry = zip.getEntry('state/localstorage.json');
    if (!entry) return null;
    return JSON.parse(entry.getData().toString('utf-8'));
  } catch (_) { return null; }
}

function _saveStateToZip(hbprojectPath, stateObj) {
  if (!hbprojectPath || !fs.existsSync(hbprojectPath) || !stateObj) return;
  try {
    const zip = new AdmZip(hbprojectPath);
    try { zip.deleteFile('state/localstorage.json'); } catch (_) {}
    zip.addFile('state/localstorage.json', Buffer.from(JSON.stringify(stateObj, null, 2)));
    zip.writeZip(hbprojectPath);
  } catch (_) {}
}

async function _captureAndSaveState(runner, store, projectId) {
  try {
    if (runner.isDestroyed() || runner.webContents.isDestroyed()) return;
    const json = await runner.webContents.executeJavaScript('JSON.stringify(localStorage)');
    const state = JSON.parse(json);
    if (state && Object.keys(state).length > 0) {
      const fp = store.getProjectFilePath(projectId);
      _saveStateToZip(fp, state);
    }
  } catch (_) {}
}

function _writeAssetsToRunDir(runDir, attachments) {
  if (!Array.isArray(attachments)) return;
  for (const att of attachments) {
    if (!att.filename || !att.data) continue;
    const match = att.data.match(/^data:[^;]*;base64,(.*)$/);
    if (match) {
      try { fs.writeFileSync(path.join(runDir, att.filename), Buffer.from(match[1], 'base64')); } catch (_) {}
    }
  }
}

async function _captureThumbnail(runner, store, projectId) {
  try {
    if (runner.isDestroyed()) return;
    const image = await runner.webContents.capturePage();
    const resized = image.resize({ width: 400 });
    const pngBuffer = resized.toPNG();
    const fp = store.getProjectFilePath(projectId);
    if (!fp || !fs.existsSync(fp)) return;
    const zip = new AdmZip(fp);
    try { zip.deleteFile('thumbnail.png'); } catch (_) {}
    zip.addFile('thumbnail.png', pngBuffer);
    zip.writeZip(fp);

    const thumbBase64 = `data:image/png;base64,${pngBuffer.toString('base64')}`;
    store.updateIndexEntry(projectId, { thumbnailBase64: thumbBase64 });
  } catch (_) {}
}

module.exports = { initIpc };
