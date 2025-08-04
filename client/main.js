const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, desktopCapturer } = require('electron');
const path = require('path');
const AutoLaunch = require('auto-launch');

class AICopilotApp {
  constructor() {
    this.mainWindow = null;
    this.tray = null;
    this.isQuitting = false;

    // Initialize auto-launch
    this.autoLauncher = new AutoLaunch({
      name: 'AI Copilot Desktop',
      path: app.getPath('exe'),
    });

    // Initialize the app
    this.init();
  }

  init() {
    // Handle app ready event
    app.whenReady().then(() => {
      this.createWindow();
      this.createTray();
      this.registerShortcuts();
      this.setupEventHandlers();
    });

    // Handle app activation (macOS)
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createWindow();
      }
    });

    // Handle window close events
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // Handle before quit
    app.on('before-quit', () => {
      this.isQuitting = true;
    });
  }

  createWindow() {
    // Create the browser window
    this.mainWindow = new BrowserWindow({
      width: 400,
      height: 600,
      minWidth: 350,
      minHeight: 500,
      show: false, // Start hidden
      frame: true,
      resizable: true,
      skipTaskbar: false, // Ensure app appears in taskbar/dock
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        allowRunningInsecureContent: false,
        experimentalFeatures: false,
        preload: path.join(__dirname, 'preload.js')
      },
      icon: this.getIconPath() // Re-enable icon
    });

    // Load the app
    this.mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Handle window events
    this.mainWindow.on('close', (event) => {
      if (!this.isQuitting) {
        event.preventDefault();
        this.hideWindow();
      }
    });

    this.mainWindow.on('minimize', (event) => {
      // On macOS, allow normal minimize behavior to keep icon in dock
      if (process.platform === 'darwin') {
        // Don't prevent default - let it minimize normally
        return;
      } else {
        // On other platforms, hide to tray
        event.preventDefault();
        this.hideWindow();
      }
    });

    // Show window when ready
    this.mainWindow.once('ready-to-show', () => {
      if (process.argv.includes('--show-on-start')) {
        this.showWindow();
      }
    });

    // Open DevTools in development
    if (process.argv.includes('--dev')) {
      this.mainWindow.webContents.openDevTools();
    }
  }

  createTray() {
    // Create tray icon
    try {
      this.tray = new Tray(this.getIconPath());
    } catch (error) {
      console.warn('Failed to load tray icon:', error.message);
      // Create a minimal tray icon using nativeImage
      const { nativeImage } = require('electron');
      const emptyIcon = nativeImage.createEmpty();
      this.tray = new Tray(emptyIcon);
    }
    
    // Set tray tooltip
    this.tray.setToolTip('AI Copilot Desktop');

    // Create and set context menu
    this.updateTrayMenu();

    // Handle tray click
    this.tray.on('click', () => {
      this.toggleWindow();
    });

    // Handle double click
    this.tray.on('double-click', () => {
      this.showWindow();
    });
  }

  registerShortcuts() {
    // Register global shortcut for show/hide
    const shortcut = process.platform === 'darwin' ? 'Command+Shift+C' : 'Ctrl+Shift+C';
    
    const registered = globalShortcut.register(shortcut, () => {
      this.toggleWindow();
    });

    if (!registered) {
      console.error('Failed to register global shortcut:', shortcut);
      dialog.showErrorBox(
        'Shortcut Registration Failed',
        `Failed to register global shortcut: ${shortcut}`
      );
    }
  }

  setupEventHandlers() {
    // Handle IPC messages from renderer
    ipcMain.handle('app-version', () => {
      return app.getVersion();
    });

    ipcMain.handle('toggle-window', () => {
      this.toggleWindow();
    });

    ipcMain.handle('hide-window', () => {
      this.hideWindow();
    });

    ipcMain.handle('show-window', () => {
      this.showWindow();
    });

    // Screenshot functionality
    ipcMain.handle('get-screen-sources', async () => {
      try {
        // Check for screen recording permission on macOS
        if (process.platform === 'darwin') {
          const { systemPreferences, shell } = require('electron');

          // Check if we have screen recording permission
          const hasPermission = systemPreferences.getMediaAccessStatus('screen');

          if (hasPermission !== 'granted') {
            // Show dialog with instructions
            const { dialog } = require('electron');
            // Determine if we're in development mode
            const isDev = process.env.NODE_ENV === 'development' || process.defaultApp;
            const appName = isDev ? 'Electron' : 'AI Copilot Desktop';

            const result = await dialog.showMessageBox(this.mainWindow, {
              type: 'info',
              title: 'Screen Recording Permission Required',
              message: 'AI Copilot needs screen recording permission to capture screenshots.',
              detail: `Click "Open Settings" to grant permission, then restart the app.\n\nIn System Preferences:\n1. Go to Security & Privacy > Privacy > Screen Recording\n2. Look for "${appName}" in the list\n3. Check the box to enable permission\n4. Restart the application\n\nNote: In development mode, you need to grant permission to "Electron".`,
              buttons: ['Open Settings', 'Cancel'],
              defaultId: 0
            });

            if (result.response === 0) {
              // Open System Preferences to Screen Recording section
              shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
            }

            throw new Error('Screen recording permission required. Please grant permission in System Preferences and restart the app.');
          }
        }

        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 150, height: 150 }
        });
        return sources;
      } catch (error) {
        console.error('Error getting screen sources:', error);
        throw error;
      }
    });

    // Check screen recording permission status
    ipcMain.handle('check-screen-permission', async () => {
      try {
        if (process.platform === 'darwin') {
          const { systemPreferences } = require('electron');
          const status = systemPreferences.getMediaAccessStatus('screen');
          return { hasPermission: status === 'granted', status };
        }
        // On other platforms, assume permission is available
        return { hasPermission: true, status: 'granted' };
      } catch (error) {
        console.error('Error checking screen permission:', error);
        return { hasPermission: false, status: 'unknown' };
      }
    });
  }

  showWindow() {
    if (this.mainWindow) {
      this.mainWindow.show();
      this.mainWindow.focus();
      
      // Bring to front on macOS
      if (process.platform === 'darwin') {
        app.dock.show();
      }
    }
  }

  hideWindow() {
    if (this.mainWindow) {
      this.mainWindow.hide();

      // Keep app visible in dock on macOS for better UX
      if (process.platform === 'darwin') {
        // Don't hide from dock - users expect to see the app icon
        // app.dock.hide(); // Commented out to fix disappearing icon issue
      }
    }
  }

  toggleWindow() {
    if (this.mainWindow) {
      if (this.mainWindow.isVisible()) {
        this.hideWindow();
      } else {
        this.showWindow();
      }
    }
  }

  async updateTrayMenu() {
    // Check current auto-launch status
    const isAutoLaunchEnabled = await this.isAutoLaunchEnabled();

    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show AI Copilot',
        click: () => this.showWindow()
      },
      {
        label: 'Hide AI Copilot',
        click: () => this.hideWindow()
      },
      { type: 'separator' },
      {
        label: 'Start with System',
        type: 'checkbox',
        checked: isAutoLaunchEnabled,
        click: () => this.toggleAutoLaunch()
      },
      {
        label: 'Settings',
        click: () => this.openSettings()
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          this.isQuitting = true;
          app.quit();
        }
      }
    ]);

    this.tray.setContextMenu(contextMenu);
  }

  async isAutoLaunchEnabled() {
    try {
      return await this.autoLauncher.isEnabled();
    } catch (error) {
      console.warn('Failed to check auto-launch status:', error);
      return false;
    }
  }

  async toggleAutoLaunch() {
    try {
      const isEnabled = await this.isAutoLaunchEnabled();

      if (isEnabled) {
        await this.autoLauncher.disable();
        console.log('Auto-launch disabled');
      } else {
        await this.autoLauncher.enable();
        console.log('Auto-launch enabled');
      }

      // Update tray menu to reflect new state
      this.updateTrayMenu();

    } catch (error) {
      console.error('Failed to toggle auto-launch:', error);
      dialog.showErrorBox(
        'Auto-launch Error',
        `Failed to ${await this.isAutoLaunchEnabled() ? 'disable' : 'enable'} auto-launch: ${error.message}`
      );
    }
  }

  openSettings() {
    // TODO: Implement settings window
    console.log('Settings clicked - to be implemented');
  }

  getIconPath() {
    // Return appropriate icon based on platform
    const iconName = process.platform === 'win32' ? 'icon.ico' :
                     process.platform === 'darwin' ? 'icon.icns' : 'icon.png';
    const iconPath = path.join(__dirname, 'assets', iconName);

    // Fallback to SVG if platform-specific icon doesn't exist
    const fs = require('fs');
    if (!fs.existsSync(iconPath)) {
      const svgPath = path.join(__dirname, 'assets', 'icon.svg');
      if (fs.existsSync(svgPath)) {
        return svgPath;
      }
    }

    return iconPath;
  }
}

// Create app instance
new AICopilotApp();

// Handle certificate errors (for development)
app.on('certificate-error', (event, _webContents, _url, _error, _certificate, callback) => {
  if (process.argv.includes('--dev')) {
    event.preventDefault();
    callback(true);
  } else {
    callback(false);
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (_event, contents) => {
  contents.on('new-window', (event, _navigationUrl) => {
    event.preventDefault();
  });
});
