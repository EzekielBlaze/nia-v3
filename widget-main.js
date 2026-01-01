const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');

/**
 * NIA V3 - Desktop Widget (Electron) - DIAGNOSTIC VERSION
 * 
 * Extensive logging to debug IPC connection issues.
 */

let mainWindow = null;
let tray = null;
let ipcClient = null;
let statusCheckInterval = null;

// DIAGNOSTIC: Log everything
function log(msg) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [WIDGET] ${msg}`);
}

log('=== Widget Main Process Starting ===');
log(`Process CWD: ${process.cwd()}`);
log(`__dirname: ${__dirname}`);
log(`App path: ${app.getAppPath()}`);

// Try to load IPCClient with error handling
let IPCClient = null;
try {
  log('Loading IPCClient...');
  IPCClient = require('./ipc-client');
  log('✓ IPCClient loaded successfully');
} catch (err) {
  log(`✗ Failed to load IPCClient: ${err.message}`);
  log(`Stack: ${err.stack}`);
}

// Try to load config to check socket name
try {
  log('Loading config...');
  const config = require('./utils/config');
  const allConfig = config.getAll();
  log(`✓ Config loaded. Socket name: ${allConfig.ipc_socket_name}`);
  log(`✓ Base dir: ${allConfig.base_directory}`);
} catch (err) {
  log(`✗ Failed to load config: ${err.message}`);
}

// Create the floating widget window
function createWindow() {
  log('Creating window...');
  
  mainWindow = new BrowserWindow({
    width: 140,
    height: 200,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    type: 'toolbar',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('widget.html');
  
  // DIAGNOSTIC: Open DevTools
  // mainWindow.webContents.openDevTools({ mode: 'detach' });
  
  mainWindow.setIgnoreMouseEvents(false);

  ipcMain.on('show-menu', () => {
    const menu = Menu.buildFromTemplate([
      { label: '📊 View Status', click: () => { showStatus(); } },
      { label: '📋 View Logs', click: () => { openLogs(); } },
      { label: '⚙️ Settings', click: () => { openSettings(); } },
      { type: 'separator' },
      { label: '🔄 Restart Daemon', click: () => { restartDaemon(); } },
      { type: 'separator' },
      { label: '👁 Hide Widget', click: () => { mainWindow.hide(); } },
      { label: '❌ Quit (Stop Everything)', click: () => { quitEverything(); } }
    ]);
    menu.popup({ window: mainWindow });
  });

  ipcMain.on('request-status', () => {
    log('Renderer requested status');
    checkDaemonStatus();
  });

  mainWindow.on('blur', () => {});
  
  log('✓ Window created');
}

// Check daemon status and send to renderer - DIAGNOSTIC VERSION
async function checkDaemonStatus() {
  log('--- checkDaemonStatus() called ---');
  
  if (!IPCClient) {
    log('✗ IPCClient not loaded - cannot check status');
    sendOfflineStatus('IPCClient not loaded');
    return;
  }
  
  try {
    log('Step 1: Creating IPCClient instance...');
    if (!ipcClient) {
      ipcClient = new IPCClient();
      log('✓ IPCClient instance created');
      log(`  Server ID: ${ipcClient.serverId}`);
    } else {
      log('Using existing IPCClient instance');
    }
    
    log('Step 2: Connecting to daemon...');
    
    const connectStart = Date.now();
    await ipcClient.connect();
    const connectTime = Date.now() - connectStart;
    log(`✓ Connected! (took ${connectTime}ms)`);
    
    log('Step 3: Requesting status...');
    const status = await ipcClient.getStatus();
    log(`✓ Got status: running=${status.running}, uptime=${status.uptime}`);
    
    // Send to renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('status-update', {
        online: true,
        running: status.running,
        uptime: status.uptime,
        tickCount: status.tick_count,
        ipcClients: status.ipc_clients
      });
      log('✓ Sent status-update to renderer (online)');
    }
    
    log('Step 4: Disconnecting...');
    ipcClient.disconnect();
    ipcClient = null; // Reset for next check
    log('✓ Disconnected');
    
  } catch (err) {
    log(`✗ Error: ${err.message}`);
    log(`  Error type: ${err.constructor.name}`);
    if (err.stack) {
      log(`  Stack: ${err.stack.split('\n').slice(0, 3).join(' | ')}`);
    }
    
    // Reset client on error
    if (ipcClient) {
      try { 
        ipcClient.disconnect(); 
      } catch(e) {
        log(`  Disconnect error: ${e.message}`);
      }
      ipcClient = null;
    }
    
    sendOfflineStatus(err.message);
  }
  
  log('--- checkDaemonStatus() complete ---');
}

function sendOfflineStatus(error) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status-update', {
      online: false,
      error: error
    });
    log('Sent status-update to renderer (offline)');
  }
}

// Start periodic status checking
function startStatusChecking() {
  log('Starting status checking...');
  
  // Check after 2 seconds (give window time to load)
  setTimeout(() => {
    log('Initial status check...');
    checkDaemonStatus();
  }, 2000);
  
  // Then check every 5 seconds
  statusCheckInterval = setInterval(() => {
    checkDaemonStatus();
  }, 5000);
  
  log('✓ Status checking started (every 5 seconds)');
}

// Create system tray icon
function createTray() {
  log('Creating tray...');
  
  const iconPath = path.join(__dirname, 'nia-icon.ico');
  log(`Tray icon path: ${iconPath}`);
  
  const icon = nativeImage.createFromPath(iconPath);
  
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: '👁 Show Widget', click: () => { mainWindow.show(); } },
    { label: '🙈 Hide Widget', click: () => { mainWindow.hide(); } },
    { type: 'separator' },
    { label: '💬 Open Chat', click: () => { openChat(); } },
    { label: '📊 View Status', click: () => { showStatus(); } },
    { label: '📋 View Logs', click: () => { openLogs(); } },
    { type: 'separator' },
    { label: '⚙️ Settings', click: () => { openSettings(); } },
    { label: '🔄 Restart Daemon', click: () => { restartDaemon(); } },
    { type: 'separator' },
    { label: '❌ Quit (Stop Everything)', click: () => { quitEverything(); } }
  ]);
  
  tray.setToolTip('NIA - AI Companion');
  tray.setContextMenu(contextMenu);
  
  tray.on('double-click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });
  
  log('✓ Tray created');
}

// Show status dialog
async function showStatus() {
  const { dialog } = require('electron');
  
  log('showStatus() called');
  
  if (!IPCClient) {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'NIA Status',
      message: 'IPCClient module not loaded.\n\nCheck console for errors.',
      buttons: ['OK']
    });
    return;
  }
  
  try {
    const client = new IPCClient();
    await client.connect();
    const status = await client.getStatus();
    const health = await client.getHealth();
    
    const message = `NIA Status:\n\n` +
      `Running: ${status.running ? 'Yes ✔' : 'No ✗'}\n` +
      `Uptime: ${status.uptime}\n` +
      `Ticks: ${status.tick_count}\n` +
      `IPC Clients: ${status.ipc_clients}\n` +
      `Memory: ${(health.memory_usage.heapUsed / 1024 / 1024).toFixed(2)} MB\n` +
      `Status: ${health.status}\n\n` +
      `Started: ${new Date(status.start_time).toLocaleString()}\n` +
      `Last Check: ${new Date(status.last_health_check).toLocaleString()}`;
    
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'NIA Status',
      message: message,
      buttons: ['OK']
    });
    
    client.disconnect();
    
  } catch (err) {
    log(`showStatus error: ${err.message}`);
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'NIA Status',
      message: `Failed to get daemon status.\n\nError: ${err.message}\n\nIs the service running?`,
      buttons: ['OK']
    });
  }
}

// Open logs folder
function openLogs() {
  const { shell } = require('electron');
  const logsPath = path.join(__dirname, 'data', 'logs');
  log(`Opening logs: ${logsPath}`);
  shell.openPath(logsPath);
}

// Open settings
function openSettings() {
  const { shell } = require('electron');
  const configPath = path.join(__dirname, 'config.json');
  log(`Opening settings: ${configPath}`);
  shell.openPath(configPath);
}

// Restart daemon
async function restartDaemon() {
  const { dialog } = require('electron');
  const { exec } = require('child_process');
  
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Restart Daemon',
    message: 'Restart the NIA daemon service?',
    buttons: ['Yes', 'No'],
    defaultId: 0
  });
  
  if (result.response === 0) {
    log('Restarting daemon...');
    exec('sc stop niaservice.exe', (err) => {
      if (err) {
        log(`Stop error: ${err.message}`);
        dialog.showMessageBox(mainWindow, {
          type: 'error',
          title: 'Restart Failed',
          message: `Failed to stop service.\n\nTry running as Administrator.\n\nError: ${err.message}`,
          buttons: ['OK']
        });
        return;
      }
      
      setTimeout(() => {
        exec('sc start niaservice.exe', (err) => {
          if (err) {
            log(`Start error: ${err.message}`);
            dialog.showMessageBox(mainWindow, {
              type: 'error',
              title: 'Restart Failed',
              message: `Failed to start service.\n\nError: ${err.message}`,
              buttons: ['OK']
            });
          } else {
            log('Daemon restarted successfully');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Restart Successful',
              message: 'Daemon restarted successfully!',
              buttons: ['OK']
            });
          }
        });
      }, 3000);
    });
  }
}

// Open chat
function openChat() {
  const { shell } = require('electron');
  shell.openExternal('http://localhost:3000');
}

// Quit everything
async function quitEverything() {
  const { dialog } = require('electron');
  const { exec } = require('child_process');
  
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Quit NIA',
    message: 'This will stop both the widget AND the daemon service.\n\nAre you sure?',
    buttons: ['Yes, Quit Everything', 'Cancel'],
    defaultId: 1
  });
  
  if (result.response === 0) {
    log('Quitting everything...');
    
    exec('sc stop niaservice.exe', (err) => {
      if (err) {
        log('Note: Could not stop service');
      } else {
        log('✓ Daemon service stopped');
      }
      app.quit();
    });
  }
}

// App ready
app.whenReady().then(() => {
  log('=== App Ready ===');
  createWindow();
  createTray();
  startStatusChecking();
  
  log('NIA Desktop Widget started!');
});

app.on('window-all-closed', () => {
  // Don't quit - keep tray running
});

app.on('before-quit', () => {
  log('App quitting...');
  if (statusCheckInterval) {
    clearInterval(statusCheckInterval);
  }
  if (ipcClient) {
    ipcClient.disconnect();
  }
});
