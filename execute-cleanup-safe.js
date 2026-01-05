/**
 * EXECUTE SAFE CLEANUP
 * Moves files to archive based on cleanup-plan-safe.json
 */

const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const archiveDir = path.join(rootDir, 'archive-old-files');

// Read cleanup plan
const planPath = path.join(rootDir, 'cleanup-plan-safe.json');

if (!fs.existsSync(planPath)) {
  console.error('❌ No cleanup plan found!');
  console.error('Run analyze-cleanup-safe.js first.');
  process.exit(1);
}

const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

console.log('');
console.log('========================================');
console.log('EXECUTING CLEANUP');
console.log('========================================');
console.log('');

// Create archive directory if needed
if (!fs.existsSync(archiveDir)) {
  fs.mkdirSync(archiveDir);
  console.log('✅ Created archive directory');
}

let moved = 0;
let skipped = 0;
let errors = 0;

for (const file of plan.filesToArchive) {
  const srcPath = path.join(rootDir, file);
  const destPath = path.join(archiveDir, file);
  
  try {
    // Check if file exists
    if (!fs.existsSync(srcPath)) {
      console.log(`⚠️  Skipped (not found): ${file}`);
      skipped++;
      continue;
    }
    
    // Check if already in archive
    if (fs.existsSync(destPath)) {
      console.log(`⚠️  Skipped (already in archive): ${file}`);
      skipped++;
      continue;
    }
    
    // Move file
    fs.renameSync(srcPath, destPath);
    console.log(`✅ Moved: ${file}`);
    moved++;
    
  } catch (err) {
    console.error(`❌ Error moving ${file}: ${err.message}`);
    errors++;
  }
}

console.log('');
console.log('========================================');
console.log('CLEANUP COMPLETE');
console.log('========================================');
console.log(`Files moved:   ${moved}`);
console.log(`Files skipped: ${skipped}`);
console.log(`Errors:        ${errors}`);
console.log('');
console.log('Archived files are in: archive-old-files\\');
console.log('');

// Clean up plan file
try {
  fs.unlinkSync(planPath);
  console.log('Cleanup plan removed.');
} catch (err) {
  // Ignore
}

console.log('');
