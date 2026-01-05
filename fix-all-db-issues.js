/**
 * FIX ALL DATABASE ISSUES
 * Run: node fix-all-db-issues.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nia.db');
console.log(`Opening database: ${dbPath}`);

const db = new Database(dbPath);

// 1. Fix FTS table (recreate if wrong structure)
console.log('\n=== Fixing FTS Table ===');
try {
  // Check if FTS exists
  const ftsExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memory_fts'").get();
  
  if (ftsExists) {
    // Drop and recreate
    console.log('Dropping old FTS table...');
    db.exec('DROP TABLE IF EXISTS memory_fts');
  }
  
  console.log('Creating FTS table...');
  db.exec(`
    CREATE VIRTUAL TABLE memory_fts USING fts5(
      memory_statement,
      topics,
      subjects,
      content='memory_commits',
      content_rowid='id'
    )
  `);
  
  // Populate from existing memories
  const memories = db.prepare('SELECT id, memory_statement, topics_json, subjects_json FROM memory_commits WHERE is_active = 1').all();
  console.log(`Populating FTS with ${memories.length} memories...`);
  
  const insertFts = db.prepare('INSERT INTO memory_fts(rowid, memory_statement, topics, subjects) VALUES (?, ?, ?, ?)');
  for (const m of memories) {
    try {
      insertFts.run(m.id, m.memory_statement, m.topics_json || '[]', m.subjects_json || '[]');
    } catch (e) {
      console.log(`  Skip FTS for ${m.id}: ${e.message}`);
    }
  }
  console.log('FTS table fixed!');
} catch (err) {
  console.error('FTS fix failed:', err.message);
}

// 2. Fix belief_extraction_audit table
console.log('\n=== Fixing belief_extraction_audit ===');
try {
  const auditExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='belief_extraction_audit'").get();
  
  if (auditExists) {
    // Check for subjects_extracted column
    const cols = db.prepare("PRAGMA table_info(belief_extraction_audit)").all();
    const hasSubjects = cols.some(c => c.name === 'subjects_extracted');
    
    if (!hasSubjects) {
      console.log('Adding subjects_extracted column...');
      db.exec('ALTER TABLE belief_extraction_audit ADD COLUMN subjects_extracted INTEGER DEFAULT 0');
    }
    console.log('belief_extraction_audit fixed!');
  } else {
    console.log('Creating belief_extraction_audit table...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS belief_extraction_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thinking_log_id INTEGER,
        timestamp INTEGER,
        pass_a_output TEXT,
        pass_b_output TEXT,
        subjects_extracted INTEGER DEFAULT 0,
        beliefs_extracted INTEGER DEFAULT 0,
        beliefs_valid INTEGER DEFAULT 0,
        beliefs_created INTEGER DEFAULT 0,
        beliefs_updated INTEGER DEFAULT 0,
        processing_time_ms INTEGER,
        error_message TEXT
      )
    `);
  }
} catch (err) {
  console.error('Audit fix failed:', err.message);
}

// 3. Fix memory_extraction_audit table
console.log('\n=== Fixing memory_extraction_audit ===');
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_extraction_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      turn_id INTEGER,
      user_message TEXT,
      pass_a_output TEXT,
      pass_b_output TEXT,
      entities_extracted INTEGER DEFAULT 0,
      facts_extracted INTEGER DEFAULT 0,
      facts_valid INTEGER DEFAULT 0,
      facts_rejected INTEGER DEFAULT 0,
      memories_created INTEGER DEFAULT 0,
      memories_reinforced INTEGER DEFAULT 0,
      processing_time_ms INTEGER,
      timestamp INTEGER DEFAULT (strftime('%s', 'now') * 1000)
    )
  `);
  console.log('memory_extraction_audit ready!');
} catch (err) {
  console.error('Memory audit fix failed:', err.message);
}

// 4. Disable FK constraints temporarily to fix orphans
console.log('\n=== Fixing FK issues ===');
try {
  db.exec('PRAGMA foreign_keys = OFF');
  
  // Recreate memory_access_log without problematic FK
  const accessLogExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memory_access_log'").get();
  if (accessLogExists) {
    console.log('Recreating memory_access_log without strict FK...');
    db.exec(`
      CREATE TABLE IF NOT EXISTS memory_access_log_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_id INTEGER NOT NULL,
        accessed_at INTEGER NOT NULL,
        access_context TEXT,
        triggered_by_turn_id INTEGER
      )
    `);
    db.exec('INSERT INTO memory_access_log_new SELECT * FROM memory_access_log');
    db.exec('DROP TABLE memory_access_log');
    db.exec('ALTER TABLE memory_access_log_new RENAME TO memory_access_log');
    db.exec('CREATE INDEX IF NOT EXISTS idx_access_memory ON memory_access_log(memory_id, accessed_at DESC)');
    console.log('memory_access_log recreated without FK!');
  }
  
  // Check for orphan conversation_turns (table might be conversation_sessions or daemon_sessions)
  let sessionTable = 'conversation_sessions';
  try {
    db.prepare(`SELECT 1 FROM ${sessionTable} LIMIT 1`).get();
  } catch (e) {
    sessionTable = 'daemon_sessions';
    try {
      db.prepare(`SELECT 1 FROM ${sessionTable} LIMIT 1`).get();
    } catch (e2) {
      console.log('No sessions table found, skipping orphan check');
      sessionTable = null;
    }
  }
  
  if (sessionTable) {
    const orphanTurns = db.prepare(`
      SELECT COUNT(*) as cnt FROM conversation_turns 
      WHERE session_id NOT IN (SELECT id FROM ${sessionTable})
    `).get();
    
    if (orphanTurns.cnt > 0) {
      console.log(`Found ${orphanTurns.cnt} orphan turns, deleting...`);
      db.exec(`
        DELETE FROM conversation_turns 
        WHERE session_id NOT IN (SELECT id FROM ${sessionTable})
      `);
    }
  }
  
  db.exec('PRAGMA foreign_keys = ON');
  console.log('FK issues fixed!');
} catch (err) {
  console.error('FK fix failed:', err.message);
}

// 5. Clear failed extraction queue items
console.log('\n=== Clearing failed queue items ===');
try {
  const queueExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='extraction_queue'").get();
  if (queueExists) {
    // Check column structure
    const cols = db.prepare("PRAGMA table_info(extraction_queue)").all();
    const colNames = cols.map(c => c.name);
    console.log(`Queue columns: ${colNames.join(', ')}`);
    
    if (colNames.includes('status')) {
      const deleted = db.prepare("DELETE FROM extraction_queue WHERE status = 'extraction_failed'").run();
      console.log(`Cleared ${deleted.changes} failed queue items`);
    } else if (colNames.includes('reason')) {
      const deleted = db.prepare("DELETE FROM extraction_queue WHERE reason = 'extraction_failed'").run();
      console.log(`Cleared ${deleted.changes} failed queue items`);
    } else {
      console.log('Queue table has unexpected structure, skipping');
    }
  }
} catch (err) {
  console.error('Queue clear failed:', err.message);
}

// 6. Reset cognitive state energy
console.log('\n=== Fixing Cognitive State ===');
try {
  const csExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cognitive_state'").get();
  if (csExists) {
    db.prepare("UPDATE cognitive_state SET energy = 100, state = 'normal', extractions_today = 0 WHERE id = 1").run();
    console.log('Energy reset to 100, state to normal');
  } else {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cognitive_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        energy INTEGER DEFAULT 100,
        state TEXT DEFAULT 'normal',
        extractions_today INTEGER DEFAULT 0,
        extractions_declined INTEGER DEFAULT 0,
        last_extraction INTEGER,
        last_recovery INTEGER,
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      INSERT OR IGNORE INTO cognitive_state (id, energy) VALUES (1, 100);
    `);
    console.log('Cognitive state table created');
  }
} catch (err) {
  console.error('Cognitive state fix failed:', err.message);
}

// 7. Show summary
console.log('\n=== Summary ===');
try {
  const memories = db.prepare('SELECT COUNT(*) as cnt FROM memory_commits WHERE is_active = 1').get().cnt;
  console.log(`Memories: ${memories}`);
} catch (e) { console.log('Memories: (table not found)'); }

try {
  const beliefs = db.prepare('SELECT COUNT(*) as cnt FROM beliefs WHERE is_active = 1').get().cnt;
  console.log(`Beliefs: ${beliefs}`);
} catch (e) { console.log('Beliefs: (table not found)'); }

try {
  const fts = db.prepare('SELECT COUNT(*) as cnt FROM memory_fts').get().cnt;
  console.log(`FTS entries: ${fts}`);
} catch (e) { console.log('FTS: (table not found)'); }

db.close();
console.log('\n✅ All fixes applied! Restart daemon now.');
