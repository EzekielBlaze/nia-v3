/**
 * NIA V3 - Shortcut Uninstaller
 * 
 * Removes all NIA shortcuts from:
 * - Start Menu
 * - Desktop
 * - Startup folder
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('\n╔═══════════════════════════════════════╗');
console.log('║   NIA V3 - Shortcut Uninstaller      ║');
console.log('╚═══════════════════════════════════════╝\n');

// Paths
const startMenuFolder = path.join(
  process.env.APPDATA,
  'Microsoft',
  'Windows',
  'Start Menu',
  'Programs',
  'NIA'
);

const desktopShortcut = path.join(os.homedir(), 'Desktop', 'NIA Widget.lnk');

const startupShortcut = path.join(
  process.env.APPDATA,
  'Microsoft',
  'Windows',
  'Start Menu',
  'Programs',
  'Startup',
  'NIA Widget.lnk'
);

/**
 * Delete file if exists
 */
function deleteIfExists(filePath, name) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✓ Removed ${name}`);
      return true;
    } else {
      console.log(`  ${name} not found (already removed)`);
      return false;
    }
  } catch (err) {
    console.error(`✗ Failed to remove ${name}:`, err.message);
    return false;
  }
}

/**
 * Main uninstall
 */
async function uninstall() {
  console.log('Removing NIA shortcuts...\n');
  
  let removed = 0;
  
  // Remove Start Menu folder
  console.log('[1/3] Start Menu...');
  try {
    if (fs.existsSync(startMenuFolder)) {
      const files = fs.readdirSync(startMenuFolder);
      files.forEach(file => {
        fs.unlinkSync(path.join(startMenuFolder, file));
      });
      fs.rmdirSync(startMenuFolder);
      console.log('✓ Removed Start Menu folder');
      removed++;
    } else {
      console.log('  Start Menu folder not found');
    }
  } catch (err) {
    console.error('✗ Failed to remove Start Menu folder:', err.message);
  }
  
  // Remove Desktop shortcut
  console.log('\n[2/3] Desktop...');
  if (deleteIfExists(desktopShortcut, 'Desktop shortcut')) {
    removed++;
  }
  
  // Remove Startup shortcut
  console.log('\n[3/3] Auto-start...');
  if (deleteIfExists(startupShortcut, 'Startup shortcut')) {
    removed++;
  }
  
  // Done
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║   Uninstall Complete! ✓               ║');
  console.log('╚═══════════════════════════════════════╝\n');
  
  if (removed > 0) {
    console.log(`Removed ${removed} shortcut(s)`);
    console.log('NIA files remain in:', __dirname);
    console.log('You can still run: node start-widget.js\n');
  } else {
    console.log('No shortcuts found to remove\n');
  }
}

// Run uninstaller
uninstall();
