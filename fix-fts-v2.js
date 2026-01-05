/**
 * FIX FTS TABLE v2
 * Drops triggers FIRST to avoid T.topics error
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nia.db');
const db = new Database(dbPath);

console.log('=== FIX FTS TABLE v2 ===\n');

// 1. Drop ALL triggers first (this is the key!)
console.log('1. Dropping all FTS triggers...');
try { db.exec(`DROP TRIGGER IF EXISTS memory_fts_insert`); } catch(e) {}
try { db.exec(`DROP TRIGGER IF EXISTS memory_fts_delete`); } catch(e) {}
try { db.exec(`DROP TRIGGER IF EXISTS memory_fts_update`); } catch(e) {}
try { db.exec(`DROP TRIGGER IF EXISTS memory_fts_ai`); } catch(e) {}
try { db.exec(`DROP TRIGGER IF EXISTS memory_fts_ad`); } catch(e) {}
try { db.exec(`DROP TRIGGER IF EXISTS memory_fts_au`); } catch(e) {}

// Find and drop any other triggers on memory_commits
const triggers = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type = 'trigger' 
  AND (sql LIKE '%memory_fts%' OR sql LIKE '%memory_commits%')
`).all();
console.log(`   Found ${triggers.length} triggers to drop`);
for (const t of triggers) {
  console.log(`   Dropping: ${t.name}`);
  try { db.exec(`DROP TRIGGER IF EXISTS "${t.name}"`); } catch(e) {}
}
console.log('   Done');

// 2. Drop the FTS table
console.log('\n2. Dropping FTS table...');
try {
  db.exec(`DROP TABLE IF EXISTS memory_fts`);
  console.log('   Dropped');
} catch (e) {
  console.log('   Error:', e.message);
  // Try alternative method
  try {
    db.exec(`DROP TABLE memory_fts`);
  } catch(e2) {}
}

// 3. Create standalone FTS table (not content-linked)
console.log('\n3. Creating new standalone FTS table...');
db.exec(`
  CREATE VIRTUAL TABLE memory_fts USING fts5(
    memory_statement,
    topics,
    subjects
  )
`);
console.log('   Created');

// 4. Populate from existing memories
console.log('\n4. Populating FTS with existing memories...');
const memories = db.prepare(`
  SELECT id, memory_statement, topics_json, subjects_json 
  FROM memory_commits 
  WHERE is_active = 1
`).all();
console.log(`   Found ${memories.length} active memories`);

const insertFts = db.prepare(`
  INSERT INTO memory_fts(rowid, memory_statement, topics, subjects)
  VALUES (?, ?, ?, ?)
`);

let inserted = 0;
for (const m of memories) {
  try {
    insertFts.run(
      m.id,
      m.memory_statement || '',
      m.topics_json || '[]',
      m.subjects_json || '[]'
    );
    inserted++;
    console.log(`   ✓ Memory #${m.id}`);
  } catch (e) {
    console.log(`   ✗ Memory #${m.id}: ${e.message}`);
  }
}
console.log(`   Inserted ${inserted}/${memories.length}`);

// 5. Create new triggers (with correct column names!)
console.log('\n5. Creating new triggers...');

db.exec(`
  CREATE TRIGGER memory_fts_insert AFTER INSERT ON memory_commits BEGIN
    INSERT INTO memory_fts(rowid, memory_statement, topics, subjects)
    VALUES (new.id, new.memory_statement, new.topics_json, new.subjects_json);
  END
`);
console.log('   Created insert trigger');

db.exec(`
  CREATE TRIGGER memory_fts_delete AFTER DELETE ON memory_commits BEGIN
    DELETE FROM memory_fts WHERE rowid = old.id;
  END
`);
console.log('   Created delete trigger');

db.exec(`
  CREATE TRIGGER memory_fts_update AFTER UPDATE ON memory_commits BEGIN
    DELETE FROM memory_fts WHERE rowid = old.id;
    INSERT INTO memory_fts(rowid, memory_statement, topics, subjects)
    VALUES (new.id, new.memory_statement, new.topics_json, new.subjects_json);
  END
`);
console.log('   Created update trigger');

// 6. Test
console.log('\n6. Testing FTS search...');
try {
  const testResult = db.prepare(`
    SELECT rowid, memory_statement FROM memory_fts 
    WHERE memory_fts MATCH '"user" OR "like"'
    LIMIT 3
  `).all();
  console.log(`   ✅ FTS working! Found ${testResult.length} results`);
  testResult.forEach(r => console.log(`      - ${r.memory_statement.substring(0, 50)}...`));
} catch (e) {
  console.log('   ❌ FTS test failed:', e.message);
}

console.log('\n✅ Done! Restart daemon to pick up changes.');
db.close();
