const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, desktopCapturer, shell, clipboard } = require('electron');
const path = require('path');
const AutoLaunch = require('auto-launch');

class AICopilotApp {
  constructor() {
    this.mainWindow = null;
    this.tray = null;
    this.isQuitting = false;
    this.isOverlayMode = false;
    this.isAlwaysOnTop = false;

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
      // Load always-on-top setting from localStorage via renderer
      this.mainWindow.webContents.executeJavaScript(`
        try {
          const settings = localStorage.getItem('appSettings');
          if (settings) {
            const parsed = JSON.parse(settings);
            return parsed.alwaysOnTop || false;
          }
          return false;
        } catch (e) {
          return false;
        }
      `).then(alwaysOnTop => {
        if (alwaysOnTop) {
          this.setAlwaysOnTop(true);
        }
      }).catch(err => {
        console.error('Failed to load always-on-top setting:', err);
      });

      if (process.argv.includes('--show-on-start')) {
        this.showWindow();
      }
    });

    // Open DevTools in development
    if (process.argv.includes('--dev')) {
      this.mainWindow.webContents.openDevTools();
    }
  }

  createSelectionWindow() {
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    const selectionWindow = new BrowserWindow({
      x: 0,
      y: 0,
      width,
      height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
      },
    });

    selectionWindow.loadFile(path.join(__dirname, 'selection.html'));

    ipcMain.handleOnce('selection-complete', (event, rect) => {
      selectionWindow.close();
      this.mainWindow.webContents.send('selection-complete', rect);
    });
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

    // Register global shortcut for overlay mode
    const overlayShortcut = process.platform === 'darwin' ? 'Command+Shift+O' : 'Ctrl+Shift+O';
    const overlayRegistered = globalShortcut.register(overlayShortcut, () => {
      this.toggleOverlayMode();
    });

    if (!overlayRegistered) {
      console.error('Failed to register global shortcut:', overlayShortcut);
      dialog.showErrorBox(
        'Shortcut Registration Failed',
        `Failed to register global shortcut: ${overlayShortcut}`
      );
    }

    // Register global shortcut for always-on-top toggle
    const alwaysOnTopShortcut = process.platform === 'darwin' ? 'Command+Shift+T' : 'Ctrl+Shift+T';
    const alwaysOnTopRegistered = globalShortcut.register(alwaysOnTopShortcut, () => {
      this.setAlwaysOnTop(!this.isAlwaysOnTop);
      // Send notification to renderer
      if (this.mainWindow) {
        this.mainWindow.webContents.send('always-on-top-changed', this.isAlwaysOnTop);
      }
    });

    if (!alwaysOnTopRegistered) {
      console.error('Failed to register global shortcut:', alwaysOnTopShortcut);
    }
  }

  setupEventHandlers() {
    // Handle IPC messages from renderer
    ipcMain.handle('app-version', () => {
      return app.getVersion();
    });

    ipcMain.handle('toggle-overlay-mode', () => {
      this.toggleOverlayMode();
    });

    ipcMain.handle('set-always-on-top', (event, enabled) => {
      this.setAlwaysOnTop(enabled);
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

    ipcMain.handle('open-selection-window', () => {
      this.createSelectionWindow();
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

    // Application opening functionality
    ipcMain.handle('open-application', async (event, applicationName) => {
      try {
        console.log(`Attempting to open application: ${applicationName}`);

        // Normalize application name
        const appName = applicationName.toLowerCase().trim();

        // Platform-specific application opening
        if (process.platform === 'darwin') {
          // macOS - use 'open' command
          return await this.openApplicationMacOS(appName);
        } else if (process.platform === 'win32') {
          // Windows - use shell.openPath or start command
          return await this.openApplicationWindows(appName);
        } else {
          // Linux - use various methods
          return await this.openApplicationLinux(appName);
        }
      } catch (error) {
        console.error('Error opening application:', error);
        return {
          success: false,
          error: error.message,
          message: `Failed to open ${applicationName}: ${error.message}`
        };
      }
    });

    // Clipboard-based text insertion (safer alternative to robotjs)
    ipcMain.handle('copy-to-clipboard', async (event, text) => {
      try {
        clipboard.writeText(text);
        return { success: true };
      } catch (error) {
        console.error('Error copying to clipboard:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('get-clipboard-text', async () => {
      try {
        const text = clipboard.readText();
        return { success: true, text };
      } catch (error) {
        console.error('Error reading clipboard:', error);
        return { success: false, error: error.message };
      }
    });

    // Get active window title (for app detection)
    ipcMain.handle('get-active-window-title', async () => {
      try {
        if (process.platform === 'darwin') {
          // macOS: Use AppleScript to get frontmost app
          const { execSync } = require('child_process');

          // Get app name
          const appScript = 'tell application "System Events" to get name of first application process whose frontmost is true';
          const appName = execSync(`osascript -e '${appScript}'`, { encoding: 'utf8' }).trim();

          // Get window title (may fail for some apps)
          let windowTitle = '';
          try {
            const windowScript = `tell application "System Events" to get name of front window of application process "${appName}"`;
            windowTitle = execSync(`osascript -e '${windowScript}'`, { encoding: 'utf8' }).trim();
          } catch (e) {
            console.log('Could not get window title, using app name only');
            windowTitle = appName;
          }

          const fullTitle = `${appName} | ${windowTitle}`;
          console.log(`Active window detected: ${fullTitle}`);
          return { success: true, appName, windowTitle, fullTitle };
        } else if (process.platform === 'win32') {
          // Windows: Use PowerShell to get both window title and process name
          const { execSync } = require('child_process');

          try {
            // Enhanced PowerShell script to get window title and process name
            const script = `
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  using System.Text;
  public class Win32 {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  }
"@

$hwnd = [Win32]::GetForegroundWindow()

# Get window title
$title = New-Object System.Text.StringBuilder 256
[Win32]::GetWindowText($hwnd, $title, 256)
$windowTitle = $title.ToString()

# Get process name
$processId = 0
[Win32]::GetWindowThreadProcessId($hwnd, [ref]$processId) | Out-Null
$process = Get-Process -Id $processId -ErrorAction SilentlyContinue

if ($process) {
  $processName = $process.ProcessName
  # Try to get main window title from process
  if ($process.MainWindowTitle) {
    $windowTitle = $process.MainWindowTitle
  }
} else {
  $processName = "unknown"
}

# Output as JSON for easier parsing
@{
  processName = $processName
  windowTitle = $windowTitle
} | ConvertTo-Json -Compress
`;

            const result = execSync(`powershell -Command "${script.replace(/"/g, '\\"')}"`, {
              encoding: 'utf8',
              timeout: 5000
            }).trim();

            console.log('Windows PowerShell result:', result);

            // Parse JSON result
            const data = JSON.parse(result);
            let appName = data.processName || 'unknown';
            let windowTitle = data.windowTitle || '';

            // If we got a process name, try to make it more readable
            if (appName !== 'unknown') {
              // Common app name mappings
              const appNameMappings = {
                'chrome': 'Google Chrome',
                'firefox': 'Firefox',
                'msedge': 'Microsoft Edge',
                'slack': 'Slack',
                'discord': 'Discord',
                'teams': 'Microsoft Teams',
                'outlook': 'Microsoft Outlook',
                'telegram': 'Telegram',
                'whatsapp': 'WhatsApp'
              };

              const lowerAppName = appName.toLowerCase();
              appName = appNameMappings[lowerAppName] || appName;
            }

            // If window title contains " - " pattern, try to parse it
            // Format is usually: "Content - Application Name"
            if (windowTitle.includes(' - ')) {
              const parts = windowTitle.split(' - ');
              if (parts.length >= 2) {
                const lastPart = parts[parts.length - 1].trim();
                // Check if last part looks like an app name
                if (lastPart.length > 0 && lastPart.length < 50) {
                  // If we don't have a good app name from process, use the parsed one
                  if (appName === 'unknown' || appName.toLowerCase().endsWith('.exe')) {
                    appName = lastPart;
                  }
                  // Window title is everything before the last " - "
                  windowTitle = parts.slice(0, -1).join(' - ').trim();
                }
              }
            }

            const fullTitle = `${appName} | ${windowTitle}`;
            console.log(`Windows active window detected: ${fullTitle}`);
            return { success: true, appName, windowTitle, fullTitle };

          } catch (error) {
            console.error('Error in Windows window detection:', error);
            // Fallback to basic title detection
            try {
              const basicScript = `
Add-Type @"
  using System;
  using System.Runtime.InteropServices;
  using System.Text;
  public class Win32 {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  }
"@
$hwnd = [Win32]::GetForegroundWindow()
$title = New-Object System.Text.StringBuilder 256
[Win32]::GetWindowText($hwnd, $title, 256)
$title.ToString()
`;
              const result = execSync(`powershell -Command "${basicScript.replace(/"/g, '\\"')}"`, {
                encoding: 'utf8',
                timeout: 5000
              }).trim();

              // Parse title to extract app name
              let appName = 'unknown';
              let windowTitle = result;

              if (result.includes(' - ')) {
                const parts = result.split(' - ');
                if (parts.length >= 2) {
                  appName = parts[parts.length - 1].trim();
                  windowTitle = parts.slice(0, -1).join(' - ').trim();
                }
              }

              const fullTitle = `${appName} | ${windowTitle}`;
              console.log(`Windows active window detected (fallback): ${fullTitle}`);
              return { success: true, appName, windowTitle, fullTitle };
            } catch (fallbackError) {
              console.error('Windows fallback also failed:', fallbackError);
              return { success: false, error: fallbackError.message };
            }
          }
        } else {
          // Linux: Use xprop for app name and xdotool for window title
          const { execSync } = require('child_process');

          try {
            // Get active window ID
            const windowId = execSync('xdotool getactivewindow', { encoding: 'utf8' }).trim();
            console.log('Linux window ID:', windowId);

            // Get window title
            const windowTitle = execSync(`xdotool getwindowname ${windowId}`, { encoding: 'utf8' }).trim();
            console.log('Linux window title:', windowTitle);

            // Get WM_CLASS for app name
            let appName = 'unknown';
            try {
              const wmClass = execSync(`xprop -id ${windowId} WM_CLASS`, { encoding: 'utf8' }).trim();
              console.log('Linux WM_CLASS:', wmClass);

              // Parse WM_CLASS output: WM_CLASS(STRING) = "instance", "class"
              // We want the class name (second value)
              const match = wmClass.match(/WM_CLASS\(STRING\)\s*=\s*"([^"]+)",\s*"([^"]+)"/);
              if (match && match[2]) {
                appName = match[2];

                // Common app name mappings for Linux
                const appNameMappings = {
                  'Google-chrome': 'Google Chrome',
                  'google-chrome': 'Google Chrome',
                  'Chromium': 'Chromium',
                  'Firefox': 'Firefox',
                  'firefox': 'Firefox',
                  'Slack': 'Slack',
                  'slack': 'Slack',
                  'discord': 'Discord',
                  'Discord': 'Discord',
                  'Microsoft Teams': 'Microsoft Teams',
                  'teams': 'Microsoft Teams',
                  'Telegram': 'Telegram',
                  'telegram': 'Telegram'
                };

                appName = appNameMappings[appName] || appName;
              }
            } catch (wmClassError) {
              console.log('Could not get WM_CLASS, will try parsing window title');
            }

            // If we still don't have an app name, try parsing window title
            if (appName === 'unknown' && windowTitle.includes(' - ')) {
              const parts = windowTitle.split(' - ');
              if (parts.length >= 2) {
                const lastPart = parts[parts.length - 1].trim();
                if (lastPart.length > 0 && lastPart.length < 50) {
                  appName = lastPart;
                }
              }
            }

            const fullTitle = `${appName} | ${windowTitle}`;
            console.log(`Linux active window detected: ${fullTitle}`);
            return { success: true, appName, windowTitle, fullTitle };

          } catch (error) {
            console.error('Error in Linux window detection:', error);

            // Fallback to wmctrl
            try {
              const result = execSync('wmctrl -lx | grep $(xprop -root _NET_ACTIVE_WINDOW | cut -d\\# -f2)', {
                encoding: 'utf8',
                timeout: 5000
              }).trim();

              // wmctrl output format: window_id desktop class hostname title
              const parts = result.split(/\s+/);
              let appName = 'unknown';
              let windowTitle = result;

              if (parts.length >= 3) {
                appName = parts[2].split('.')[1] || parts[2]; // Get class name
                windowTitle = parts.slice(4).join(' '); // Title is everything after hostname
              }

              const fullTitle = `${appName} | ${windowTitle}`;
              console.log(`Linux active window detected (wmctrl fallback): ${fullTitle}`);
              return { success: true, appName, windowTitle, fullTitle };

            } catch (fallbackError) {
              console.error('Linux fallback also failed:', fallbackError);
              return { success: false, error: fallbackError.message };
            }
          }
        }
      } catch (error) {
        console.error('Error getting active window title:', error);
        console.error('Error details:', error.stack);
        return { success: false, error: error.message, details: error.stack };
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

  toggleOverlayMode() {
    if (!this.mainWindow) {
      return;
    }

    this.isOverlayMode = !this.isOverlayMode;

    if (this.isOverlayMode) {
      // Enter overlay mode: semi-transparent, always on top
      // Note: We keep the window interactive (no click-through) so users can still use buttons
      this.mainWindow.setOpacity(0.7);
      this.mainWindow.setAlwaysOnTop(true, 'screen-saver');
      this.mainWindow.setResizable(false);
      this.mainWindow.setHasShadow(false);
      // Keep window focusable and interactive - don't set click-through
      // this.mainWindow.setFocusable(false); // REMOVED - would make window non-interactive
      // this.mainWindow.setIgnoreMouseEvents(true); // REMOVED - would make window click-through
    } else {
      // Exit overlay mode: back to normal
      this.mainWindow.setOpacity(1.0);
      // Only disable always-on-top if it's not enabled via settings
      if (!this.isAlwaysOnTop) {
        this.mainWindow.setAlwaysOnTop(false);
      }
      this.mainWindow.setResizable(true);
      this.mainWindow.setHasShadow(true);
      // No need to reset focusable or mouse events since we didn't change them
    }
  }

  setAlwaysOnTop(enabled) {
    if (!this.mainWindow) {
      return;
    }

    this.isAlwaysOnTop = enabled;

    // Don't change always-on-top if overlay mode is active
    // Overlay mode manages its own always-on-top state
    if (!this.isOverlayMode) {
      this.mainWindow.setAlwaysOnTop(enabled);
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

  // Platform-specific application opening methods
  async openApplicationMacOS(appName) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    // Common macOS applications mapping
    const macApps = {
      'chrome': 'Google Chrome',
      'firefox': 'Firefox',
      'safari': 'Safari',
      'notion': 'Notion',
      'vscode': 'Visual Studio Code',
      'code': 'Visual Studio Code',
      'terminal': 'Terminal',
      'finder': 'Finder',
      'mail': 'Mail',
      'calendar': 'Calendar',
      'notes': 'Notes',
      'calculator': 'Calculator',
      'textedit': 'TextEdit',
      'preview': 'Preview',
      'spotify': 'Spotify',
      'slack': 'Slack',
      'discord': 'Discord',
      'zoom': 'zoom.us',
      'teams': 'Microsoft Teams'
    };

    const actualAppName = macApps[appName] || appName;

    try {
      // Try to open the application
      await execAsync(`open -a "${actualAppName}"`);
      return {
        success: true,
        message: `Successfully opened ${actualAppName}`,
        application: actualAppName
      };
    } catch (error) {
      // If direct open fails, try with bundle identifier or alternative methods
      console.log(`Direct open failed for ${actualAppName}, trying alternatives...`);

      try {
        // Try opening by searching in Applications folder
        await execAsync(`open "/Applications/${actualAppName}.app"`);
        return {
          success: true,
          message: `Successfully opened ${actualAppName}`,
          application: actualAppName
        };
      } catch (secondError) {
        throw new Error(`Could not find or open application "${actualAppName}"`);
      }
    }
  }

  async openApplicationWindows(appName) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    // Common Windows applications mapping
    const winApps = {
      'chrome': 'chrome',
      'firefox': 'firefox',
      'edge': 'msedge',
      'notepad': 'notepad',
      'calculator': 'calc',
      'paint': 'mspaint',
      'explorer': 'explorer',
      'cmd': 'cmd',
      'powershell': 'powershell',
      'vscode': 'code',
      'code': 'code',
      'notion': 'notion',
      'spotify': 'spotify',
      'slack': 'slack',
      'discord': 'discord',
      'zoom': 'zoom',
      'teams': 'teams'
    };

    const actualAppName = winApps[appName] || appName;

    try {
      // Try to start the application
      await execAsync(`start "" "${actualAppName}"`);
      return {
        success: true,
        message: `Successfully opened ${actualAppName}`,
        application: actualAppName
      };
    } catch (error) {
      throw new Error(`Could not find or open application "${actualAppName}"`);
    }
  }

  async openApplicationLinux(appName) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    // Common Linux applications mapping
    const linuxApps = {
      'chrome': 'google-chrome',
      'firefox': 'firefox',
      'terminal': 'gnome-terminal',
      'files': 'nautilus',
      'calculator': 'gnome-calculator',
      'text': 'gedit',
      'vscode': 'code',
      'code': 'code',
      'notion': 'notion-app',
      'spotify': 'spotify',
      'slack': 'slack',
      'discord': 'discord',
      'zoom': 'zoom'
    };

    const actualAppName = linuxApps[appName] || appName;

    try {
      // Try to open the application
      await execAsync(`${actualAppName} &`);
      return {
        success: true,
        message: `Successfully opened ${actualAppName}`,
        application: actualAppName
      };
    } catch (error) {
      // Try alternative methods
      try {
        await execAsync(`which ${actualAppName} && ${actualAppName} &`);
        return {
          success: true,
          message: `Successfully opened ${actualAppName}`,
          application: actualAppName
        };
      } catch (secondError) {
        throw new Error(`Could not find or open application "${actualAppName}"`);
      }
    }
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
