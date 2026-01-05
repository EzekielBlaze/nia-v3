/**
 * NIA V3 - Update Shortcuts to Smart Launcher
 * 
 * Updates existing shortcuts to use launch-nia.js instead of start-widget.js
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const os = require('os');

console.log('\n╔═══════════════════════════════════════╗');
console.log('║   Update Shortcuts to Smart Launcher ║');
console.log('╚═══════════════════════════════════════╝\n');

// Paths
const niaPath = __dirname;
const nodeExe = process.execPath;
const newLauncher = path.join(niaPath, 'launch-nia.js');
const iconPath = path.join(niaPath, 'nia-icon.ico');

// Shortcut locations
const shortcuts = [
  {
    name: 'Start Menu',
    path: path.join(
      process.env.APPDATA,
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'NIA',
      'NIA Widget.lnk'
    )
  },
  {
    name: 'Desktop',
    path: path.join(os.homedir(), 'Desktop', 'NIA Widget.lnk')
  },
  {
    name: 'Startup',
    path: path.join(
      process.env.APPDATA,
      'Microsoft',
      'Windows',
      'Start Menu',
      'Programs',
      'Startup',
      'NIA Widget.lnk'
    )
  }
];

/**
 * Update a shortcut
 */
function updateShortcut(shortcutPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(shortcutPath)) {
      resolve({ updated: false, reason: 'not found' });
      return;
    }
    
    const psScript = `
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("${shortcutPath}")
$Shortcut.TargetPath = "${nodeExe}"
$Shortcut.Arguments = '"${newLauncher}"'
$Shortcut.IconLocation = "${iconPath}"
$Shortcut.Description = "NIA - AI Companion Widget"
$Shortcut.WorkingDirectory = "${niaPath}"
$Shortcut.Save()
Write-Host "Updated"
`;
    
    const psFile = path.join(niaPath, 'temp-update.ps1');
    fs.writeFileSync(psFile, psScript);
    
    exec(`powershell -ExecutionPolicy Bypass -File "${psFile}"`, (err, stdout, stderr) => {
      // Clean up
      try { fs.unlinkSync(psFile); } catch (e) {}
      
      if (err) {
        reject(err);
      } else {
        resolve({ updated: true, reason: 'success' });
      }
    });
  });
}

/**
 * Main update
 */
async function update() {
  console.log('Updating shortcuts to use smart launcher...\n');
  
  let updated = 0;
  let notFound = 0;
  
  for (const shortcut of shortcuts) {
    console.log(`[${shortcut.name}]`);
    
    try {
      const result = await updateShortcut(shortcut.path);
      
      if (result.updated) {
        console.log(`  ✓ Updated to use launch-nia.js`);
        updated++;
      } else if (result.reason === 'not found') {
        console.log(`  ⊘ Not found (skip)`);
        notFound++;
      }
    } catch (err) {
      console.log(`  ✗ Failed: ${err.message}`);
    }
    
    console.log();
  }
  
  // Summary
  console.log('╔═══════════════════════════════════════╗');
  console.log('║   Update Complete!                    ║');
  console.log('╚═══════════════════════════════════════╝\n');
  
  console.log(`Updated: ${updated} shortcut(s)`);
  console.log(`Not found: ${notFound} shortcut(s)`);
  
  if (updated > 0) {
    console.log('\n✓ Shortcuts now use the smart launcher!');
    console.log('✓ Test: Windows key → "NIA" → launch');
    console.log('✓ Should now show "Running ✓" instead of "Offline"\n');
  } else {
    console.log('\n⚠️  No shortcuts were updated');
    console.log('💡 You may need to create shortcuts first:');
    console.log('   node install-shortcuts.js\n');
  }
}

update();
