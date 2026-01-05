/**
 * FIX MEMORY TABLE FOREIGN KEYS
 * 
 * The memory_commits table has FK constraints to tables that either
 * don't exist or reference the wrong table. This recreates the table
 * WITHOUT the problematic foreign keys.
 * 
 * Run: node fix-memory-fk.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nia.db');
console.log('\n=== Fixing Memory Table Foreign Keys ===\n');
console.log('Database:', dbPath);

const db = new Database(dbPath);

try {
  // First, check current state
  console.log('\n[1/5] Checking current memory_commits table...');
  const currentCount = db.prepare('SELECT COUNT(*) as count FROM memory_commits').get().count;
  console.log(`  Current memories: ${currentCount}`);
  
  // Backup existing data
  console.log('\n[2/5] Backing up existing memories...');
  const existingMemories = db.prepare('SELECT * FROM memory_commits').all();
  console.log(`  Backed up ${existingMemories.length} memories`);
  
  // Drop old table and related objects
  console.log('\n[3/5] Dropping old table and triggers...');
  
  // Drop FTS triggers first
  db.exec(`DROP TRIGGER IF EXISTS memory_fts_insert`);
  db.exec(`DROP TRIGGER IF EXISTS memory_fts_delete`);
  db.exec(`DROP TRIGGER IF EXISTS memory_fts_update`);
  
  // Drop FTS table
  db.exec(`DROP TABLE IF EXISTS memory_fts`);
  
  // Rename old table
  db.exec(`ALTER TABLE memory_commits RENAME TO memory_commits_old`);
  console.log('  ✓ Old table renamed to memory_commits_old');
  
  // Create new table WITHOUT foreign key constraints
  console.log('\n[4/5] Creating new table without FK constraints...');
  db.exec(`
    CREATE TABLE memory_commits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      
      -- Content
      memory_statement TEXT NOT NULL,
      memory_type TEXT CHECK(memory_type IN (
        'fact', 'preference', 'event', 'realization', 'context', 'observation'
      )) NOT NULL,
      
      -- Temporal
      committed_at INTEGER NOT NULL,
      temporal_bucket TEXT NOT NULL,
      relative_time_description TEXT,
      
      -- Source tracking (NO FOREIGN KEYS - just store the IDs)
      source_session_id INTEGER,
      source_turn_id INTEGER,
      source_thinking_log_id INTEGER,
      
      -- Formation
      commit_trigger TEXT CHECK(commit_trigger IN (
        'user_manual', 'auto_extract', 'nia_decision', 'threshold', 'manual_button'
      )) NOT NULL,
      formation_context TEXT,
      
      -- Semantic associations
      topics_json TEXT,
      subjects_json TEXT,
      related_memory_ids TEXT,
      
      -- Vector DB reference
      vector_id TEXT UNIQUE NOT NULL,
      embedding_model TEXT DEFAULT 'local-minilm',
      
      -- Memory dynamics
      strength REAL DEFAULT 1.0 CHECK(strength >= 0 AND strength <= 1),
      access_count INTEGER DEFAULT 0,
      last_accessed INTEGER,
      decay_rate REAL DEFAULT 0.01,
      
      -- Correction tracking
      correction_count INTEGER DEFAULT 0,
      last_corrected INTEGER,
      was_corrected_from INTEGER,
      
      -- Status
      is_active INTEGER DEFAULT 1,
      superseded_by INTEGER
    )
  `);
  console.log('  ✓ New table created');
  
  // Restore data
  if (existingMemories.length > 0) {
    console.log('  Restoring memories...');
    
    const insertStmt = db.prepare(`
      INSERT INTO memory_commits (
        id, memory_statement, memory_type, committed_at, temporal_bucket,
        relative_time_description, source_session_id, source_turn_id,
        source_thinking_log_id, commit_trigger, formation_context,
        topics_json, subjects_json, related_memory_ids, vector_id,
        embedding_model, strength, access_count, last_accessed, decay_rate,
        correction_count, last_corrected, was_corrected_from, is_active, superseded_by
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);
    
    for (const mem of existingMemories) {
      insertStmt.run(
        mem.id, mem.memory_statement, mem.memory_type, mem.committed_at, mem.temporal_bucket,
        mem.relative_time_description, mem.source_session_id, mem.source_turn_id,
        mem.source_thinking_log_id, mem.commit_trigger, mem.formation_context,
        mem.topics_json, mem.subjects_json, mem.related_memory_ids, mem.vector_id,
        mem.embedding_model, mem.strength, mem.access_count, mem.last_accessed, mem.decay_rate,
        mem.correction_count, mem.last_corrected, mem.was_corrected_from, mem.is_active, mem.superseded_by
      );
    }
    console.log(`  ✓ Restored ${existingMemories.length} memories`);
  }
  
  // Recreate indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_temporal ON memory_commits(committed_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_active ON memory_commits(is_active) WHERE is_active = 1`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_strength ON memory_commits(strength DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_vector ON memory_commits(vector_id)`);
  console.log('  ✓ Indexes created');
  
  // Recreate FTS
  console.log('\n[5/5] Recreating FTS...');
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      memory_statement,
      topics,
      subjects,
      content=memory_commits,
      content_rowid=id
    )
  `);
  
  // Recreate FTS triggers
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
      UPDATE memory_fts 
      SET memory_statement = new.memory_statement,
          topics = new.topics_json,
          subjects = new.subjects_json
      WHERE rowid = new.id;
    END
  `);
  console.log('  ✓ FTS table and triggers created');
  
  // Populate FTS with existing data
  if (existingMemories.length > 0) {
    db.exec(`INSERT INTO memory_fts(memory_fts) VALUES('rebuild')`);
    console.log('  ✓ FTS index rebuilt');
  }
  
  // Clean up old table
  db.exec(`DROP TABLE memory_commits_old`);
  console.log('  ✓ Old table dropped');
  
  // Verify
  const newCount = db.prepare('SELECT COUNT(*) as count FROM memory_commits').get().count;
  console.log(`\n✅ Fix complete! Memories: ${newCount}`);
  
  // Test insert
  console.log('\n[TEST] Testing memory insert...');
  const testResult = db.prepare(`
    INSERT INTO memory_commits (
      memory_statement, memory_type, committed_at, temporal_bucket,
      commit_trigger, vector_id, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(
    'TEST: FK fix verification',
    'observation',
    Date.now(),
    new Date().toISOString().split('T')[0],
    'manual_button',
    'test_fk_fix_' + Date.now()
  );
  
  console.log(`  ✓ Test insert successful: ID ${testResult.lastInsertRowid}`);
  
  // Clean up test
  db.prepare('DELETE FROM memory_commits WHERE id = ?').run(testResult.lastInsertRowid);
  console.log('  ✓ Test row cleaned up');
  
  console.log('\n═══════════════════════════════════════');
  console.log('  FOREIGN KEY FIX COMPLETE');
  console.log('═══════════════════════════════════════');
  console.log('\nRestart the daemon and try committing a memory!\n');
  
} catch (err) {
  console.error('\n❌ Error:', err.message);
  console.error(err.stack);
} finally {
  db.close();
}
