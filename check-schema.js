/**
 * Check Database Schema - Find actual table names
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nia.db');
const db = sqlite3(dbPath);

console.log('\n=== DATABASE SCHEMA ===\n');

// Get all tables
const tables = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' 
  ORDER BY name
`).all();

console.log('Tables:\n');
tables.forEach(t => console.log(`  - ${t.name}`));

// Check beliefs table structure
console.log('\n=== BELIEFS TABLE COLUMNS ===\n');
const beliefCols = db.prepare('PRAGMA table_info(beliefs)').all();
beliefCols.forEach(c => console.log(`  ${c.name}: ${c.type}`));

// Check for foreign keys on beliefs
console.log('\n=== FOREIGN KEYS ON BELIEFS ===\n');
const fks = db.prepare('PRAGMA foreign_key_list(beliefs)').all();
if (fks.length > 0) {
  fks.forEach(fk => console.log(`  ${fk.from} -> ${fk.table}.${fk.to}`));
} else {
  console.log('  (none)');
}

// Check what references beliefs
console.log('\n=== TABLES THAT MIGHT REFERENCE BELIEFS ===\n');
for (const table of tables) {
  const refs = db.prepare(`PRAGMA foreign_key_list(${table.name})`).all();
  const beliefRefs = refs.filter(r => r.table === 'beliefs');
  if (beliefRefs.length > 0) {
    console.log(`  ${table.name}:`);
    beliefRefs.forEach(r => console.log(`    - ${r.from} -> beliefs.${r.to}`));
  }
}

console.log('\n');

db.close();
