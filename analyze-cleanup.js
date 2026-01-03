/**
 * NIA V3 - Safe Cleanup Script
 * 
 * Archives old/unused files to a backup folder
 * DOES NOT DELETE - moves to archive for safety
 */

const fs = require('fs');
const path = require('path');

console.log('\n=== NIA Safe Cleanup ===\n');

const backupDir = path.join(__dirname, 'archive-old-files');

// Files/patterns that are SAFE to archive (old/unused)
const ARCHIVE_PATTERNS = {
  'Old Electron Widget Files': [
    'widget-main.js',
    'widget-chat.html',
    'widget.html',
    'widget-chat-fixed.html',
    'nia-widget.html',
    'start-widget.js'
  ],
  'Old Tray Files': [
    'nia-tray.js',
    'start-tray.js'
  ],
  'Old Daemon Files': [
    'daemon-old.js',
    'daemon-clean.js',
    'daemon-buildSystemPrompt-patch.js',
    'daemon-evolution-integration.js'
  ],
  'Old IPC Files': [
    'ipc-server-old.js',
    'ipc-debug.js',
    'ipc-diagnostic.js',
    'ipc-test.js',
    'diagnose-ipc.js'
  ],
  'Old Shortcuts/Install Files': [
    'install-shortcuts.js',
    'uninstall-shortcuts.js',
    'update-shortcuts.js',
    'NIA.bat'
  ],
  'Old Electron Troubleshooting': [
    'check-electron.bat',
    'troubleshoot-electron.bat',
    'start-widget-direct.bat',
    'start-widget-alt.js',
    'check-autostart.js'
  ],
  'Old Service Files': [
    'service-manager.js',
    'service-status.js',
    'service-wrapper.js',
    'modify-service-permissions.js'
  ],
  'Old Debug/Test Files': [
    'debug-extraction.js',
    'debug-two-pass.js',
    'debug-database.html',
    'debug-ipc.html',
    'test-query.js',
    'identity-query.js'
  ],
  'Old Extraction Files (Superseded)': [
    'extract-beliefs.js',
    'extract-beliefs-v2.js',
    'belief-extraction-engine.js',
    'belief-extraction-prompt.js',
    'improved-system-prompt.js'
  ],
  'Old Evolution/Connotation Files': [
    'belief-evolution-engine.js',
    'connotation-manager.js'
  ],
  'One-off Scripts': [
    'check-database.js',
    'check-autostart.js'
  ],
  'Old Migration Scripts (Already Used)': [
    'migrate-cognitive-tables.js',
    'migrate-beliefs-table.js',
    'run-migration.bat',
    'install-fix.bat'
  ],
  'Duplicate/Old Launchers': [
    'start-daemon.js',
    'launch-nia.js'
  ]
};

// Files we MUST KEEP (critical)
const KEEP_PATTERNS = [
  // Core system
  'daemon.js',
  'nia-server.js',
  'nia-ui.html',
  'ipc-client.js',
  'ipc-server.js',
  'config.js',
  'logger.js',
  
  // Current starters
  'start-nia-web.bat',
  'start-nia-web-fixed.bat',
  'start-all.bat',
  'kill-nia-web.bat',
  'kill-all-nia.bat',
  
  // Current setup/migration
  'setup-database.js',
  'setup-nia.bat',
  'safe-migrate.js',
  'safe-migrate.bat',
  'add-updated-at.js',
  'complete-fix.bat',
  'check-current-db.js',
  'check-db.bat',
  
  // Service management
  'install-service.js',
  'uninstall-service.js',
  
  // Autonomy system (V3)
  'cognitive-state.js',
  'extraction-gatekeeper.js',
  'autonomous-extraction-manager.js',
  'belief-extraction-engine-v2.js',
  'belief-extraction-prompt-v2.js',
  'belief-validator.js',
  'belief-upserter.js',
  'scar-processor.js',
  
  // Current belief processing
  'belief-processor.js',
  
  // Database
  'nia.db',
  'identity-schema-v3.sql',
  'concept-connotation-schema.sql',
  
  // Package files
  'package.json',
  'package-lock.json',
  
  // CLI
  'cli.js',
  'index.js',
  
  // Metadata
  'tree.txt',
  '.gitignore'
];

// Scan directory
const allFiles = fs.readdirSync(__dirname).filter(f => {
  const stat = fs.statSync(path.join(__dirname, f));
  return stat.isFile();
});

console.log(`Found ${allFiles.length} files in directory\n`);

// Categorize files
const toArchive = [];
const toKeep = [];
const uncertain = [];

for (const file of allFiles) {
  // Check if it's in KEEP list
  if (KEEP_PATTERNS.includes(file)) {
    toKeep.push(file);
    continue;
  }
  
  // Check if it's in ARCHIVE list
  let shouldArchive = false;
  for (const [category, files] of Object.entries(ARCHIVE_PATTERNS)) {
    if (files.includes(file)) {
      toArchive.push({ file, category });
      shouldArchive = true;
      break;
    }
  }
  
  if (!shouldArchive) {
    uncertain.push(file);
  }
}

console.log('=== ANALYSIS ===\n');
console.log(`Files to KEEP: ${toKeep.length}`);
console.log(`Files to ARCHIVE: ${toArchive.length}`);
console.log(`Files UNCERTAIN: ${uncertain.length}\n`);

console.log('=== FILES TO ARCHIVE ===\n');
for (const [category, files] of Object.entries(ARCHIVE_PATTERNS)) {
  const filesInCategory = toArchive.filter(item => item.category === category);
  if (filesInCategory.length > 0) {
    console.log(`${category}:`);
    filesInCategory.forEach(item => console.log(`  - ${item.file}`));
    console.log('');
  }
}

console.log('=== FILES TO KEEP ===\n');
toKeep.slice(0, 20).forEach(f => console.log(`  ✓ ${f}`));
if (toKeep.length > 20) {
  console.log(`  ... and ${toKeep.length - 20} more\n`);
}

if (uncertain.length > 0) {
  console.log('\n=== UNCERTAIN FILES (will NOT touch) ===\n');
  uncertain.forEach(f => console.log(`  ? ${f}`));
  console.log('');
}

console.log('=== SUMMARY ===\n');
console.log(`This will archive ${toArchive.length} old files to: ${backupDir}`);
console.log(`This will keep ${toKeep.length} current files`);
console.log(`This will leave ${uncertain.length} uncertain files untouched`);
console.log('\nFiles are MOVED, not deleted - you can restore them anytime!\n');

// Export the plan
const plan = {
  timestamp: new Date().toISOString(),
  toArchive: toArchive.map(item => item.file),
  toKeep,
  uncertain,
  backupDir
};

fs.writeFileSync(
  path.join(__dirname, 'cleanup-plan.json'),
  JSON.stringify(plan, null, 2)
);

console.log('✓ Cleanup plan saved to cleanup-plan.json');
console.log('\nTo execute this cleanup, run: node execute-cleanup.js\n');
