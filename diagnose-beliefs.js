/**
 * BELIEF DIAGNOSTIC
 * Checks why belief_stats might be returning --
 * 
 * Run: node diagnose-beliefs.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nia.db');
console.log('\n=== BELIEF DIAGNOSTIC ===\n');
console.log('Database:', dbPath);

const db = new Database(dbPath);

try {
  // 1. Total beliefs (no filter)
  const totalAll = db.prepare('SELECT COUNT(*) as count FROM beliefs').get();
  console.log(`\n1. Total beliefs (all): ${totalAll.count}`);
  
  // 2. Check valid_to column
  const columns = db.prepare('PRAGMA table_info(beliefs)').all();
  const hasValidTo = columns.some(c => c.name === 'valid_to');
  const hasConviction = columns.some(c => c.name === 'conviction_score');
  console.log(`\n2. Column check:`);
  console.log(`   - valid_to exists: ${hasValidTo}`);
  console.log(`   - conviction_score exists: ${hasConviction}`);
  
  // 3. Check valid_to values
  if (hasValidTo) {
    const nullCount = db.prepare('SELECT COUNT(*) as count FROM beliefs WHERE valid_to IS NULL').get();
    const notNullCount = db.prepare('SELECT COUNT(*) as count FROM beliefs WHERE valid_to IS NOT NULL').get();
    console.log(`\n3. valid_to distribution:`);
    console.log(`   - valid_to IS NULL (active): ${nullCount.count}`);
    console.log(`   - valid_to IS NOT NULL (superseded): ${notNullCount.count}`);
    
    // Sample of valid_to values
    const sample = db.prepare('SELECT id, valid_to FROM beliefs WHERE valid_to IS NOT NULL LIMIT 5').all();
    if (sample.length > 0) {
      console.log(`   - Sample non-null values:`);
      sample.forEach(r => console.log(`     ID ${r.id}: valid_to = ${r.valid_to}`));
    }
  }
  
  // 4. Check conviction_score values
  if (hasConviction) {
    const convStats = db.prepare(`
      SELECT 
        MIN(conviction_score) as min,
        MAX(conviction_score) as max,
        AVG(conviction_score) as avg,
        COUNT(*) as count
      FROM beliefs
    `).get();
    console.log(`\n4. conviction_score stats (all beliefs):`);
    console.log(`   - Count: ${convStats.count}`);
    console.log(`   - Min: ${convStats.min}`);
    console.log(`   - Max: ${convStats.max}`);
    console.log(`   - Avg: ${convStats.avg?.toFixed(2)}`);
    
    // Core (>=80) and emerging (<50) counts
    const core = db.prepare('SELECT COUNT(*) as count FROM beliefs WHERE conviction_score >= 80').get();
    const emerging = db.prepare('SELECT COUNT(*) as count FROM beliefs WHERE conviction_score < 50').get();
    console.log(`   - Core (>=80): ${core.count}`);
    console.log(`   - Emerging (<50): ${emerging.count}`);
  }
  
  // 5. Sample beliefs
  console.log(`\n5. Sample beliefs (first 5):`);
  const sample = db.prepare(`
    SELECT id, belief_statement, belief_type, conviction_score, valid_to
    FROM beliefs
    ORDER BY id DESC
    LIMIT 5
  `).all();
  
  sample.forEach(b => {
    const status = b.valid_to === null ? '✅ ACTIVE' : `❌ SUPERSEDED (${b.valid_to})`;
    console.log(`   #${b.id}: "${b.belief_statement?.substring(0, 40)}..." [${b.belief_type}] conv=${b.conviction_score} ${status}`);
  });
  
  // 6. What belief_stats SHOULD return
  console.log(`\n6. What belief_stats query returns:`);
  const total = db.prepare('SELECT COUNT(*) as count FROM beliefs WHERE valid_to IS NULL').get();
  const coreQ = db.prepare('SELECT COUNT(*) as count FROM beliefs WHERE valid_to IS NULL AND conviction_score >= 80').get();
  const emergingQ = db.prepare('SELECT COUNT(*) as count FROM beliefs WHERE valid_to IS NULL AND conviction_score < 50').get();
  const avgQ = db.prepare('SELECT AVG(conviction_score) as avg FROM beliefs WHERE valid_to IS NULL').get();
  
  console.log(`   total: ${total.count}`);
  console.log(`   core: ${coreQ.count}`);
  console.log(`   emerging: ${emergingQ.count}`);
  console.log(`   avgConviction: ${Math.round(avgQ.avg || 0)}`);
  
  // 7. Diagnosis
  console.log(`\n═══════════════════════════════════`);
  console.log('DIAGNOSIS:');
  console.log('═══════════════════════════════════');
  
  if (totalAll.count === 0) {
    console.log('❌ No beliefs in database at all');
  } else if (total.count === 0 && totalAll.count > 0) {
    console.log('❌ ALL beliefs have valid_to set - none are "active"');
    console.log('   FIX: Set valid_to = NULL for current beliefs');
    console.log('   Run: UPDATE beliefs SET valid_to = NULL WHERE valid_to IS NOT NULL;');
  } else if (total.count > 0) {
    console.log(`✅ ${total.count} active beliefs found`);
    console.log('   If UI still shows --, the issue is in the API call or response format');
  }
  
  console.log('');
  
} catch (err) {
  console.error('Error:', err.message);
} finally {
  db.close();
}
