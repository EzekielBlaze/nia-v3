/**
 * Quick check of data/nia.db structure
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data', 'nia.db');
console.log('Checking:', dbPath);

try {
  const db = new Database(dbPath, { readonly: true });
  
  // Get all tables
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log('\nTables in data/nia.db:');
  tables.forEach(t => console.log('  -', t.name));
  
  // Check for beliefs specifically
  const hasBelief = tables.some(t => t.name === 'beliefs');
  console.log('\nHas beliefs table:', hasBelief);
  
  if (hasBelief) {
    // Check schema
    const schema = db.prepare('PRAGMA table_info(beliefs)').all();
    const cols = schema.map(c => c.name);
    console.log('\nBeliefs columns:', cols.join(', '));
    console.log('Has vector_id:', cols.includes('vector_id'));
    
    // Count
    const count = db.prepare('SELECT COUNT(*) as c FROM beliefs').get();
    console.log('Total beliefs:', count.c);
    
    if (cols.includes('vector_id')) {
      const noVec = db.prepare('SELECT COUNT(*) as c FROM beliefs WHERE vector_id IS NULL').get();
      console.log('Without vector_id:', noVec.c);
    }
  }
  
  db.close();
} catch (err) {
  console.log('Error:', err.message);
}
