/**
 * NIA V3 - Execute Cleanup
 * 
 * Moves old files to archive folder based on cleanup-plan.json
 */

const fs = require('fs');
const path = require('path');

console.log('\n=== NIA Cleanup Execution ===\n');

// Load the plan
const planPath = path.join(__dirname, 'cleanup-plan.json');
if (!fs.existsSync(planPath)) {
  console.error('ERROR: cleanup-plan.json not found!');
  console.error('Run: node analyze-cleanup.js first\n');
  process.exit(1);
}

const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const backupDir = path.join(__dirname, 'archive-old-files');

console.log(`Plan created: ${plan.timestamp}`);
console.log(`Files to archive: ${plan.toArchive.length}`);
console.log(`Backup location: ${backupDir}\n`);

// Create backup directory
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir);
  console.log(`✓ Created backup directory\n`);
}

// Move files
let moved = 0;
let errors = [];

console.log('=== MOVING FILES ===\n');

for (const file of plan.toArchive) {
  const sourcePath = path.join(__dirname, file);
  const destPath = path.join(backupDir, file);
  
  try {
    if (fs.existsSync(sourcePath)) {
      fs.renameSync(sourcePath, destPath);
      console.log(`  ✓ ${file}`);
      moved++;
    } else {
      console.log(`  - ${file} (already gone)`);
    }
  } catch (err) {
    console.log(`  ✗ ${file}: ${err.message}`);
    errors.push({ file, error: err.message });
  }
}

console.log(`\n=== CLEANUP COMPLETE ===\n`);
console.log(`Files moved: ${moved}`);
console.log(`Errors: ${errors.length}`);
console.log(`\nBackup location: ${backupDir}`);

// Create restore script
const restoreScript = `/**
 * Restore archived files
 * Run this if you need to undo the cleanup
 */

const fs = require('fs');
const path = require('path');

const backupDir = path.join(__dirname, 'archive-old-files');
const files = ${JSON.stringify(plan.toArchive, null, 2)};

console.log('\\n=== RESTORING FILES ===\\n');

let restored = 0;
for (const file of files) {
  const sourcePath = path.join(backupDir, file);
  const destPath = path.join(__dirname, '..', file);
  
  try {
    if (fs.existsSync(sourcePath)) {
      fs.renameSync(sourcePath, destPath);
      console.log(\`  ✓ \${file}\`);
      restored++;
    }
  } catch (err) {
    console.log(\`  ✗ \${file}: \${err.message}\`);
  }
}

console.log(\`\\nRestored \${restored} files\\n\`);
`;

fs.writeFileSync(
  path.join(backupDir, 'restore-files.js'),
  restoreScript
);

console.log(`\nTo undo this cleanup, run: node archive-old-files/restore-files.js\n`);

if (errors.length > 0) {
  console.log('=== ERRORS ===\n');
  errors.forEach(e => console.log(`${e.file}: ${e.error}`));
  console.log('');
}
