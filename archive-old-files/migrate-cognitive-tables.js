/**
 * NIA V3 - Database Migration
 * Adds cognitive autonomy tables to existing database
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');

console.log('\n=== NIA Database Migration - Cognitive Autonomy ===\n');

const dbPath = path.join(__dirname, 'data', 'nia.db');
const db = sqlite3(dbPath);

console.log(`Database: ${dbPath}`);

try {
  // Check if tables already exist
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const tableNames = tables.map(t => t.name);
  
  console.log('\nExisting tables:', tableNames.join(', '));
  
  // Create cognitive_load table (for backward compatibility with old code)
  if (!tableNames.includes('cognitive_load')) {
    console.log('\n[1/4] Creating cognitive_load table (legacy)...');
    db.exec(`
      CREATE TABLE cognitive_load (
        load_date TEXT PRIMARY KEY,
        revision_budget_max INTEGER DEFAULT 100,
        revision_budget_remaining INTEGER DEFAULT 100,
        last_updated INTEGER
      );
      
      -- Insert today's entry
      INSERT INTO cognitive_load (load_date, revision_budget_max, revision_budget_remaining, last_updated)
      VALUES (date('now'), 100, 100, strftime('%s', 'now'));
    `);
    console.log('✓ cognitive_load created');
  } else {
    console.log('\n[1/4] cognitive_load already exists ✓');
  }
  
  // Create cognitive_state table
  if (!tableNames.includes('cognitive_state')) {
    console.log('\n[2/4] Creating cognitive_state table...');
    db.exec(`
      CREATE TABLE cognitive_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        energy INTEGER NOT NULL DEFAULT 100,
        state TEXT NOT NULL DEFAULT 'normal',
        last_recovery INTEGER,
        last_extraction INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      
      -- Insert initial state
      INSERT INTO cognitive_state (id, energy, state, created_at, updated_at)
      VALUES (1, 100, 'normal', strftime('%s', 'now'), strftime('%s', 'now'));
    `);
    console.log('✓ cognitive_state created');
  } else {
    console.log('\n[2/4] cognitive_state already exists ✓');
  }
  
  // Create extraction_queue table
  if (!tableNames.includes('extraction_queue')) {
    console.log('\n[3/4] Creating extraction_queue table...');
    db.exec(`
      CREATE TABLE extraction_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thinking_log_id INTEGER NOT NULL,
        priority TEXT DEFAULT 'normal',
        estimated_cost INTEGER,
        queued_at INTEGER NOT NULL,
        processed_at INTEGER,
        FOREIGN KEY (thinking_log_id) REFERENCES thinking_logs(id)
      );
      
      CREATE INDEX idx_extraction_queue_processed ON extraction_queue(processed_at);
      CREATE INDEX idx_extraction_queue_priority ON extraction_queue(priority, queued_at);
    `);
    console.log('✓ extraction_queue created');
  } else {
    console.log('\n[3/4] extraction_queue already exists ✓');
  }
  
  // Create cognitive_events table
  if (!tableNames.includes('cognitive_events')) {
    console.log('\n[4/4] Creating cognitive_events table...');
    db.exec(`
      CREATE TABLE cognitive_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        energy_before INTEGER,
        energy_after INTEGER,
        decision TEXT,
        reasoning TEXT,
        created_at INTEGER NOT NULL
      );
      
      CREATE INDEX idx_cognitive_events_type ON cognitive_events(event_type);
      CREATE INDEX idx_cognitive_events_time ON cognitive_events(created_at);
    `);
    console.log('✓ cognitive_events created');
  } else {
    console.log('\n[4/4] cognitive_events already exists ✓');
  }
  
  // Verify all tables exist
  const updatedTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const updatedNames = updatedTables.map(t => t.name);
  
  console.log('\n=== Migration Complete ===\n');
  console.log('All tables:', updatedNames.join(', '));
  
  // Check cognitive_state
  const cogState = db.prepare('SELECT * FROM cognitive_state WHERE id = 1').get();
  console.log('\nInitial cognitive state:', cogState);
  
  console.log('\n✓ Database ready for cognitive autonomy!\n');
  
} catch (err) {
  console.error('\n✗ Migration failed:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  db.close();
}
