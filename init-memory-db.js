/**
 * NIA DATABASE INITIALIZER
 * 
 * Creates all required tables for the memory system.
 * Run: node init-memory-db.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

console.log('\n╔════════════════════════════════════════╗');
console.log('║     NIA DATABASE INITIALIZER           ║');
console.log('╚════════════════════════════════════════╝\n');

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('✓ Created data directory');
}

const dbPath = path.join(dataDir, 'nia.db');
console.log('Database:', dbPath);
console.log('');

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// ============================================================================
// MEMORY COMMITS TABLE
// ============================================================================
console.log('Creating memory_commits table...');
db.exec(`
  CREATE TABLE IF NOT EXISTS memory_commits (
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
    
    -- Source tracking
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
console.log('✓ memory_commits');

// Indexes
db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_temporal ON memory_commits(committed_at DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_active ON memory_commits(is_active) WHERE is_active = 1`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_strength ON memory_commits(strength DESC)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_memory_vector ON memory_commits(vector_id)`);
console.log('✓ memory indexes');

// ============================================================================
// MEMORY ACCESS LOG
// ============================================================================
console.log('Creating memory_access_log table...');
db.exec(`
  CREATE TABLE IF NOT EXISTS memory_access_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id INTEGER NOT NULL,
    accessed_at INTEGER NOT NULL,
    access_context TEXT CHECK(access_context IN (
      'conversation_recall', 'user_query', 'related_trigger', 'periodic_review'
    )) NOT NULL,
    triggered_by_turn_id INTEGER,
    
    FOREIGN KEY(memory_id) REFERENCES memory_commits(id) ON DELETE CASCADE
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_access_memory ON memory_access_log(memory_id, accessed_at DESC)`);
console.log('✓ memory_access_log');

// ============================================================================
// FTS5 FULL-TEXT SEARCH
// ============================================================================
console.log('Creating FTS5 virtual table...');
try {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
      memory_statement,
      topics,
      subjects,
      content=memory_commits,
      content_rowid=id
    )
  `);
  console.log('✓ memory_fts');
  
  // Triggers to keep FTS in sync
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memory_fts_insert AFTER INSERT ON memory_commits BEGIN
      INSERT INTO memory_fts(rowid, memory_statement, topics, subjects)
      VALUES (new.id, new.memory_statement, new.topics_json, new.subjects_json);
    END
  `);
  
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memory_fts_delete AFTER DELETE ON memory_commits BEGIN
      DELETE FROM memory_fts WHERE rowid = old.id;
    END
  `);
  
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS memory_fts_update AFTER UPDATE ON memory_commits BEGIN
      UPDATE memory_fts 
      SET memory_statement = new.memory_statement,
          topics = new.topics_json,
          subjects = new.subjects_json
      WHERE rowid = new.id;
    END
  `);
  console.log('✓ FTS triggers');
  
} catch (err) {
  console.log('⚠ FTS5 setup error (may already exist):', err.message);
}

// ============================================================================
// BELIEF EXTRACTION AUDIT
// ============================================================================
console.log('Creating belief_extraction_audit table...');
db.exec(`
  CREATE TABLE IF NOT EXISTS belief_extraction_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thinking_log_id INTEGER,
    processed_at INTEGER DEFAULT (strftime('%s','now') * 1000),
    beliefs_extracted INTEGER DEFAULT 0,
    subjects_extracted TEXT,
    topics_extracted TEXT,
    beliefs_formed INTEGER DEFAULT 0,
    processing_time_ms INTEGER,
    success INTEGER DEFAULT 1,
    error_message TEXT
  )
`);
console.log('✓ belief_extraction_audit');

// ============================================================================
// CONVERSATION SESSIONS
// ============================================================================
console.log('Creating conversation_sessions table...');
db.exec(`
  CREATE TABLE IF NOT EXISTS conversation_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT UNIQUE NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    turn_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active'
  )
`);
console.log('✓ conversation_sessions');

// ============================================================================
// SUMMARY
// ============================================================================
console.log('\n' + '═'.repeat(50));
console.log('DATABASE INITIALIZATION COMPLETE');
console.log('═'.repeat(50));

// Count existing records
const memCount = db.prepare('SELECT COUNT(*) as count FROM memory_commits').get().count;
const sessCount = db.prepare('SELECT COUNT(*) as count FROM conversation_sessions').get().count;

console.log(`\nCurrent data:`);
console.log(`  - Memories: ${memCount}`);
console.log(`  - Sessions: ${sessCount}`);
console.log('');

db.close();
