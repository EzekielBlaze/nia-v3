/**
 * NIA V3 - Windows Shortcut Installer
 * 
 * Creates shortcuts in:
 * - Start Menu
 * - Desktop (optional)
 * - Startup folder (optional - auto-start)
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

console.log('\n╔═══════════════════════════════════════╗');
console.log('║   NIA V3 - Shortcut Installer        ║');
console.log('╚═══════════════════════════════════════╝\n');

// Paths
const niaPath = __dirname;
const nodeExe = process.execPath; // Path to node.exe
const widgetLauncher = path.join(niaPath, 'launch-nia.js'); // Use smart launcher
const iconPath = path.join(niaPath, 'nia-icon.ico');

// User folders
const startMenuFolder = path.join(
  process.env.APPDATA,
  'Microsoft',
  'Windows',
  'Start Menu',
  'Programs',
  'NIA'
);

const desktopFolder = path.join(os.homedir(), 'Desktop');
const startupFolder = path.join(
  process.env.APPDATA,
  'Microsoft',
  'Windows',
  'Start Menu',
  'Programs',
  'Startup'
);

/**
 * Create PowerShell script to make a shortcut
 */
function createShortcut(shortcutPath, targetPath, args, iconPath, description) {
  return new Promise((resolve, reject) => {
    const psScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("${shortcutPath}")
$Shortcut.TargetPath = "${targetPath}"
$Shortcut.Arguments = '"${args}"'
$Shortcut.IconLocation = "${iconPath}"
$Shortcut.Description = "${description}"
$Shortcut.WorkingDirectory = "${niaPath}"
$Shortcut.Save()
Write-Host "Created: ${shortcutPath}"
`;
    
    const psFile = path.join(niaPath, 'temp-shortcut.ps1');
    fs.writeFileSync(psFile, psScript);
    
    exec(`powershell -ExecutionPolicy Bypass -File "${psFile}"`, (err, stdout, stderr) => {
      // Clean up temp file
      try { fs.unlinkSync(psFile); } catch (e) {}
      
      if (err) {
        reject(err);
      } else {
        console.log(`✓ ${stdout.trim()}`);
        resolve();
      }
    });
  });
}

/**
 * Main installation
 */
async function install() {
  try {
    console.log('Installing NIA shortcuts...\n');
    
    // 1. Create Start Menu folder
    console.log('[1/3] Creating Start Menu entry...');
    if (!fs.existsSync(startMenuFolder)) {
      fs.mkdirSync(startMenuFolder, { recursive: true });
    }
    
    const startMenuShortcut = path.join(startMenuFolder, 'NIA Widget.lnk');
    await createShortcut(
      startMenuShortcut,
      nodeExe,
      widgetLauncher, // No quotes - PowerShell will handle it
      iconPath,
      'NIA - AI Companion Widget'
    );
    
    // 2. Ask about Desktop shortcut
    console.log('\n[2/3] Desktop shortcut...');
    console.log('Create desktop shortcut? (Y/N)');
    
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer1 = await new Promise(resolve => {
      readline.question('> ', resolve);
    });
    
    if (answer1.toLowerCase() === 'y' || answer1.toLowerCase() === 'yes') {
      const desktopShortcut = path.join(desktopFolder, 'NIA Widget.lnk');
      await createShortcut(
        desktopShortcut,
        nodeExe,
        widgetLauncher, // No quotes
        iconPath,
        'NIA - AI Companion Widget'
      );
    } else {
      console.log('  Skipped desktop shortcut');
    }
    
    // 3. Ask about Auto-start
    console.log('\n[3/3] Auto-start on Windows boot...');
    console.log('Start NIA automatically when Windows starts? (Y/N)');
    
    const answer2 = await new Promise(resolve => {
      readline.question('> ', resolve);
    });
    
    readline.close();
    
    if (answer2.toLowerCase() === 'y' || answer2.toLowerCase() === 'yes') {
      const startupShortcut = path.join(startupFolder, 'NIA Widget.lnk');
      await createShortcut(
        startupShortcut,
        nodeExe,
        widgetLauncher, // No quotes
        iconPath,
        'NIA - AI Companion Widget'
      );
    } else {
      console.log('  Skipped auto-start');
    }
    
    // Done!
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║   Installation Complete! ✓            ║');
    console.log('╚═══════════════════════════════════════╝\n');
    
    console.log('You can now launch NIA from:');
    console.log('  • Windows Start Menu (search "NIA")');
    if (answer1.toLowerCase() === 'y') {
      console.log('  • Desktop shortcut');
    }
    if (answer2.toLowerCase() === 'y') {
      console.log('  • Auto-starts on Windows boot');
    }
    console.log('\nPress Windows key and type "NIA" to launch!\n');
    
  } catch (err) {
    console.error('\n✗ Error during installation:', err.message);
    console.error('\nTroubleshooting:');
    console.error('  • Run as Administrator');
    console.error('  • Check icon file exists: nia-icon.ico');
    console.error('  • Verify file paths\n');
  }
}

// Run installer
install();
