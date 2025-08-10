const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const ProjectsStore = require('./projectsStore');
const { initIpc } = require('./ipc');

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {ProjectsStore} */
let projectsStore;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'HostBuddy',
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
}

app.whenReady().then(() => {
  projectsStore = new ProjectsStore(app.getPath('userData'));
  createMainWindow();
  initIpc(ipcMain, projectsStore, app, BrowserWindow);

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


