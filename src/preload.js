const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  listProjects: () => ipcRenderer.invoke('projects:list'),
  createProject: (payload) => ipcRenderer.invoke('projects:create', payload),
  updateProject: (id, updates) => ipcRenderer.invoke('projects:update', id, updates),
  deleteProject: (id) => ipcRenderer.invoke('projects:delete', id),
  runProject: (id) => ipcRenderer.invoke('projects:run', id),
  exportProject: (id) => ipcRenderer.invoke('projects:export', id),
  importProjects: () => ipcRenderer.invoke('projects:import'),
  openFeedback: () => ipcRenderer.invoke('app:openFeedback')
});


