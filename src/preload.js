const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onImportFile: (callback) => ipcRenderer.on('import-file', (_event, filePath) => callback(filePath)),
  getFilePathFromDrop: (file) => {
    try { return webUtils.getPathForFile(file); } catch (_) { return file.path || ''; }
  },
  listProjects: () => ipcRenderer.invoke('projects:list'),
  getProject: (id) => ipcRenderer.invoke('projects:get', id),
  createProject: (payload) => ipcRenderer.invoke('projects:create', payload),
  updateProject: (id, updates) => ipcRenderer.invoke('projects:update', id, updates),
  deleteProject: (id) => ipcRenderer.invoke('projects:delete', id),
  runProject: (id) => ipcRenderer.invoke('projects:run', id),
  exportProject: (id) => ipcRenderer.invoke('projects:export', id),
  exportProjectHtml: (id) => ipcRenderer.invoke('projects:exportHtml', id),
  exportProjectForAI: (id) => ipcRenderer.invoke('projects:exportForAI', id),
  importProjects: () => ipcRenderer.invoke('projects:import'),
  importProjectFile: (filePath) => ipcRenderer.invoke('projects:importFile', filePath),
  openFeedback: () => ipcRenderer.invoke('app:openFeedback'),
  listFolders: () => ipcRenderer.invoke('folders:list'),
  createFolder: (name) => ipcRenderer.invoke('folders:create', { name }),
  renameFolder: (id, name) => ipcRenderer.invoke('folders:rename', id, name),
  deleteFolder: (id) => ipcRenderer.invoke('folders:delete', id),
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getProjectsDir: () => ipcRenderer.invoke('settings:getProjectsDir'),
  setProjectsDir: () => ipcRenderer.invoke('settings:setProjectsDir'),
});
