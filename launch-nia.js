/**
 * NIA V3 - Smart Widget Launcher
 * 
 * Automatically:
 * - Checks if daemon service is running
 * - Starts it if needed (with admin check)
 * - Launches widget
 * - Verifies connection
 */

const { spawn, exec } = require('child_process');
const path = require('path');
const IPCClient = require('./ipc-client');

console.log('\n=== Starting NIA Desktop Widget ===\n');

let attempts = 0;
const MAX_ATTEMPTS = 3;

/**
 * Check if service is running
 */
function checkService() {
  return new Promise((resolve) => {
    exec('sc query niaservice.exe', (err, stdout) => {
      if (err) {
        resolve(false);
        return;
      }
      
      const running = stdout.includes('RUNNING');
      resolve(running);
    });
  });
}

/**
 * Start the service
 */
function startService() {
  return new Promise((resolve) => {
    console.log('⚠️  Daemon service is not running');
    console.log('🔧 Attempting to start service...');
    
    exec('sc start niaservice.exe', (err, stdout) => {
      if (err) {
        if (err.message.includes('Access is denied')) {
          console.log('❌ Cannot start service (requires Administrator)');
          console.log('\n💡 Solutions:');
          console.log('   1. Run this script as Administrator');
          console.log('   2. Or manually start: sc start niaservice.exe');
          console.log('   3. Or the service should auto-start on Windows boot\n');
          resolve(false);
        } else if (err.message.includes('already been started')) {
          console.log('✓ Service already running');
          resolve(true);
        } else {
          console.log('❌ Failed to start service:', err.message);
          resolve(false);
        }
      } else {
        console.log('✓ Service started successfully!');
        resolve(true);
      }
    });
  });
}

/**
 * Wait for daemon to be ready
 */
async function waitForDaemon() {
  console.log('⏳ Waiting for daemon to be ready...');
  
  for (let i = 0; i < 10; i++) {
    try {
      const client = new IPCClient();
      await client.connect();
      await client.getStatus();
      client.disconnect();
      
      console.log('✓ Daemon is ready!');
      return true;
    } catch (err) {
      // Not ready yet, wait
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.log('⚠️  Daemon not responding (may still be starting)');
  return false;
}

/**
 * Launch the widget
 */
function launchWidget() {
  console.log('🚀 Launching widget...\n');
  
  const electronPath = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');
  const widgetMain = path.join(__dirname, 'widget-main.js');
  
  const widget = spawn(electronPath, [widgetMain], {
    detached: true,
    stdio: 'ignore'
  });
  
  widget.unref();
  
  console.log('✓ Widget starting...');
  console.log('✓ Look for the floating NIA widget on your desktop!');
  console.log('✓ Right-click tray icon for options');
  console.log('✓ Press Ctrl+C to stop (or right-click tray → Quit)\n');
}

/**
 * Main startup sequence
 */
async function start() {
  try {
    // Step 1: Check if service is running
    console.log('[1/3] Checking daemon service...');
    const serviceRunning = await checkService();
    
    if (!serviceRunning) {
      // Step 2: Try to start service
      console.log('[2/3] Starting daemon service...');
      const started = await startService();
      
      if (started) {
        // Wait for daemon to initialize
        await new Promise(resolve => setTimeout(resolve, 3000));
        await waitForDaemon();
      } else {
        console.log('\n⚠️  Service not running and couldn\'t auto-start');
        console.log('Widget will launch but may show "Offline"');
        console.log('\nTo fix:');
        console.log('  1. Start service: sc start niaservice.exe (as Admin)');
        console.log('  2. Or restart Windows (service auto-starts)\n');
      }
    } else {
      console.log('✓ Daemon service is running');
      
      // Verify daemon is responding
      console.log('[2/3] Verifying daemon connection...');
      await waitForDaemon();
    }
    
    // Step 3: Launch widget
    console.log('[3/3] Launching widget...');
    launchWidget();
    
  } catch (err) {
    console.error('❌ Error during startup:', err.message);
    console.log('\nLaunching widget anyway...\n');
    launchWidget();
  }
}

// Run startup sequence
start();
