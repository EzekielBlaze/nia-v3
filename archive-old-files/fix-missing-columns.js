/**
 * Add ALL missing columns to fix chat and identity
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nia.db');
const db = sqlite3(dbPath);

console.log('\n=== ADDING ALL MISSING COLUMNS ===\n');

const fixes = [
  // cognitive_state table columns
  {
    table: 'cognitive_state',
    column: 'revision_budget_used_today',
    definition: 'INTEGER DEFAULT 0'
  },
  {
    table: 'cognitive_state',
    column: 'behavioral_impact',
    definition: 'TEXT'
  },
  {
    table: 'cognitive_state',
    column: 'load_date',
    definition: 'TEXT'
  },
  // belief_extraction_audit columns
  {
    table: 'belief_extraction_audit',
    column: 'pass_a_output',
    definition: 'TEXT'
  },
  {
    table: 'belief_extraction_audit',
    column: 'pass_b_output',
    definition: 'TEXT'
  }
];

let added = 0;
let skipped = 0;

for (const fix of fixes) {
  try {
    console.log(`Adding ${fix.table}.${fix.column}...`);
    db.exec(`ALTER TABLE ${fix.table} ADD COLUMN ${fix.column} ${fix.definition}`);
    console.log(`  ✓ Added`);
    added++;
  } catch (err) {
    if (err.message.includes('duplicate column')) {
      console.log(`  - Already exists`);
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
