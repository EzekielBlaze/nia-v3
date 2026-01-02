const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');

/**
 * NIA V3 - Desktop Widget + Chat (Electron)
 * 
 * Features:
 * - Checks/starts daemon service on launch
 * - Compact widget mode (140x200) with breathing animation
 * - Expanded chat mode (400x600)
 * - Draggable
 * - Quit options: widget only OR widget + service
 * - System tray
 */

let mainWindow = null;
let tray = null;
let statusCheckInterval = null;
let isCompact = false;
let isChatInProgress = false;

const SIZES = {
  compact: { width: 140, height: 200 },
  expanded: { width: 400, height: 600 }
};

function log(msg) {
  console.log(`[${new Date().toISOString()}] [WIDGET] ${msg}`);
}

log('=== NIA Widget + Chat Starting ===');

// Load IPC Client
let IPCClient = null;
try {
  IPCClient = require('./ipc-client');
  log('✓ IPCClient loaded');
} catch (err) {
  log(`✗ IPCClient failed: ${err.message}`);
}

/**
 * Check if daemon service is running
 */
function isDaemonServiceRunning() {
  return new Promise((resolve) => {
    exec('sc.exe query niaservice.exe', (err, stdout) => {
      if (err) {
        resolve(false);
        return;
      }
      resolve(stdout.includes('RUNNING'));
    });
  });
}

/**
 * Start the daemon service (requires elevation if not already running)
 */
function startDaemonService() {
  return new Promise((resolve, reject) => {
    log('Starting daemon service...');
    
    // First try without elevation (works if service is just stopped, not if permission denied)
    exec('sc.exe start niaservice.exe', (err, stdout, stderr) => {
      if (!err || (stdout && stdout.includes('RUNNING'))) {
        log('Service started successfully');
        resolve(true);
        return;
      }
      
      // If that failed, try elevated
      log('Trying elevated start...');
      const cmd = `powershell -Command "Start-Process sc.exe -ArgumentList 'start','niaservice.exe' -Verb RunAs -Wait"`;
      
      exec(cmd, (err2) => {
        if (err2) {
          log(`Service start may have failed: ${err2.message}`);
          reject(new Error('Failed to start service'));
        } else {
          log('Service started (elevated)');
          resolve(true);
        }
      });
    });
  });
}

/**
 * Stop the daemon service (requires elevation)
 */
function stopDaemonService() {
  return new Promise((resolve) => {
    log('Stopping daemon service (will request admin)...');
    
    // Use PowerShell to run sc.exe elevated - this will prompt UAC
    const cmd = `powershell -Command "Start-Process sc.exe -ArgumentList 'stop','niaservice.exe' -Verb RunAs -Wait"`;
    
    exec(cmd, (err, stdout, stderr) => {
      if (err) {
        log(`Service stop may have failed or been cancelled: ${err.message}`);
      } else {
        log('Service stop command completed');
      }
      // Wait a moment for service to fully stop
      setTimeout(resolve, 2000);
    });
  });
}

/**
 * Ensure daemon is running on startup
 */
async function ensureDaemonRunning() {
  const running = await isDaemonServiceRunning();
  
  if (running) {
    log('Daemon service already running');
    return true;
  }
  
  log('Daemon service not running, attempting to start...');
  
  try {
    await startDaemonService();
    // Wait for it to initialize
    await new Promise(r => setTimeout(r, 2000));
    return true;
  } catch (err) {
    log(`Could not start service: ${err.message}`);
    return false;
  }
}

// Create window
function createWindow() {
  log('Creating window...');
  
  const size = isCompact ? SIZES.compact : SIZES.expanded;
  
  mainWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('widget-chat.html');
  
  // Uncomment to debug:
  // mainWindow.webContents.openDevTools({ mode: 'detach' });

  setupIpcHandlers();
  
  log('✓ Window created');
}

// Set up IPC handlers
function setupIpcHandlers() {
  ipcMain.on('resize-window', (event, mode) => {
    const size = mode === 'compact' ? SIZES.compact : SIZES.expanded;
    isCompact = mode === 'compact';
    mainWindow.setSize(size.width, size.height);
    log(`Window resized to ${mode}`);
  });
  
  ipcMain.on('show-menu', () => {
    const menu = Menu.buildFromTemplate([
      { label: '📊 Identity Status', click: () => showIdentityStatus() },
      { label: '📋 View Logs', click: () => openLogs() },
      { label: '⚙️ Settings', click: () => openSettings() },
      { type: 'separator' },
      { label: '🔄 Restart Daemon', click: () => restartDaemon() },
      { type: 'separator' },
      { label: '👆 Toggle Size', click: () => mainWindow.webContents.send('toggle-mode') },
      { label: '🙈 Hide Widget', click: () => mainWindow.hide() },
      { type: 'separator' },
      { label: '❌ Quit...', click: () => showQuitDialog() }
    ]);
    menu.popup({ window: mainWindow });
  });
  
  ipcMain.on('request-status', () => {
    if (!isChatInProgress) checkDaemonStatus();
  });
  
  ipcMain.on('request-identity', () => {
    getIdentityStatus();
  });
  
  ipcMain.on('chat-message', async (event, data) => {
    await handleChatMessage(data.message);
  });
}

// Check daemon status
async function checkDaemonStatus() {
  if (isChatInProgress) return;
  
  if (!IPCClient) {
    sendStatusUpdate(false, 'IPC not loaded');
    return;
  }
  
  try {
    const client = new IPCClient();
    await client.connect();
    const status = await client.getStatus();
    client.disconnect();
    sendStatusUpdate(true, null, status.uptime);
  } catch (err) {
    if (!isChatInProgress) {
      sendStatusUpdate(false, err.message);
    }
  }
}

function sendStatusUpdate(online, error = null, uptime = null) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status-update', { online, error, uptime });
  }
}

// Get identity status
async function getIdentityStatus() {
  if (!IPCClient) return;
  
  try {
    const client = new IPCClient();
    await client.connect();
    
    // Get basic identity status
    const response = await client.request('identity_status', {});
    
    // Also get full beliefs and scars for the panel
    try {
      const beliefs = await client.request('beliefs', {});
      response.beliefs = beliefs;
    } catch (e) {
      // Beliefs endpoint might not exist yet
    }
    
    try {
      const scars = await client.request('scars', {});
      response.scars = [...(scars.positive || []), ...(scars.negative || [])];
    } catch (e) {
      // Scars endpoint might not exist yet
    }
    
    client.disconnect();
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('identity-update', response);
    }
  } catch (err) {
    log(`Identity status error: ${err.message}`);
  }
}

// Handle chat message
async function handleChatMessage(message) {
  log(`Chat: "${message.substring(0, 50)}..."`);
  isChatInProgress = true;
  
  if (!IPCClient) {
    isChatInProgress = false;
    sendChatResponse({
      success: false,
      error: 'IPC not loaded',
      response: 'Connection error. Is the daemon running?'
    });
    return;
  }
  
  try {
    const client = new IPCClient();
    await client.connect();
    const response = await client.request('chat', { message }, 60000);
    client.disconnect();
    
    isChatInProgress = false;
    sendChatResponse(response);
    setTimeout(() => getIdentityStatus(), 500);
  } catch (err) {
    log(`Chat error: ${err.message}`);
    isChatInProgress = false;
    sendChatResponse({
      success: false,
      error: err.message,
      response: err.code === 'ECONNREFUSED' 
        ? 'Cannot connect to NIA. Is the daemon running?'
        : 'Something went wrong. Please try again.'
    });
  }
}

function sendChatResponse(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('chat-response', data);
  }
}

// Show identity status
async function showIdentityStatus() {
  const { dialog } = require('electron');
  
  if (!IPCClient) {
    dialog.showErrorBox('Error', 'IPC module not loaded');
    return;
  }
  
  try {
    const client = new IPCClient();
    await client.connect();
    const identity = await client.request('identity_status', {});
    
    // Try to get full belief data
    let beliefInfo = '';
    try {
      const beliefs = await client.request('beliefs', {});
      beliefInfo = `
Beliefs:
  Core (strong): ${beliefs.core?.length || 0}
  Active: ${beliefs.active?.length || 0}
  Emerging: ${beliefs.emerging?.length || 0}`;
    } catch (e) {
      beliefInfo = `\nActive Beliefs: ${identity.active_beliefs || 0}`;
    }
    
    client.disconnect();
    
    const message = `NIA's Identity
${beliefInfo}

Defining Moments:
  ✨ Warmth (positive): ${identity.formative_scars?.positive || 0}
  📖 Wisdom (growth): ${identity.formative_scars?.negative || 0}

Mental State:
  Energy: ${identity.cognitive_load?.fatigue || 'normal'}
  Capacity: ${identity.cognitive_load?.budget_remaining || 100}/100

Thinking Log:
  Total thoughts: ${identity.thinking?.total || 0}
  Unprocessed: ${identity.thinking?.unprocessed || 0}`;
    
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'NIA Identity',
      message: message,
      buttons: ['OK']
    });
  } catch (err) {
    dialog.showErrorBox('Error', `Failed to get identity: ${err.message}`);
  }
}

function openLogs() {
  const { shell } = require('electron');
  shell.openPath(path.join(__dirname, 'data', 'logs'));
}

function openSettings() {
  const { shell } = require('electron');
  shell.openPath(path.join(__dirname, 'config.json'));
}

// Restart daemon
async function restartDaemon() {
  const { dialog } = require('electron');
  
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Restart Daemon',
    message: 'Restart the NIA daemon service?',
    buttons: ['Yes', 'No']
  });
  
  if (result.response === 0) {
    await stopDaemonService();
    await new Promise(r => setTimeout(r, 2000));
    await startDaemonService();
    setTimeout(() => checkDaemonStatus(), 3000);
  }
}

// Show quit dialog with options
async function showQuitDialog() {
  const { dialog } = require('electron');
  
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: 'Quit NIA',
    message: 'What would you like to close?',
    buttons: ['Widget Only', 'Widget + Daemon Service', 'Cancel'],
    defaultId: 0,
    cancelId: 2
  });
  
  if (result.response === 0) {
    // Widget only
    log('User quit widget only - daemon continues running');
    if (statusCheckInterval) clearInterval(statusCheckInterval);
    app.quit();
  } else if (result.response === 1) {
    // Widget + service - stop status checks first to prevent errors
    log('User quit widget + daemon service');
    if (statusCheckInterval) clearInterval(statusCheckInterval);
    await stopDaemonService();
    app.quit();
  }
  // Cancel = do nothing
}

// Create tray
function createTray() {
  const iconPath = path.join(__dirname, 'nia-icon.ico');
  const icon = nativeImage.createFromPath(iconPath);
  
  tray = new Tray(icon);
  tray.setToolTip('NIA - AI Companion');
  
  const menu = Menu.buildFromTemplate([
    { label: '👆 Show Widget', click: () => mainWindow.show() },
    { label: '🙈 Hide Widget', click: () => mainWindow.hide() },
    { type: 'separator' },
    { label: '📊 Identity Status', click: () => showIdentityStatus() },
    { label: '🔄 Restart Daemon', click: () => restartDaemon() },
    { type: 'separator' },
    { label: '❌ Quit...', click: () => showQuitDialog() }
  ]);
  
  tray.setContextMenu(menu);
  tray.on('double-click', () => {
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
  });
  
  log('✓ Tray created');
}

// Status checking
function startStatusChecking() {
  setTimeout(() => checkDaemonStatus(), 2000);
  setTimeout(() => getIdentityStatus(), 2500);
  
  statusCheckInterval = setInterval(() => {
    if (!isChatInProgress) {
      checkDaemonStatus();
      getIdentityStatus();
    }
  }, 10000);
}

// App ready
app.whenReady().then(async () => {
  // First, ensure daemon is running
  await ensureDaemonRunning();
  
  // Then create UI
  createWindow();
  createTray();
  startStatusChecking();
  
  log('✓ NIA Widget + Chat started');
});

app.on('window-all-closed', () => {
  // Keep running in tray
});

app.on('before-quit', () => {
  if (statusCheckInterval) clearInterval(statusCheckInterval);
});
