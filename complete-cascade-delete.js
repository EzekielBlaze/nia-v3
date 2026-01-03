/**
 * Complete Cascade Delete - All References
 * 
 * Deletes from all 7 tables that reference beliefs, then deletes beliefs
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nia.db');
const db = sqlite3(dbPath);

db.pragma('foreign_keys = ON');

console.log('\n=== COMPLETE CASCADE DELETE ===\n');

// Beliefs to KEEP
const keepIds = [
  44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62,
  73, 74, 75, 85, 86, 89, 90, 91, 92
];

const all = db.prepare('SELECT id, belief_statement, subject FROM beliefs ORDER BY id').all();
const keep = all.filter(b => keepIds.includes(b.id));
const remove = all.filter(b => !keepIds.includes(b.id));

console.log(`Keeping: ${keep.length} beliefs`);
console.log(`Removing: ${remove.length} beliefs\n`);

console.log('=== BELIEFS TO DELETE ===\n');
remove.forEach(b => {
  console.log(`  ${b.id}: "${b.belief_statement}" [${b.subject}]`);
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
  
  console.log('\nDeleting with full cascade...\n');
  
  db.prepare('BEGIN TRANSACTION').run();
  
  try {
    let totalDeleted = 0;
    
    for (const belief of remove) {
      const id = belief.id;
      
      // 1. belief_causality (belief_id)
      const causality = db.prepare('DELETE FROM belief_causality WHERE belief_id = ?').run(id);
      if (causality.changes > 0) console.log(`  - Deleted ${causality.changes} causality records`);
      
      // 2. belief_concepts (belief_id)
      const concepts = db.prepare('DELETE FROM belief_concepts WHERE belief_id = ?').run(id);
      if (concepts.changes > 0) console.log(`  - Deleted ${concepts.changes} concept links`);
      
      // 3. belief_echoes (superseded_belief_id)
      const echoes = db.prepare('DELETE FROM belief_echoes WHERE superseded_belief_id = ?').run(id);
      if (echoes.changes > 0) console.log(`  - Deleted ${echoes.changes} echo records`);
      
      // 4. cognitive_tension (belief_a_id, belief_b_id)
      const tensionA = db.prepare('DELETE FROM cognitive_tension WHERE belief_a_id = ?').run(id);
      const tensionB = db.prepare('DELETE FROM cognitive_tension WHERE belief_b_id = ?').run(id);
      const tensionTotal = tensionA.changes + tensionB.changes;
      if (tensionTotal > 0) console.log(`  - Deleted ${tensionTotal} tension records`);
      
      // 5. event_beliefs (belief_id)
      const events = db.prepare('DELETE FROM event_beliefs WHERE belief_id = ?').run(id);
      if (events.changes > 0) console.log(`  - Deleted ${events.changes} event links`);
      
      // 6. extraction_quarantine (approved_belief_id)
      const quarantine = db.prepare('DELETE FROM extraction_quarantine WHERE approved_belief_id = ?').run(id);
      if (quarantine.changes > 0) console.log(`  - Deleted ${quarantine.changes} quarantine records`);
      
      // 7. thought_beliefs (belief_id)
      const thoughts = db.prepare('DELETE FROM thought_beliefs WHERE belief_id = ?').run(id);
      if (thoughts.changes > 0) console.log(`  - Deleted ${thoughts.changes} thought links`);
      
      // 8. Clear superseded_by_belief_id in other beliefs
      const superseded = db.prepare('UPDATE beliefs SET superseded_by_belief_id = NULL WHERE superseded_by_belief_id = ?').run(id);
      if (superseded.changes > 0) console.log(`  - Cleared ${superseded.changes} superseded references`);
      
      // 9. Finally, delete the belief itself
      const result = db.prepare('DELETE FROM beliefs WHERE id = ?').run(id);
      if (result.changes > 0) {
        console.log(`  ✓ Deleted belief ${id}: "${belief.belief_statement.substring(0, 50)}..."\n`);
        totalDeleted++;
      }
    }
    
    db.prepare('COMMIT').run();
    
    console.log(`✅ Successfully deleted ${totalDeleted} beliefs and all dependencies\n`);
    
    const remaining = db.prepare('SELECT COUNT(*) as count FROM beliefs').get().count;
    console.log(`Database now has ${remaining} beliefs\n`);
    
  } catch (err) {
    db.prepare('ROLLBACK').run();
    console.error(`\n❌ Error: ${err.message}\n`);
    console.error('Transaction rolled back - no changes made.\n');
  }
  
  db.close();
  rl.close();
});
