/**
 * FIX FTS TABLE
 * Fixes the "no such column: T.topics" error
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nia.db');
const db = new Database(dbPath);

console.log('=== FIX FTS TABLE ===\n');

// Check current FTS structure
console.log('1. Checking current FTS table...');
try {
  const ftsInfo = db.prepare("SELECT * FROM memory_fts LIMIT 1").all();
  console.log('   FTS table exists');
} catch (e) {
  console.log('   FTS table missing or broken:', e.message);
}

// Drop and recreate FTS table
console.log('\n2. Recreating FTS table...');
try {
  db.exec(`DROP TABLE IF EXISTS memory_fts`);
  console.log('   Dropped old FTS table');
} catch (e) {
  console.log('   Drop error (ok if not exists):', e.message);
}

// Create new FTS table
db.exec(`
  CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
    memory_statement,
    topics,
    subjects,
    content='memory_commits',
    content_rowid=id
  )
`);
console.log('   Created new FTS table');

// Populate FTS from existing memories
console.log('\n3. Populating FTS with existing memories...');
const memories = db.prepare(`
  SELECT id, memory_statement, topics_json, subjects_json 
  FROM memory_commits 
  WHERE is_active = 1
`).all();

console.log(`   Found ${memories.length} active memories`);

// Clear and repopulate
db.exec(`DELETE FROM memory_fts`);

const insertFts = db.prepare(`
  INSERT INTO memory_fts(rowid, memory_statement, topics, subjects)
  VALUES (?, ?, ?, ?)
`);

let inserted = 0;
for (const m of memories) {
  try {
    insertFts.run(
      m.id,
      m.memory_statement,
      m.topics_json || '[]',
      m.subjects_json || '[]'
    );
    inserted++;
  } catch (e) {
    console.log(`   Error inserting memory ${m.id}:`, e.message);
  }
}
console.log(`   Inserted ${inserted} memories into FTS`);

// Drop old triggers and recreate
console.log('\n4. Recreating FTS triggers...');
db.exec(`DROP TRIGGER IF EXISTS memory_fts_insert`);
db.exec(`DROP TRIGGER IF EXISTS memory_fts_delete`);
db.exec(`DROP TRIGGER IF EXISTS memory_fts_update`);

db.exec(`
  CREATE TRIGGER memory_fts_insert AFTER INSERT ON memory_commits BEGIN
    INSERT INTO memory_fts(rowid, memory_statement, topics, subjects)
    VALUES (new.id, new.memory_statement, new.topics_json, new.subjects_json);
  END
`);

db.exec(`
  CREATE TRIGGER memory_fts_delete AFTER DELETE ON memory_commits BEGIN
    DELETE FROM memory_fts WHERE rowid = old.id;
  END
`);

db.exec(`
  CREATE TRIGGER memory_fts_update AFTER UPDATE ON memory_commits BEGIN
    DELETE FROM memory_fts WHERE rowid = old.id;
    INSERT INTO memory_fts(rowid, memory_statement, topics, subjects)
    VALUES (new.id, new.memory_statement, new.topics_json, new.subjects_json);
  END
`);
console.log('   Triggers recreated');

// Test FTS search
console.log('\n5. Testing FTS search...');
try {
  const testResult = db.prepare(`
    SELECT rowid, memory_statement FROM memory_fts 
    WHERE memory_fts MATCH 'user OR like'
    LIMIT 3
  `).all();
  console.log(`   ✅ FTS working! Found ${testResult.length} results`);
  testResult.forEach(r => console.log(`      - ${r.memory_statement.substring(0, 50)}...`));
} catch (e) {
  console.log('   ❌ FTS test failed:', e.message);
}

console.log('\n✅ Done! Restart daemon to pick up changes.');
db.close();
