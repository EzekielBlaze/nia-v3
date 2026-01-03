/**
 * NIA V3 - Complete Database Setup
 * 
 * Uses identity-schema-v3.sql to ensure database is fully initialized
 * Adds missing columns to existing tables
 */

const sqlite3 = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

console.log('\n=== NIA Complete Database Setup ===\n');

const dbPath = path.join(__dirname, 'data', 'nia.db');

// Try multiple possible locations for schema
const schemaPaths = [
  path.join(__dirname, 'identity-schema-v3.sql'),
  path.join(__dirname, 'core', 'identity', 'identity-schema-v3.sql'),
  path.join(__dirname, 'core', 'identity-schema-v3.sql')
];

let schemaPath = null;
for (const tryPath of schemaPaths) {
  if (fs.existsSync(tryPath)) {
    schemaPath = tryPath;
    break;
  }
}

if (!schemaPath) {
  console.error('ERROR: identity-schema-v3.sql not found!');
  console.error('Looked in:');
  schemaPaths.forEach(p => console.error(`  - ${p}`));
  console.error('\nPlease ensure identity-schema-v3.sql exists in one of these locations.');
  process.exit(1);
}

const db = sqlite3(dbPath);
console.log(`Database: ${dbPath}`);
console.log(`Schema: ${schemaPath}`);

try {
  // Read schema file
  const schema = fs.readFileSync(schemaPath, 'utf8');
  
  console.log('\n[1/3] Running full schema (creates missing tables)...');
  
  // Execute schema (CREATE TABLE IF NOT EXISTS will skip existing tables)
  db.exec(schema);
  
  console.log('✓ Schema executed');
  
  // Now manually add missing columns to existing tables
  console.log('\n[2/3] Adding missing columns to existing tables...');
  
  // Beliefs table - add missing columns
  const beliefsInfo = db.prepare("PRAGMA table_info(beliefs)").all();
  const beliefsColumns = beliefsInfo.map(c => c.name);
  
  const beliefsMissingColumns = {
    'decay_rate': 'REAL DEFAULT 0.1',
    'last_reinforced': 'INTEGER',
    'last_challenged': 'INTEGER',
    'created_at': "INTEGER DEFAULT (strftime('%s', 'now'))",
    'updated_at': "INTEGER DEFAULT (strftime('%s', 'now'))",
    'superseded_by_belief_id': 'INTEGER',
    'revision_reasoning': 'TEXT'
  };
  
  let added = 0;
  for (const [col, def] of Object.entries(beliefsMissingColumns)) {
    if (!beliefsColumns.includes(col)) {
      console.log(`  Adding beliefs.${col}...`);
      db.exec(`ALTER TABLE beliefs ADD COLUMN ${col} ${def}`);
      added++;
    }
  }
  
  if (added > 0) {
    console.log(`✓ Added ${added} missing column(s) to beliefs`);
  } else {
    console.log('✓ beliefs table is complete');
  }
  
  // Add cognitive_load if it doesn't exist (for backward compatibility)
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const tableNames = tables.map(t => t.name);
  
  if (!tableNames.includes('cognitive_load')) {
    console.log('\n  Creating cognitive_load table (legacy)...');
    db.exec(`
      CREATE TABLE cognitive_load (
        load_date TEXT PRIMARY KEY,
        revision_budget_max INTEGER DEFAULT 100,
        revision_budget_remaining INTEGER DEFAULT 100,
        last_updated INTEGER
      );
      
      INSERT INTO cognitive_load (load_date, revision_budget_max, revision_budget_remaining, last_updated)
      VALUES (date('now'), 100, 100, strftime('%s', 'now'));
    `);
    console.log('✓ cognitive_load created');
  }
  
  // Add autonomy tables
  if (!tableNames.includes('cognitive_state')) {
    console.log('\n  Creating cognitive_state table...');
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
      
      INSERT INTO cognitive_state (id, energy, state, created_at, updated_at)
      VALUES (1, 100, 'normal', strftime('%s', 'now'), strftime('%s', 'now'));
    `);
    console.log('✓ cognitive_state created');
  }
  
  if (!tableNames.includes('extraction_queue')) {
    console.log('\n  Creating extraction_queue table...');
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
  }
  
  if (!tableNames.includes('cognitive_events')) {
    console.log('\n  Creating cognitive_events table...');
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
  }
  
  console.log('\n[3/3] Verifying database...');
  
  const finalTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  console.log(`\nTotal tables: ${finalTables.length}`);
  
  // Check critical tables
  const critical = ['beliefs', 'identity_core', 'formative_events', 'thinking_logs', 'cognitive_state'];
  const missing = critical.filter(name => !finalTables.some(t => t.name === name));
  
  if (missing.length > 0) {
    console.log('\n⚠ WARNING: Missing critical tables:', missing.join(', '));
  } else {
    console.log('\n✓ All critical tables exist');
  }
  
  // Verify beliefs has all columns
  const finalBeliefsInfo = db.prepare("PRAGMA table_info(beliefs)").all();
  const requiredColumns = ['decay_rate', 'last_reinforced', 'updated_at', 'created_at'];
  const missingColumns = requiredColumns.filter(col => !finalBeliefsInfo.some(c => c.name === col));
  
  if (missingColumns.length > 0) {
    console.log('\n⚠ WARNING: beliefs table still missing:', missingColumns.join(', '));
  } else {
    console.log('✓ beliefs table has all required columns');
  }
  
  console.log('\n=== Database Setup Complete ===\n');
  console.log('✓ Database is ready!');
  console.log('✓ Restart daemon: sc.exe stop niaservice.exe && sc.exe start niaservice.exe');
  console.log('✓ Start web UI: start-nia-web.bat\n');
  
} catch (err) {
  console.error('\n✗ Setup failed:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  db.close();
}
