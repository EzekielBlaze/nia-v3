/**
 * Fix conversation_turns FK constraint
 * 
 * Problem: session_id has FK to conversation_sessions, but we use daemon_sessions
 * Solution: Recreate table without that FK constraint
 * 
 * Run: node fix-conversation-fk.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Find database
const dbPaths = [
  path.join(__dirname, 'data', 'nia-identity.db'),
  path.join(__dirname, 'nia-identity.db'),
  path.join(__dirname, 'nia.db')
];

let dbPath = null;
for (const p of dbPaths) {
  if (fs.existsSync(p)) {
    dbPath = p;
    break;
  }
}

if (!dbPath) {
  console.error('Could not find database!');
  process.exit(1);
}

console.log(`Using database: ${dbPath}`);
const db = new Database(dbPath);

try {
  // Check current state
  const existingCount = db.prepare(`SELECT COUNT(*) as c FROM conversation_turns`).get()?.c || 0;
  console.log(`Existing conversation turns: ${existingCount}`);
  
  // Disable FK constraints temporarily
  db.pragma('foreign_keys = OFF');
  
  // Start transaction
  db.exec('BEGIN TRANSACTION');
  
  // Create new table without the problematic FK
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_turns_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER DEFAULT 0,
      turn_number INTEGER NOT NULL,
      role TEXT CHECK(role IN ('user', 'assistant', 'system')) NOT NULL,
      message TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      response_time_ms INTEGER,
      thinking_log_id INTEGER,
      is_memory_anchor BOOLEAN DEFAULT 0,
      is_correction BOOLEAN DEFAULT 0,
      spawned_memories INTEGER DEFAULT 0,
      spawned_beliefs INTEGER DEFAULT 0,
      tokens_in INTEGER,
      tokens_out INTEGER,
      model_used TEXT,
      FOREIGN KEY(thinking_log_id) REFERENCES thinking_log(id) ON DELETE SET NULL
    )
  `);
  
  // Copy existing data
  db.exec(`INSERT OR IGNORE INTO conversation_turns_new SELECT * FROM conversation_turns`);
  
  // Get count in new table
  const newCount = db.prepare(`SELECT COUNT(*) as c FROM conversation_turns_new`).get()?.c || 0;
  console.log(`Copied ${newCount} rows to new table`);
  
  // Drop old table
  db.exec(`DROP TABLE IF EXISTS conversation_turns`);
  
  // Rename
  db.exec(`ALTER TABLE conversation_turns_new RENAME TO conversation_turns`);
  
  // Recreate indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_turn_session ON conversation_turns(session_id, turn_number)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_turn_timestamp ON conversation_turns(timestamp DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_turn_memory_anchor ON conversation_turns(is_memory_anchor) WHERE is_memory_anchor = 1`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_turn_correction ON conversation_turns(is_correction) WHERE is_correction = 1`);
  
  // Commit
  db.exec('COMMIT');
  
  // Re-enable FK constraints
  db.pragma('foreign_keys = ON');
  
  console.log('✓ conversation_turns table fixed!');
  console.log('✓ FK constraint to conversation_sessions removed');
  console.log('');
  console.log('Conversation turns will now be logged properly.');
  
  // Test insert
  try {
    const testResult = db.prepare(`
      INSERT INTO conversation_turns (session_id, turn_number, role, message, timestamp)
      VALUES (0, 9999, 'system', 'FK fix test', ?)
    `).run(Date.now());
    
    // Clean up test
    db.prepare(`DELETE FROM conversation_turns WHERE turn_number = 9999`).run();
    console.log('✓ Test insert successful!');
  } catch (testErr) {
    console.error('✗ Test insert failed:', testErr.message);
  }
  
} catch (err) {
  console.error('Migration failed:', err.message);
  try { db.exec('ROLLBACK'); } catch (e) {}
} finally {
  db.close();
}
