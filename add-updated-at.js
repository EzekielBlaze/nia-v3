/**
 * Add missing updated_at column to beliefs table
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nia.db');
const db = sqlite3(dbPath);

console.log('\n=== Adding missing updated_at column ===\n');

try {
  // Check if column exists
  const info = db.prepare("PRAGMA table_info(beliefs)").all();
  const hasUpdatedAt = info.some(c => c.name === 'updated_at');
  
  if (hasUpdatedAt) {
    console.log('✓ updated_at already exists');
  } else {
    console.log('Adding updated_at column...');
    // SQLite won't accept strftime() in ALTER TABLE, so use NULL
    db.exec(`ALTER TABLE beliefs ADD COLUMN updated_at INTEGER`);
    console.log('✓ updated_at added!');
    
    // Now update existing rows to have the current timestamp
    console.log('Setting timestamps for existing beliefs...');
    db.exec(`UPDATE beliefs SET updated_at = strftime('%s', 'now') WHERE updated_at IS NULL`);
    console.log('✓ Timestamps set!');
  }
  
  // Verify
  const finalInfo = db.prepare("PRAGMA table_info(beliefs)").all();
  const finalCheck = finalInfo.some(c => c.name === 'updated_at');
  
  if (finalCheck) {
    console.log('\n✓ Beliefs table is now complete!\n');
  } else {
    console.log('\n✗ Something went wrong\n');
  }
  
} catch (err) {
  console.error('Error:', err.message);
} finally {
  db.close();
}
