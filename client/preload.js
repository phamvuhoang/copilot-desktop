const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App control methods
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  toggleWindow: () => ipcRenderer.invoke('toggle-window'),
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  showWindow: () => ipcRenderer.invoke('show-window'),
  toggleOverlayMode: () => ipcRenderer.invoke('toggle-overlay-mode'),

  // Screenshot functionality
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  checkScreenPermission: () => ipcRenderer.invoke('check-screen-permission'),

  // Application opening functionality
  openApplication: (applicationName) => ipcRenderer.invoke('open-application', applicationName),

  // Clipboard functionality (safer alternative to automation)
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  getClipboardText: () => ipcRenderer.invoke('get-clipboard-text'),

  // Active window detection (for app filtering)
  getActiveWindowTitle: () => ipcRenderer.invoke('get-active-window-title'),
});
