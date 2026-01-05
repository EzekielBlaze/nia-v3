/**
 * ULTRA SAFE CLEANUP
 * Absolutely minimal - just moves files, nothing else
 * NO launching, NO spawning, NO child processes
 */

const fs = require('fs');
const path = require('path');

// Files to archive (from your dry run output)
const TO_ARCHIVE = [
  'add-updated-at.js',
  'check-autostart.js',
  'check-current-db.js',
  'cleanup-database.js',
  'cleanup-plan.json',
  'complete-cascade-delete.js',
  'complete-fix.bat',
  'concept-connotation-schema.sql',
  'connotation-manager.js',
  'daemon-old.js',
  'debug-extraction.js',
  'debug-two-pass.js',
  'delete-shortcuts.bat',
  'diagnose-ipc.js',
  'fix-all-columns.js',
  'fix-all-identity-columns.js',
  'fix-correct-tables.js',
  'fix-missing-columns.js',
  'identity-query.js',
  'ipc-server-old.js',
  'kill-all-nia.bat',
  'kill-nia-web.bat',
  'migrate-beliefs-table.js',
  'migrate-cognitive-tables.js',
  'migrate-database.bat',
  'modify-service-permissions.js',
  'patch-extended-thinking.js',
  'query',
  'safe-migrate.bat',
  'safe-migrate.js',
  'setup-nia.bat',
  'simple-delete-beliefs.js',
  'start-all.bat',
  'start-nia-web.bat',
  'stop',
  'test-identity.db',
  'test-ipc.js',
  'test-schema.py'
];

const rootDir = __dirname;
const archiveDir = path.join(rootDir, 'archive-old-files');

console.log('');
console.log('========================================');
console.log('ULTRA SAFE CLEANUP');
console.log('========================================');
console.log('');

// Create archive if needed
if (!fs.existsSync(archiveDir)) {
  fs.mkdirSync(archiveDir);
}

let moved = 0;
let skipped = 0;

for (const file of TO_ARCHIVE) {
  const srcPath = path.join(rootDir, file);
  const destPath = path.join(archiveDir, file);
  
  try {
    if (!fs.existsSync(srcPath)) {
      skipped++;
      continue;
    }
    
    if (fs.existsSync(destPath)) {
      skipped++;
      continue;
    }
    
    fs.renameSync(srcPath, destPath);
    console.log(`✅ Moved: ${file}`);
    moved++;
    
  } catch (err) {
    console.error(`❌ Error: ${file} - ${err.message}`);
  }
}

console.log('');
console.log('========================================');
console.log('DONE!');
console.log('========================================');
console.log(`Moved:   ${moved}`);
console.log(`Skipped: ${skipped}`);
console.log('');
console.log('Files are in: archive-old-files\\');
console.log('');
