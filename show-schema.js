/**
 * CHECK SCHEMA
 * Shows actual memory_commits table structure
 */

const Database = require('better-sqlite3');
const db = new Database('./data/nia.db');

console.log('Current memory_commits schema:');
console.log('');

const schema = db.prepare(`
  SELECT sql FROM sqlite_master 
  WHERE type='table' AND name='memory_commits'
`).get();

console.log(schema.sql);
console.log('');

// Get column info
const columns = db.pragma('table_info(memory_commits)');
console.log('Columns:');
columns.forEach(col => {
  console.log(`  ${col.name} - ${col.type} ${col.notnull ? 'NOT NULL' : 'NULL'} ${col.pk ? 'PRIMARY KEY' : ''}`);
});

db.close();
