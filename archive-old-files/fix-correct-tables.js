/**
 * Add missing columns to CORRECT tables
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nia.db');
const db = sqlite3(dbPath);

console.log('\n=== ADDING COLUMNS TO CORRECT TABLES ===\n');

const fixes = [
  // identity_scars table
  {
    table: 'identity_scars',
    column: 'behavioral_impact',
    definition: 'TEXT'
  },
  // cognitive_load table
  {
    table: 'cognitive_load',
    column: 'revision_budget_used_today',
    definition: 'INTEGER DEFAULT 0'
  },
  {
    table: 'cognitive_load',
    column: 'load_date',
    definition: 'TEXT'
  }
];

let added = 0;
let skipped = 0;

for (const fix of fixes) {
  try {
    console.log(`Adding ${fix.table}.${fix.column}...`);
    db.exec(`ALTER TABLE ${fix.table} ADD COLUMN ${fix.column} ${fix.definition}`);
    console.log(`  ✓ Added to ${fix.table}`);
    added++;
  } catch (err) {
    if (err.message.includes('duplicate column')) {
      console.log(`  - Already exists in ${fix.table}`);
      skipped++;
    } else if (err.message.includes('no such table')) {
      console.log(`  ! Table ${fix.table} doesn't exist - will be created later`);
      skipped++;
    } else {
      console.log(`  ✗ Error: ${err.message}`);
    }
  }
}

console.log(`\n=== SUMMARY ===`);
console.log(`Added: ${added}`);
console.log(`Skipped: ${skipped}\n`);

db.close();
