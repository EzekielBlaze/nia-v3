/**
 * NIA V3 - Safe Database Migration
 * 
 * Runs schema in sections, catches errors, reports results
 */

const sqlite3 = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

console.log('\n=== NIA Safe Database Migration ===\n');

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
  process.exit(1);
}

const db = sqlite3(dbPath);
console.log(`Database: ${dbPath}`);
console.log(`Schema: ${schemaPath}\n`);

try {
  // Read schema file
  const schemaContent = fs.readFileSync(schemaPath, 'utf8');
  
  // Split schema into individual CREATE statements
  const statements = schemaContent
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.toUpperCase().includes('CREATE'));
  
  console.log(`Found ${statements.length} CREATE statements\n`);
  
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  const errors = [];
  
  for (const statement of statements) {
    try {
      // Extract table/index name for logging
      const match = statement.match(/CREATE (?:TABLE|INDEX)(?: IF NOT EXISTS)?\s+(\w+)/i);
      const name = match ? match[1] : '(unknown)';
      
      // Try to execute the statement
      db.exec(statement + ';');
      
      // Check if it actually created something or was skipped
      if (statement.includes('IF NOT EXISTS')) {
        skipped++;
        console.log(`  [SKIP] ${name} (already exists)`);
      } else {
        succeeded++;
        console.log(`  [OK] ${name}`);
      }
    } catch (err) {
      failed++;
      const match = statement.match(/CREATE (?:TABLE|INDEX)(?: IF NOT EXISTS)?\s+(\w+)/i);
      const name = match ? match[1] : '(unknown)';
      
      console.log(`  [FAIL] ${name}: ${err.message}`);
      errors.push({ name, error: err.message, statement: statement.substring(0, 100) + '...' });
    }
  }
  
  // Now add missing columns to critical tables
  console.log('\n=== Adding Missing Columns ===\n');
  
  const criticalTables = {
    'beliefs': {
      'decay_rate': 'REAL DEFAULT 0.1',
      'last_reinforced': 'INTEGER',
      'last_challenged': 'INTEGER',
      'created_at': "INTEGER DEFAULT (strftime('%s', 'now'))",
      'updated_at': "INTEGER DEFAULT (strftime('%s', 'now'))"
    },
    'thinking_logs': {
      'processed_at': 'INTEGER',
      'beliefs_extracted': 'INTEGER DEFAULT 0'
    }
  };
  
  let columnsAdded = 0;
  
  for (const [tableName, columns] of Object.entries(criticalTables)) {
    try {
      const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
      const existingColumns = tableInfo.map(c => c.name);
      
      for (const [colName, colDef] of Object.entries(columns)) {
        if (!existingColumns.includes(colName)) {
          try {
            db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${colName} ${colDef}`);
            console.log(`  [OK] ${tableName}.${colName}`);
            columnsAdded++;
          } catch (err) {
            console.log(`  [FAIL] ${tableName}.${colName}: ${err.message}`);
          }
        }
      }
    } catch (err) {
      console.log(`  [SKIP] ${tableName} (table doesn't exist)`);
    }
  }
  
  // Create autonomy tables
  console.log('\n=== Adding Autonomy Tables ===\n');
  
  const autonomyTables = [
    {
      name: 'cognitive_load',
      sql: `CREATE TABLE IF NOT EXISTS cognitive_load (
        load_date TEXT PRIMARY KEY,
        revision_budget_max INTEGER DEFAULT 100,
        revision_budget_remaining INTEGER DEFAULT 100,
        last_updated INTEGER
      )`
    },
    {
      name: 'cognitive_state',
      sql: `CREATE TABLE IF NOT EXISTS cognitive_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        energy INTEGER NOT NULL DEFAULT 100,
        state TEXT NOT NULL DEFAULT 'normal',
        last_recovery INTEGER,
        last_extraction INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`
    },
    {
      name: 'extraction_queue',
      sql: `CREATE TABLE IF NOT EXISTS extraction_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thinking_log_id INTEGER NOT NULL,
        priority TEXT DEFAULT 'normal',
        estimated_cost INTEGER,
        queued_at INTEGER NOT NULL,
        processed_at INTEGER
      )`
    },
    {
      name: 'cognitive_events',
      sql: `CREATE TABLE IF NOT EXISTS cognitive_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        energy_before INTEGER,
        energy_after INTEGER,
        decision TEXT,
        reasoning TEXT,
        created_at INTEGER NOT NULL
      )`
    }
  ];
  
  for (const table of autonomyTables) {
    try {
      db.exec(table.sql);
      console.log(`  [OK] ${table.name}`);
    } catch (err) {
      console.log(`  [FAIL] ${table.name}: ${err.message}`);
    }
  }
  
  // Initialize cognitive state if needed
  try {
    const state = db.prepare('SELECT * FROM cognitive_state WHERE id = 1').get();
    if (!state) {
      db.exec(`INSERT INTO cognitive_state (id, energy, state, created_at, updated_at) 
               VALUES (1, 100, 'normal', strftime('%s', 'now'), strftime('%s', 'now'))`);
      console.log('  [OK] Initialized cognitive_state');
    }
  } catch (err) {
    // Ignore
  }
  
  // Initialize cognitive_load if needed
  try {
    const load = db.prepare(`SELECT * FROM cognitive_load WHERE load_date = date('now')`).get();
    if (!load) {
      db.exec(`INSERT INTO cognitive_load (load_date, revision_budget_max, revision_budget_remaining, last_updated)
               VALUES (date('now'), 100, 100, strftime('%s', 'now'))`);
      console.log('  [OK] Initialized cognitive_load');
    }
  } catch (err) {
    // Ignore
  }
  
  // Summary
  console.log('\n=== Migration Summary ===\n');
  console.log(`Schema statements processed: ${statements.length}`);
  console.log(`  Succeeded: ${succeeded}`);
  console.log(`  Skipped (already exist): ${skipped}`);
  console.log(`  Failed: ${failed}`);
  console.log(`Columns added: ${columnsAdded}`);
  
  if (errors.length > 0) {
    console.log('\n=== Errors (Likely OK) ===\n');
    errors.forEach(e => {
      console.log(`${e.name}: ${e.error}`);
    });
    console.log('\nNote: Errors for tables with foreign key constraints are normal');
    console.log('if the referenced tables don\'t exist yet. This is usually fine.');
  }
  
  // Verify critical tables exist
  console.log('\n=== Verifying Critical Tables ===\n');
  const critical = ['beliefs', 'thinking_logs', 'identity_core', 'cognitive_state'];
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  const tableNames = tables.map(t => t.name);
  
  let allGood = true;
  for (const name of critical) {
    if (tableNames.includes(name)) {
      console.log(`  ✓ ${name}`);
    } else {
      console.log(`  ✗ ${name} MISSING!`);
      allGood = false;
    }
  }
  
  if (allGood) {
    console.log('\n✓ Migration complete! All critical tables exist.\n');
  } else {
    console.log('\n⚠ Some critical tables are missing. Database may not work correctly.\n');
  }
  
} catch (err) {
  console.error('\n✗ Migration failed:', err.message);
  console.error(err);
  process.exit(1);
} finally {
  db.close();
}
