/**
 * NIA V3 - Full Launcher
 * 
 * Launches all NIA components in order:
 * 1. Check/start daemon service
 * 2. Check/start LM Studio
 * 3. Wait for model to be ready
 * 4. Start widget
 */

const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('');
console.log('╔═══════════════════════════════════════╗');
console.log('║       NIA V3 - Starting Up...         ║');
console.log('╚═══════════════════════════════════════╝');
console.log('');

// Config
const LM_STUDIO_PATHS = [
  'C:\\Users\\ezeki\\AppData\\Local\\Programs\\LM Studio\\LM Studio.exe',
  'C:\\Program Files\\LM Studio\\LM Studio.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Programs', 'LM Studio', 'LM Studio.exe')
];
const LM_STUDIO_API = 'http://127.0.0.1:1234/v1/models';
const NIA_DIR = __dirname;

/**
 * Find LM Studio executable
 */
function findLMStudio() {
  for (const p of LM_STUDIO_PATHS) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Check if service is running
 */
function isServiceRunning() {
  return new Promise((resolve) => {
    exec('sc.exe query niaservice.exe', (err, stdout) => {
      resolve(!err && stdout.includes('RUNNING'));
    });
  });
}

/**
 * Start the service (will prompt UAC if needed)
 */
function startService() {
  return new Promise((resolve) => {
    console.log('  Starting service...');
    exec('sc.exe start niaservice.exe', (err, stdout) => {
      if (!err || (stdout && stdout.includes('RUNNING'))) {
        resolve(true);
      } else {
        // Try elevated
        console.log('  Requesting admin rights...');
        const cmd = `powershell -Command "Start-Process sc.exe -ArgumentList 'start','niaservice.exe' -Verb RunAs -Wait"`;
        exec(cmd, () => resolve(true));
      }
    });
  });
}

/**
 * Check if LM Studio is running
 */
function isLMStudioRunning() {
  return new Promise((resolve) => {
    exec('tasklist /FI "IMAGENAME eq LM Studio.exe"', (err, stdout) => {
      resolve(stdout && stdout.includes('LM Studio.exe'));
    });
  });
}

/**
 * Start LM Studio
 */
function startLMStudio() {
  return new Promise((resolve) => {
    const lmPath = findLMStudio();
    
    if (!lmPath) {
      console.log('  ⚠ LM Studio not found');
      console.log('    Please start LM Studio manually');
      resolve(false);
      return;
    }
    
    console.log('  Launching LM Studio...');
    const child = spawn(lmPath, [], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    resolve(true);
  });
}

/**
 * Check if LM Studio API is ready (model loaded)
 */
async function isModelReady() {
  try {
    const fetch = require('node-fetch');
    const response = await fetch(LM_STUDIO_API, { timeout: 2000 });
    if (response.ok) {
      const data = await response.json();
      return data.data && data.data.length > 0;
    }
    return false;
  } catch (e) {
    return false;
  }
}

/**
 * Wait for model with timeout
 */
async function waitForModel(timeoutSeconds = 60) {
  console.log('  Waiting for model to load...');
  const startTime = Date.now();
  
  while ((Date.now() - startTime) < timeoutSeconds * 1000) {
    if (await isModelReady()) {
      return true;
    }
    await new Promise(r => setTimeout(r, 2000));
    process.stdout.write('.');
  }
  
  console.log('');
  return false;
}

/**
 * Start the widget
 */
function startWidget() {
  console.log('  Starting widget...');
  
  const electron = require.resolve('electron/cli.js');
  const widgetMain = path.join(NIA_DIR, 'widget-main.js');
  
  const child = spawn('node', [electron, widgetMain], {
    cwd: NIA_DIR,
    detached: true,
    stdio: 'ignore'
  });
  child.unref();
}

/**
 * Main launcher
 */
async function main() {
  try {
    // Step 1: Daemon service
    console.log('[1/4] Checking daemon service...');
    if (await isServiceRunning()) {
      console.log('  ✓ Service already running');
    } else {
      await startService();
      await new Promise(r => setTimeout(r, 2000));
      if (await isServiceRunning()) {
        console.log('  ✓ Service started');
      } else {
        console.log('  ⚠ Could not start service');
      }
    }
    
    // Step 2: LM Studio
    console.log('[2/4] Checking LM Studio...');
    if (await isLMStudioRunning()) {
      console.log('  ✓ LM Studio already running');
    } else {
      await startLMStudio();
      await new Promise(r => setTimeout(r, 3000));
      console.log('  ✓ LM Studio launched');
    }
    
    // Step 3: Wait for model
    console.log('[3/4] Checking model...');
    if (await isModelReady()) {
      console.log('  ✓ Model already loaded');
    } else {
      const ready = await waitForModel(60);
      if (ready) {
        console.log('');
        console.log('  ✓ Model ready');
      } else {
        console.log('  ⚠ Model not loaded - load one in LM Studio');
        console.log('    (Widget will still start)');
      }
    }
    
    // Step 4: Widget
    console.log('[4/4] Starting widget...');
    startWidget();
    console.log('  ✓ Widget launched');
    
    console.log('');
    console.log('╔═══════════════════════════════════════╗');
    console.log('║       NIA is ready! ✓                 ║');
    console.log('╚═══════════════════════════════════════╝');
    console.log('');
    
    // Exit after a moment (widget runs independently)
    setTimeout(() => process.exit(0), 1000);
    
  } catch (err) {
    console.error('Launch error:', err.message);
    process.exit(1);
  }
}

main();
