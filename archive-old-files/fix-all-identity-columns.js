/**
 * Add ALL missing columns to identity_scars and cognitive_load tables
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nia.db');
const db = sqlite3(dbPath);

console.log('\n=== ADDING ALL MISSING COLUMNS ===\n');

// All columns for identity_scars table
const identityScarsColumns = [
  { column: 'behavioral_impact', definition: 'TEXT' },
  { column: 'value_shift', definition: 'TEXT' },
  { column: 'capability_change', definition: 'TEXT' },
  { column: 'integration_status', definition: 'TEXT DEFAULT "unprocessed"' },
  { column: 'acceptance_level', definition: 'REAL DEFAULT 0.0' }
];

// All columns for cognitive_load table
const cognitiveLoadColumns = [
  { column: 'revision_budget_max', definition: 'INTEGER DEFAULT 100' },
  { column: 'revision_budget_remaining', definition: 'INTEGER DEFAULT 100' },
  { column: 'revision_budget_used_today', definition: 'INTEGER DEFAULT 0' },
  { column: 'active_tension_count', definition: 'INTEGER DEFAULT 0' },
  { column: 'active_distress_count', definition: 'INTEGER DEFAULT 0' },
  { column: 'fatigue_level', definition: 'REAL DEFAULT 0.0' },
  { column: 'is_overwhelmed', definition: 'INTEGER DEFAULT 0' },
  { column: 'can_process_new_beliefs', definition: 'INTEGER DEFAULT 1' },
  { column: 'can_revise_existing_beliefs', definition: 'INTEGER DEFAULT 1' },
  { column: 'can_resolve_tensions', definition: 'INTEGER DEFAULT 1' },
  { column: 'can_engage_complex_topics', definition: 'INTEGER DEFAULT 1' },
  { column: 'load_date', definition: 'TEXT' }
];

let added = 0;
let skipped = 0;
let tablesMissing = [];

// Add columns to identity_scars
console.log('=== identity_scars table ===\n');
for (const col of identityScarsColumns) {
  try {
    db.exec(`ALTER TABLE identity_scars ADD COLUMN ${col.column} ${col.definition}`);
    console.log(`  ✓ Added ${col.column}`);
    added++;
  } catch (err) {
    if (err.message.includes('duplicate column')) {
      console.log(`  - ${col.column} (already exists)`);
      skipped++;
    } else if (err.message.includes('no such table')) {
      if (!tablesMissing.includes('identity_scars')) {
        tablesMissing.push('identity_scars');
        console.log(`  ! Table identity_scars missing - will be created by schema`);
      }
      skipped++;
    } else {
      console.log(`  ✗ ${col.column}: ${err.message}`);
    }
  }
}

// Add columns to cognitive_load
console.log('\n=== cognitive_load table ===\n');
for (const col of cognitiveLoadColumns) {
  try {
    db.exec(`ALTER TABLE cognitive_load ADD COLUMN ${col.column} ${col.definition}`);
    console.log(`  ✓ Added ${col.column}`);
    added++;
  } catch (err) {
    if (err.message.includes('duplicate column')) {
      console.log(`  - ${col.column} (already exists)`);
      skipped++;
    } else if (err.message.includes('no such table')) {
      if (!tablesMissing.includes('cognitive_load')) {
        tablesMissing.push('cognitive_load');
        console.log(`  ! Table cognitive_load missing - will be created by schema`);
      }
      skipped++;
    } else {
      console.log(`  ✗ ${col.column}: ${err.message}`);
    }
  }
}

console.log(`\n=== SUMMARY ===`);
console.log(`Added: ${added}`);
console.log(`Skipped: ${skipped}`);
if (tablesMissing.length > 0) {
  console.log(`\nMissing tables: ${tablesMissing.join(', ')}`);
  console.log('These tables need to be created first from the schema!');
}
console.log('');

db.close();
