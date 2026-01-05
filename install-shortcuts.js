/**
 * NIA V3 - Windows Shortcut Installer
 * 
 * Creates shortcuts to NIA.bat which runs the full launcher
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
const readline = require('readline');

console.log('');
console.log('╔═══════════════════════════════════════╗');
console.log('║   NIA V3 - Shortcut Installer         ║');
console.log('╚═══════════════════════════════════════╝');
console.log('');

const NIA_DIR = __dirname;
const BAT_FILE = path.join(NIA_DIR, 'NIA.bat');
const ICON_FILE = path.join(NIA_DIR, 'nia-icon.ico');

// Check required files
if (!fs.existsSync(BAT_FILE)) {
  console.log('✗ ERROR: NIA.bat not found!');
  console.log('  Make sure NIA.bat is in:', NIA_DIR);
  process.exit(1);
}

// Shortcut locations
const LOCATIONS = {
  startMenu: path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'NIA'),
  desktop: path.join(os.homedir(), 'Desktop'),
  startup: path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
};

/**
 * Create shortcut using PowerShell temp file
 */
function createShortcut(lnkPath, targetPath, workingDir, iconPath, description) {
  // Build PowerShell script
  const ps1 = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("${lnkPath.replace(/\\/g, '\\\\')}")
$Shortcut.TargetPath = "${targetPath.replace(/\\/g, '\\\\')}"
$Shortcut.WorkingDirectory = "${workingDir.replace(/\\/g, '\\\\')}"
${fs.existsSync(iconPath) ? `$Shortcut.IconLocation = "${iconPath.replace(/\\/g, '\\\\')}"` : ''}
$Shortcut.Description = "${description}"
$Shortcut.WindowStyle = 7
$Shortcut.Save()
`.trim();
  
  // Write to temp file
  const tempFile = path.join(os.tmpdir(), `nia-shortcut-${Date.now()}.ps1`);
  fs.writeFileSync(tempFile, ps1, 'utf8');
  
  try {
    execSync(`powershell -ExecutionPolicy Bypass -File "${tempFile}"`, { 
      stdio: 'pipe',
      windowsHide: true 
    });
    return true;
  } catch (err) {
    console.log(`  Error: ${err.message}`);
    return false;
  } finally {
    try { fs.unlinkSync(tempFile); } catch (e) {}
  }
}

/**
 * Ask yes/no question
 */
function ask(question) {
  const rl = readline.createInterface({ 
    input: process.stdin, 
    output: process.stdout 
  });
  
  return new Promise(resolve => {
    rl.question(question + ' (Y/N): ', answer => {
      rl.close();
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

/**
 * Main installer
 */
async function install() {
  const created = [];
  
  // 1. Start Menu (always)
  console.log('[1/3] Creating Start Menu shortcut...');
  
  // Create folder if needed
  if (!fs.existsSync(LOCATIONS.startMenu)) {
    fs.mkdirSync(LOCATIONS.startMenu, { recursive: true });
  }
  
  const startMenuLnk = path.join(LOCATIONS.startMenu, 'NIA.lnk');
  if (createShortcut(startMenuLnk, BAT_FILE, NIA_DIR, ICON_FILE, 'NIA - AI Companion')) {
    console.log('  ✓ Start Menu shortcut created');
    created.push('Start Menu');
  } else {
    console.log('  ✗ Failed to create Start Menu shortcut');
  }
  
  // 2. Desktop (ask)
  console.log('');
  console.log('[2/3] Desktop shortcut');
  if (await ask('  Create desktop shortcut?')) {
    const desktopLnk = path.join(LOCATIONS.desktop, 'NIA.lnk');
    if (createShortcut(desktopLnk, BAT_FILE, NIA_DIR, ICON_FILE, 'NIA - AI Companion')) {
      console.log('  ✓ Desktop shortcut created');
      created.push('Desktop');
    } else {
      console.log('  ✗ Failed');
    }
  } else {
    console.log('  Skipped');
  }
  
  // 3. Startup (ask)
  console.log('');
  console.log('[3/3] Auto-start with Windows');
  if (await ask('  Start NIA automatically when you log in?')) {
    const startupLnk = path.join(LOCATIONS.startup, 'NIA.lnk');
    if (createShortcut(startupLnk, BAT_FILE, NIA_DIR, ICON_FILE, 'NIA - Auto Start')) {
      console.log('  ✓ Startup shortcut created');
      created.push('Startup');
    } else {
      console.log('  ✗ Failed');
    }
  } else {
    console.log('  Skipped');
  }
  
  // Done!
  console.log('');
  console.log('╔═══════════════════════════════════════╗');
  console.log('║   Installation Complete! ✓            ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log('');
  
  if (created.length > 0) {
    console.log('Created shortcuts:');
    created.forEach(loc => console.log(`  ✓ ${loc}`));
    console.log('');
    console.log('🚀 Launch NIA:');
    console.log('   • Press Windows key, type "NIA", press Enter');
    if (created.includes('Desktop')) {
      console.log('   • Double-click NIA icon on Desktop');
    }
  } else {
    console.log('No shortcuts were created.');
  }
  
  console.log('');
}

install().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
