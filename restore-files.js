/**
 * Restore archived files
 * Run this if you need to undo the cleanup
 */

const fs = require('fs');
const path = require('path');

const backupDir = path.join(__dirname, 'archive-old-files');
const files = [
  "check-autostart.js",
  "check-electron.bat",
  "connotation-manager.js",
  "daemon-old.js",
  "debug-extraction.js",
  "debug-ipc.html",
  "debug-two-pass.js",
  "diagnose-ipc.js",
  "extract-beliefs-v2.js",
  "install-shortcuts.js",
  "ipc-debug.js",
  "ipc-diagnostic.js",
  "ipc-server-old.js",
  "ipc-test.js",
  "launch-nia.js",
  "migrate-beliefs-table.js",
  "migrate-cognitive-tables.js",
  "modify-service-permissions.js",
  "nia-tray.js",
  "nia-widget.html",
  "NIA.bat",
  "run-migration.bat",
  "service-manager.js",
  "service-status.js",
  "service-wrapper.js",
  "start-daemon.js",
  "start-tray.js",
  "start-widget-direct.bat",
  "start-widget.js",
  "troubleshoot-electron.bat",
  "uninstall-shortcuts.js",
  "update-shortcuts.js",
  "widget-chat.html",
  "widget-main.js",
  "widget.html"
];

console.log('\n=== RESTORING FILES ===\n');

let restored = 0;
for (const file of files) {
  const sourcePath = path.join(backupDir, file);
  const destPath = path.join(__dirname, '..', file);
  
  try {
    if (fs.existsSync(sourcePath)) {
      fs.renameSync(sourcePath, destPath);
      console.log(`  ✓ ${file}`);
      restored++;
    }
  } catch (err) {
    console.log(`  ✗ ${file}: ${err.message}`);
  }
}

console.log(`\nRestored ${restored} files\n`);
