const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App control methods
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  toggleWindow: () => ipcRenderer.invoke('toggle-window'),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  showWindow: () => ipcRenderer.invoke('show-window'),
  
  // Screenshot functionality
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  checkScreenPermission: () => ipcRenderer.invoke('check-screen-permission'),
});
