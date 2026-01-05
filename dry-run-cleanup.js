/**
 * DRY RUN - Just shows what WOULD happen
 * Doesn't actually move anything or launch anything
 */

const fs = require('fs');
const path = require('path');

console.log('');
console.log('========================================');
console.log('DRY RUN - SHOWING WHAT WOULD HAPPEN');
console.log('========================================');
console.log('');
console.log('This is JUST a preview!');
console.log('No files will be moved.');
console.log('No programs will be launched.');
console.log('');

// ESSENTIAL FILES - NEVER TOUCH
const ESSENTIAL_FILES = new Set([
  'daemon.js',
  'ipc-client.js',
  'ipc-server.js',
  'nia-server.js',
  'nia-ui.html',
  'install-service.js',
  'uninstall-service.js',
  'service-manager.js',
  'service-wrapper.js',
  'belief-processor.js',
  'belief-upserter.js',
  'belief-validator.js',
  'cognitive-state.js',
  'scar-processor.js',
  'autonomous-extraction-manager.js',
  'extraction-gatekeeper.js',
  'belief-extraction-engine-v2.js',
  'belief-extraction-prompt-v2.js',
  'extract-beliefs-v2.js',
  'package.json',
  'package-lock.json',
  'Nia.png',
  'nia-icon.ico',
  'README.md',
  '.gitignore'
]);

// ESSENTIAL DIRECTORIES
const ESSENTIAL_DIRS = new Set([
  'node_modules',
  'data',
  'logs',
  'core',
  'daemon',
  'archive-old-files'
]);

// JUNK PATTERNS
const JUNK_PATTERNS = [
  /^test-.*\.js$/,
  /^debug-.*\.js$/,
  /^check-(?!schema).*\.js$/,
  /^diagnose-.*\.js$/,
  /^fix-.*\.js$/,
  /-old\.js$/,
  /^simple-delete/,
  /^complete-/,
  /^migrate-(?!database)/,
  /^setup-nia\.bat$/,
  /^safe-migrate/,
  /^identity-query\.js$/,
  /^query$/,
  /^stop$/,
  /^\.js$/,
  /^cleanup-plan\.json$/,
  /^patch-.*\.js$/
];

// KNOWN SAFE TO ARCHIVE
const SAFE_TO_ARCHIVE = new Set([
  'connotation-manager.js',
  'concept-connotation-schema.sql',
  'add-updated-at.js',
  'cleanup-database.js',
  'delete-shortcuts.bat',
  'modify-service-permissions.js',
  'kill-all-nia.bat',
  'kill-nia-web.bat',
  'start-all.bat',
  'start-nia-web.bat',
  'test-identity.db',
  'test-schema.py',
  'Force',
  'p'
]);

const rootDir = __dirname;
const files = fs.readdirSync(rootDir);

const toArchive = [];
const toKeep = [];

for (const file of files) {
  const fullPath = path.join(rootDir, file);
  const stat = fs.statSync(fullPath);
  
  if (stat.isDirectory()) {
    continue;
  }
  
  if (ESSENTIAL_FILES.has(file)) {
    toKeep.push({ file, reason: 'Essential' });
    continue;
  }
  
  if (SAFE_TO_ARCHIVE.has(file)) {
    toArchive.push({ file, reason: 'Known old file' });
    continue;
  }
  
  let isJunk = false;
  for (const pattern of JUNK_PATTERNS) {
    if (pattern.test(file)) {
      isJunk = true;
      toArchive.push({ file, reason: `Pattern: ${pattern}` });
      break;
    }
  }
  
  if (!isJunk) {
    toKeep.push({ file, reason: 'Unrecognized - keeping safe' });
  }
}

console.log('✅ FILES TO KEEP:');
console.log('─'.repeat(60));
for (const item of toKeep) {
  console.log(`  KEEP: ${item.file}`);
}

console.log('');
console.log('📦 FILES THAT WOULD BE ARCHIVED:');
console.log('─'.repeat(60));
for (const item of toArchive) {
  console.log(`  ARCHIVE: ${item.file}`);
}

console.log('');
console.log('========================================');
console.log('SUMMARY');
console.log('========================================');
console.log(`Would keep:    ${toKeep.length} files`);
console.log(`Would archive: ${toArchive.length} files`);
console.log('');
console.log('This was just a preview!');
console.log('No files were actually moved.');
console.log('No programs were launched.');
console.log('');
