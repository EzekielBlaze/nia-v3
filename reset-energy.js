/**
 * Quick energy reset - run this directly
 */
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nia.db');
console.log('Opening database:', dbPath);

const db = new Database(dbPath);

// Reset energy
try {
  db.prepare("UPDATE cognitive_state SET energy = 100, state = 'normal', extractions_today = 0 WHERE id = 1").run();
  const state = db.prepare('SELECT * FROM cognitive_state WHERE id = 1').get();
  console.log('Cognitive state reset:', state);
} catch (err) {
  console.error('Error resetting cognitive state:', err.message);
}

// Show memories
console.log('\n=== Current Memories ===');
const memories = db.prepare('SELECT id, memory_statement FROM memory_commits WHERE is_active = 1').all();
memories.forEach(m => console.log(`  [${m.id}] ${m.memory_statement}`));
console.log(`Total: ${memories.length} memories`);

db.close();
console.log('\nDone! Restart daemon now.');
