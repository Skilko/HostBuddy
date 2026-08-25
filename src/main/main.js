const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const SettingsStore = require('./settingsStore');
const ProjectsStore = require('./projectsStore');
const { initIpc } = require('./ipc');
const mcpServer = require('./mcpServer');
const { installBridge } = require('./mcpBridgeInstall');

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {SettingsStore} */
let settingsStore;
/** @type {ProjectsStore} */
let projectsStore;

let pendingOpenFile = null;

function createMainWindow() {
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';

  // Header height: icon (36px) + top padding (16px) + bottom padding (16px) = 68px
  const HEADER_HEIGHT = 68;

  mainWindow = new BrowserWindow({
    width: 1210,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    title: 'HostBuddy',
    titleBarStyle: 'hidden',
    // macOS: traffic lights positioned with equal spacing from left and top edges
    ...(isMac && { trafficLightPosition: { x: 16, y: 16 } }),
    // Windows: native caption buttons (min/max/close) overlaid in top-right, coloured to match header
    ...(isWin && { titleBarOverlay: { color: '#162038', symbolColor: '#e5e7eb', height: HEADER_HEIGHT } }),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      devTools: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingOpenFile) {
      handleFileOpen(pendingOpenFile);
      pendingOpenFile = null;
    }
  });
}

async function handleFileOpen(filePath) {
  if (!filePath || !filePath.endsWith('.hbproject') || !fs.existsSync(filePath)) return;
  try {
    const AdmZip = require('adm-zip');
    const zip = new AdmZip(filePath);
    const manifest = JSON.parse(zip.readAsText('manifest.json'));
    const title = manifest.title || path.basename(filePath, '.hbproject');

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'question', buttons: ['Import', 'Cancel'], defaultId: 0, cancelId: 1,
      title: 'Import Project', message: `Import "${title}" into HostBuddy?`
    });
    if (response !== 0) return;

    if (mainWindow) {
      mainWindow.webContents.send('import-file', filePath);
    }
  } catch (_) {}
}

// macOS: handle file open via dock / Finder association
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (app.isReady() && mainWindow) {
    handleFileOpen(filePath);
  } else {
    pendingOpenFile = filePath;
  }
});

app.whenReady().then(async () => {
  settingsStore = new SettingsStore(app.getPath('userData'));
  const projectsDir = settingsStore.getProjectsDir();
  projectsStore = new ProjectsStore(projectsDir);

  createMainWindow();
  initIpc(ipcMain, projectsStore, settingsStore, app, BrowserWindow);

  mcpServer.onStatusChange((status) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mcp:status-changed', status);
    }
  });
  mcpServer.onProjectChanged(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('projects:changed');
    }
  });
  // Keep the stdio bridge on disk at a stable, non-asar path for Claude Desktop.
  installBridge(app.getPath('userData'));

  mcpServer.start(projectsStore, settingsStore);

  // Run migration after the window is visible so the app doesn't appear frozen
  try {
    projectsStore.migrateFromLegacy(app.getPath('userData'));
  } catch (err) {
    console.error('Migration failed:', err);
  }

  // Windows/Linux: check argv for .hbproject file
  const fileArg = process.argv.find(a => a.endsWith('.hbproject'));
  if (fileArg && fs.existsSync(fileArg)) {
    pendingOpenFile = fileArg;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
