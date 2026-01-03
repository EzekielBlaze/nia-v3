/**
 * Simple Belief Delete
 * 
 * Just deletes beliefs - SQLite will handle cascade if configured
 * If foreign keys block deletion, we'll see which ones
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nia.db');
const db = sqlite3(dbPath);

console.log('\n=== SIMPLE DELETE ===\n');

// Try with foreign keys OFF first (to see if that's the issue)
console.log('Disabling foreign key constraints temporarily...\n');
db.pragma('foreign_keys = OFF');

// Beliefs to KEEP
const keepIds = [
  44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62,
  73, 74, 75, 85, 86, 89, 90, 91, 92
];

const all = db.prepare('SELECT id, belief_statement FROM beliefs ORDER BY id').all();
const remove = all.filter(b => !keepIds.includes(b.id));

console.log(`Will delete ${remove.length} beliefs:\n`);
remove.forEach(b => {
  console.log(`  ${b.id}: "${b.belief_statement.substring(0, 60)}..."`);
});

console.log('\nType "yes" to proceed:\n');

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Confirm (yes/no): ', (answer) => {
  if (answer.toLowerCase() !== 'yes') {
    console.log('\nCancelled.\n');
    db.close();
    rl.close();
    return;
  }
  
  console.log('\nDeleting...\n');
  
  let deleted = 0;
  const deleteStmt = db.prepare('DELETE FROM beliefs WHERE id = ?');
  
  for (const belief of remove) {
    try {
      deleteStmt.run(belief.id);
      console.log(`  ✓ Deleted ${belief.id}`);
      deleted++;
    } catch (err) {
      console.log(`  ✗ Failed ${belief.id}: ${err.message}`);
    }
  }
  
  console.log(`\n✅ Deleted ${deleted} beliefs\n`);
  
  const remaining = db.prepare('SELECT COUNT(*) as count FROM beliefs').get().count;
  console.log(`Database now has ${remaining} beliefs\n`);
  
  // Re-enable foreign keys
  db.pragma('foreign_keys = ON');
  
  db.close();
  rl.close();
});
