/**
 * SMART CLEANUP ANALYZER
 * Identifies junk vs essential files
 * VERY CONSERVATIVE - better to leave junk than archive something needed
 */

const fs = require('fs');
const path = require('path');

// ESSENTIAL FILES - NEVER TOUCH THESE!
const ESSENTIAL_FILES = new Set([
  // Core daemon
  'daemon.js',
  'ipc-client.js',
  'ipc-server.js',
  
  // Web server & UI
  'nia-server.js',
  'nia-ui.html',
  
  // Service
  'install-service.js',
  'uninstall-service.js',
  'service-manager.js',
  'service-wrapper.js',
  
  // Identity system
  'belief-processor.js',
  'belief-upserter.js',
  'belief-validator.js',
  'cognitive-state.js',
  'scar-processor.js',
  'autonomous-extraction-manager.js',
  'extraction-gatekeeper.js',
  
  // Belief extraction V2 (current system)
  'belief-extraction-engine-v2.js',
  'belief-extraction-prompt-v2.js',
  'extract-beliefs-v2.js',
  
  // Node
  'package.json',
  'package-lock.json',
  
  // Assets
  'Nia.png',
  'nia-icon.ico',
  'README.md',
  '.gitignore'
]);

// ESSENTIAL DIRECTORIES - NEVER TOUCH!
const ESSENTIAL_DIRS = new Set([
  'node_modules',
  'data',
  'logs',
  'core',
  'daemon',
  'archive-old-files' // Don't re-archive the archive!
]);

// PATTERNS for files that are LIKELY junk
const JUNK_PATTERNS = [
  /^test-.*\.js$/,           // test-*.js
  /^debug-.*\.js$/,          // debug-*.js
  /^check-(?!schema).*\.js$/, // check-*.js EXCEPT check-schema.js (needed)
  /^diagnose-.*\.js$/,       // diagnose-*.js
  /^fix-.*\.js$/,            // fix-*.js (old migration scripts)
  /-old\.js$/,               // *-old.js
  /^simple-delete/,          // simple-delete-*
  /^complete-/,              // complete-* (old scripts)
  /^migrate-(?!database)/,   // migrate-* EXCEPT migrate-database.bat
  /^setup-nia\.bat$/,        // Old setup script
  /^safe-migrate/,           // Old migration
  /^identity-query\.js$/,    // Old query script
  /^query$/,                 // Empty file
  /^stop$/,                  // Empty file
  /^\.js$/,                  // Invalid filename ".js"
  /^cleanup-plan\.json$/,    // Old cleanup plan
  /^patch-.*\.js$/           // Old patches
];

// KNOWN SAFE-TO-ARCHIVE specific files
const SAFE_TO_ARCHIVE = new Set([
  'connotation-manager.js',      // Old/unused
  'concept-connotation-schema.sql', // Old schema
  'add-updated-at.js',           // Old migration
  'cleanup-database.js',         // Old cleanup
  'delete-shortcuts.bat',        // Old
  'modify-service-permissions.js', // Old
  'kill-all-nia.bat',            // Replaced by better scripts
  'kill-nia-web.bat',            // Replaced
  'start-all.bat',               // Old startup
  'start-nia-web.bat',           // Old (we have new ones)
  'test-identity.db',            // Test database
  'test-schema.py',              // Test script
  'Force',                       // Empty dir?
  'p'                            // Empty dir?
]);

// Analyze files
function analyzeFiles() {
  const rootDir = __dirname;
  const files = fs.readdirSync(rootDir);
  
  const toArchive = [];
  const toKeep = [];
  
  for (const file of files) {
    const fullPath = path.join(rootDir, file);
    const stat = fs.statSync(fullPath);
    
    // Skip directories (we only clean root files)
    if (stat.isDirectory()) {
      if (ESSENTIAL_DIRS.has(file)) {
        continue; // Essential dir, skip
      } else {
        // Unknown directory - ask about it
        console.log(`⚠️  Unknown directory: ${file}`);
      }
      continue;
    }
    
    // Check if file is essential
    if (ESSENTIAL_FILES.has(file)) {
      toKeep.push({ file, reason: 'Essential file' });
      continue;
    }
    
    // Check if file is known safe to archive
    if (SAFE_TO_ARCHIVE.has(file)) {
      toArchive.push({ file, reason: 'Known old/unused file' });
      continue;
    }
    
    // Check junk patterns
    let isJunk = false;
    let junkReason = '';
    
    for (const pattern of JUNK_PATTERNS) {
      if (pattern.test(file)) {
        isJunk = true;
        junkReason = `Matches pattern: ${pattern}`;
        break;
      }
    }
    
    if (isJunk) {
      toArchive.push({ file, reason: junkReason });
    } else {
      toKeep.push({ file, reason: 'Unrecognized - KEEPING to be safe' });
    }
  }
  
  return { toArchive, toKeep };
}

// Display results
function displayResults(toArchive, toKeep) {
  console.log('');
  console.log('========================================');
  console.log('CLEANUP ANALYSIS');
  console.log('========================================');
  console.log('');
  
  console.log('📁 FILES TO KEEP:');
  console.log('─'.repeat(60));
  for (const item of toKeep) {
    console.log(`  ✅ ${item.file}`);
    console.log(`     → ${item.reason}`);
  }
  
  console.log('');
  console.log('🗑️  FILES TO ARCHIVE:');
  console.log('─'.repeat(60));
  for (const item of toArchive) {
    console.log(`  📦 ${item.file}`);
    console.log(`     → ${item.reason}`);
  }
  
  console.log('');
  console.log('========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log(`Files to keep:    ${toKeep.length}`);
  console.log(`Files to archive: ${toArchive.length}`);
  console.log('');
  console.log('Files will be MOVED to: archive-old-files\\');
  console.log('(You can restore them anytime!)');
  console.log('');
}

// Save cleanup plan
function saveCleanupPlan(toArchive) {
  const plan = {
    date: new Date().toISOString(),
    filesToArchive: toArchive.map(item => item.file)
  };
  
  fs.writeFileSync(
    path.join(__dirname, 'cleanup-plan-safe.json'),
    JSON.stringify(plan, null, 2)
  );
  
  console.log('Cleanup plan saved to: cleanup-plan-safe.json');
}

// Run analysis
const { toArchive, toKeep } = analyzeFiles();
displayResults(toArchive, toKeep);
saveCleanupPlan(toArchive);
