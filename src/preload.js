const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listProjects: () => ipcRenderer.invoke('projects:list'),
  createProject: (payload) => ipcRenderer.invoke('projects:create', payload),
  updateProject: (id, updates) => ipcRenderer.invoke('projects:update', id, updates),
  deleteProject: (id) => ipcRenderer.invoke('projects:delete', id),
  runProject: (id) => ipcRenderer.invoke('projects:run', id),
  exportProject: (id) => ipcRenderer.invoke('projects:export', id),
  importProjects: () => ipcRenderer.invoke('projects:import'),
  openFeedback: () => ipcRenderer.invoke('app:openFeedback'),
  listFolders: () => ipcRenderer.invoke('folders:list'),
  createFolder: (name) => ipcRenderer.invoke('folders:create', { name }),
  renameFolder: (id, name) => ipcRenderer.invoke('folders:rename', id, name),
  deleteFolder: (id) => ipcRenderer.invoke('folders:delete', id)
});


