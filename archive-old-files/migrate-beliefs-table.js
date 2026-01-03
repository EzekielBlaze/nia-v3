/**
 * NIA V3 - Beliefs Table Migration
 * Adds missing columns to existing beliefs table
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');

console.log('\n=== NIA Database Migration - Beliefs Table ===\n');

const dbPath = path.join(__dirname, 'data', 'nia.db');
const db = sqlite3(dbPath);

console.log(`Database: ${dbPath}`);

try {
  // Get current beliefs table schema
  const tableInfo = db.prepare("PRAGMA table_info(beliefs)").all();
  const columnNames = tableInfo.map(c => c.name);
  
  console.log('\nCurrent beliefs columns:', columnNames.join(', '));
  
  // Check which columns are missing
  const requiredColumns = {
    'decay_rate': 'REAL DEFAULT 0.1',
    'last_reinforced': 'INTEGER',
    'last_challenged': 'INTEGER',
    'belief_class': 'TEXT'
  };
  
  console.log('\n=== Checking for missing columns ===');
  
  let addedColumns = 0;
  
  for (const [colName, colDef] of Object.entries(requiredColumns)) {
    if (!columnNames.includes(colName)) {
      console.log(`\n[+] Adding column: ${colName}`);
      db.exec(`ALTER TABLE beliefs ADD COLUMN ${colName} ${colDef}`);
      addedColumns++;
      console.log(`✓ ${colName} added`);
    } else {
      console.log(`[✓] ${colName} already exists`);
    }
  }
  
  if (addedColumns === 0) {
    console.log('\n✓ All required columns already exist!');
  } else {
    console.log(`\n✓ Added ${addedColumns} missing column(s)`);
  }
  
  // Verify final schema
  const updatedInfo = db.prepare("PRAGMA table_info(beliefs)").all();
  const updatedColumns = updatedInfo.map(c => c.name);
  
  console.log('\n=== Updated beliefs columns ===');
  console.log(updatedColumns.join(', '));
  
  console.log('\n✓ Beliefs table migration complete!\n');
  
} catch (err) {
  console.error('\n✗ Migration failed:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  db.close();
}
