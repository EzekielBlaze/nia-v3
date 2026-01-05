/**
 * FIX FOREIGN KEYS
 * Makes source_session_id, source_turn_id, source_thinking_log_id nullable
 * so manual memory commits work
 */

const Database = require('better-sqlite3');
const fs = require('fs');

const dbPath = './data/nia.db';

// Backup first
const backupPath = `./data/nia-backup-${Date.now()}.db`;
fs.copyFileSync(dbPath, backupPath);
console.log(`✅ Backup created: ${backupPath}`);
console.log('');

const db = new Database(dbPath);

console.log('Fixing foreign keys...');
console.log('');

// SQLite doesn't support ALTER COLUMN, so we need to recreate the table
db.exec(`
  BEGIN TRANSACTION;
  
  -- Create new table with nullable foreign keys
  CREATE TABLE memory_commits_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_statement TEXT NOT NULL,
    memory_type TEXT NOT NULL DEFAULT 'observation',
    committed_at INTEGER NOT NULL,
    temporal_bucket TEXT,
    relative_time_description TEXT,
    source_session_id INTEGER,  -- Nullable!
    source_turn_id INTEGER,     -- Nullable!
    source_thinking_log_id INTEGER,  -- Nullable!
    commit_trigger TEXT NOT NULL,
    formation_context TEXT,
    topics_json TEXT,
    subjects_json TEXT,
    vector_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (source_session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (source_turn_id) REFERENCES conversation_turns(id) ON DELETE CASCADE,
    FOREIGN KEY (source_thinking_log_id) REFERENCES thinking_log(id) ON DELETE CASCADE,
    CHECK (commit_trigger IN (
      'user_manual',
      'auto_extract',
      'nia_decision',
      'threshold',
      'manual_button'
    ))
  );
  
  -- Copy existing data
  INSERT INTO memory_commits_new 
  SELECT * FROM memory_commits;
  
  -- Drop old table
  DROP TABLE memory_commits;
  
  -- Rename new table
  ALTER TABLE memory_commits_new RENAME TO memory_commits;
  
  -- Recreate indices
  CREATE INDEX idx_memory_session ON memory_commits(source_session_id);
  CREATE INDEX idx_memory_temporal ON memory_commits(temporal_bucket);
  CREATE INDEX idx_memory_active ON memory_commits(is_active);
  
  COMMIT;
`);

console.log('✅ Foreign keys fixed!');
console.log('');
console.log('Memory commits should now work without session/turn/thinking IDs.');
console.log('');

db.close();
