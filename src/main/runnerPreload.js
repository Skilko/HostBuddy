const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('__hbRunner', {
  getRestoredState: () => ipcRenderer.invoke('runner:getState'),
});

async function restoreState() {
  try {
    const state = await ipcRenderer.invoke('runner:getState');
    if (state && typeof state === 'object') {
      for (const [key, value] of Object.entries(state)) {
        try { localStorage.setItem(key, value); } catch (_) {}
      }
    }
  } catch (_) {}
}

restoreState();
