/**
 * NIA PATH AUTO-FIXER
 * 
 * Automatically fixes the require paths in core/memory/daemon/ files
 * 
 * Run: node fix-integrator-paths.js
 */

const fs = require('fs');
const path = require('path');

const daemonDir = path.join(__dirname, 'core', 'memory', 'daemon');

// Files to fix
const filesToFix = [
  'session-manager.js',
  'memory-integrator.js',
  'chat-handler.js',
  'belief-integrator.js',
  'correction-integrator.js'
];

// Wrong patterns and their corrections
const fixes = [
  // Temporal
  { wrong: "require('../memory/temporal')", correct: "require('../temporal')" },
  { wrong: 'require("../memory/temporal")', correct: 'require("../temporal")' },
  
  // Recall
  { wrong: "require('../memory/recall')", correct: "require('../recall')" },
  { wrong: 'require("../memory/recall")', correct: 'require("../recall")' },
  
  // Formation
  { wrong: "require('../memory/formation')", correct: "require('../formation')" },
  { wrong: 'require("../memory/formation")', correct: 'require("../formation")' },
  
  // Correction
  { wrong: "require('../memory/correction')", correct: "require('../correction')" },
  { wrong: 'require("../memory/correction")', correct: 'require("../correction")' },
  
  // Parsers
  { wrong: "require('../memory/parsers')", correct: "require('../parsers')" },
  { wrong: 'require("../memory/parsers")', correct: 'require("../parsers")' },
  
  // Vector
  { wrong: "require('../memory/vector')", correct: "require('../vector')" },
  { wrong: 'require("../memory/vector")', correct: 'require("../vector")' },
];

console.log('\n========================================');
console.log('  NIA PATH AUTO-FIXER');
console.log('========================================\n');

// Check if directory exists
if (!fs.existsSync(daemonDir)) {
  console.log(`❌ Directory not found: ${daemonDir}`);
  console.log('   Make sure you run this from the NIA root folder.');
  process.exit(1);
}

let totalFixed = 0;

for (const filename of filesToFix) {
  const filepath = path.join(daemonDir, filename);
  
  if (!fs.existsSync(filepath)) {
    console.log(`⏭️  Skipping ${filename} (not found)`);
    continue;
  }
  
  let content = fs.readFileSync(filepath, 'utf8');
  let fileFixed = 0;
  
  for (const fix of fixes) {
    if (content.includes(fix.wrong)) {
      content = content.replace(new RegExp(escapeRegExp(fix.wrong), 'g'), fix.correct);
      fileFixed++;
      console.log(`   Fixed: ${fix.wrong} → ${fix.correct}`);
    }
  }
  
  if (fileFixed > 0) {
    // Backup original
    const backupPath = filepath + '.backup';
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, fs.readFileSync(filepath));
    }
    
    // Write fixed content
    fs.writeFileSync(filepath, content);
    console.log(`✅ ${filename} - Fixed ${fileFixed} path(s)`);
    totalFixed += fileFixed;
  } else {
    console.log(`✓  ${filename} - No fixes needed`);
  }
}

console.log('\n========================================');
console.log(`  DONE! Fixed ${totalFixed} path(s)`);
console.log('========================================\n');

if (totalFixed > 0) {
  console.log('Backups created with .backup extension');
  console.log('Now try running: node daemon.js\n');
}

// Helper function to escape regex special chars
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
