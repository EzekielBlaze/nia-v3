/**
 * Database Cleanup - Remove Junk Beliefs
 * 
 * KEEPS:
 * - Core beliefs 44-62 (19 beliefs about autonomy, boundaries, values)
 * - Reinforced beliefs (73 - friendly communication)
 * - Meaningful new beliefs about coding help, identity development
 * 
 * DELETES:
 * - Ephemeral statements ("my day is chill")
 * - Random noun subjects (Day, Nap, Title, Smiley_face)
 * - Weak/redundant beliefs
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nia.db');
const db = sqlite3(dbPath);

console.log('\n=== BELIEF CLEANUP ===\n');

// Get all current beliefs
const all = db.prepare('SELECT id, belief_statement, subject, conviction_score, times_reinforced FROM beliefs ORDER BY id').all();

console.log(`Total beliefs before cleanup: ${all.length}\n`);

// Define what to KEEP
const keepIds = [
  // Core seed beliefs (conviction 80-100, autonomy/boundaries/values)
  44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62,
  
  // Good reinforced/meaningful new beliefs
  73,  // "I value friendly communication" (reinforced 3x)
  74,  // "My name is meaningful" 
  75,  // "Conversations with caring people are valuable"
  85,  // "I have been helping with coding"
  86,  // "Coding is a task I can help with"
  89,  // "AI logic can be improved"
  90,  // "Consistency in AI processing is important"
  91,  // "Conversations are valuable for learning"
  92   // "Identity develops through conversations"
];

const keep = all.filter(b => keepIds.includes(b.id));
const remove = all.filter(b => !keepIds.includes(b.id));

console.log('=== KEEPING ===');
keep.forEach(b => {
  console.log(`  ✓ ${b.id}: ${b.belief_statement.substring(0, 70)}... (${b.conviction_score})`);
});

console.log(`\n=== REMOVING (${remove.length} beliefs) ===`);
remove.forEach(b => {
  console.log(`  ✗ ${b.id}: "${b.belief_statement}" [${b.subject}] (${b.conviction_score})`);
});

console.log('\n=== EXECUTE CLEANUP? ===');
console.log('This will DELETE the above beliefs.');
console.log('Type "yes" to confirm:\n');

// Wait for confirmation
const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('Confirm deletion (yes/no): ', (answer) => {
  if (answer.toLowerCase() === 'yes') {
    console.log('\nDeleting...\n');
    
    let deleted = 0;
    for (const belief of remove) {
      try {
        db.prepare('DELETE FROM beliefs WHERE id = ?').run(belief.id);
        console.log(`  Deleted ${belief.id}`);
        deleted++;
      } catch (err) {
        console.log(`  Failed to delete ${belief.id}: ${err.message}`);
      }
    }
    
    console.log(`\n✓ Deleted ${deleted} beliefs`);
    console.log(`✓ Kept ${keep.length} beliefs\n`);
    
    // Verify
    const remaining = db.prepare('SELECT COUNT(*) as count FROM beliefs').get().count;
    console.log(`Database now has ${remaining} beliefs total\n`);
  } else {
    console.log('\nCleanup cancelled.\n');
  }
  
  db.close();
  rl.close();
});
