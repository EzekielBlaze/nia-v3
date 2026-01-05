/**
 * Delete Test Memories
 */

const Database = require('better-sqlite3');
const fetch = require('node-fetch');
const path = require('path');

const db = new Database(path.join(__dirname, 'data', 'nia.db'));

// Find test memories
const tests = db.prepare(`
  SELECT id, memory_statement FROM memory_commits 
  WHERE memory_statement LIKE '%TEST%' 
     OR memory_statement LIKE '%test%being tested%'
`).all();

console.log('Found test memories:', tests.length);
tests.forEach(t => console.log('  #' + t.id + ': ' + t.memory_statement.substring(0,50)));

if (tests.length === 0) {
  console.log('Nothing to delete!');
  db.close();
  process.exit(0);
}

// Delete from SQLite
const ids = tests.map(t => t.id);
db.prepare('DELETE FROM memory_commits WHERE id IN (' + ids.join(',') + ')').run();
console.log('✅ Deleted from SQLite');

// Delete from Qdrant
fetch('http://localhost:6333/collections/memories/points/delete', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({points: ids})
}).then(r => r.json()).then(d => {
  console.log('✅ Deleted from Qdrant:', d.status || d.result);
  db.close();
}).catch(e => {
  console.log('⚠️ Qdrant delete failed:', e.message);
  db.close();
});
