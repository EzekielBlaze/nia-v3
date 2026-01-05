/**
 * Quick database check - what tables exist NOW?
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nia.db');
const db = sqlite3(dbPath);

console.log('\n=== CURRENT DATABASE STATE ===\n');

// Get all tables
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();

console.log(`Total tables: ${tables.length}\n`);

// Check for critical tables
const critical = {
  'beliefs': false,
  'thinking_log': false,  // Note: SINGULAR
  'identity_core': false,
  'cognitive_state': false,
  'extraction_queue': false
};

tables.forEach(t => {
  const name = t.name;
  if (critical.hasOwnProperty(name)) {
    critical[name] = true;
  }
  console.log(`  - ${name}`);
});

console.log('\n=== CRITICAL TABLES CHECK ===\n');

for (const [name, exists] of Object.entries(critical)) {
  if (exists) {
    console.log(`  ✓ ${name}`);
  } else {
    console.log(`  ✗ ${name} MISSING`);
  }
}

// Check beliefs table structure
if (critical['beliefs']) {
  console.log('\n=== BELIEFS TABLE COLUMNS ===\n');
  const beliefsInfo = db.prepare("PRAGMA table_info(beliefs)").all();
  
  const required = ['decay_rate', 'last_reinforced', 'updated_at', 'created_at'];
  const existing = beliefsInfo.map(c => c.name);
  
  required.forEach(col => {
    if (existing.includes(col)) {
      console.log(`  ✓ ${col}`);
    } else {
      console.log(`  ✗ ${col} MISSING`);
    }
  });
}

// Check if there are any conversations
if (critical['thinking_log']) {
  const count = db.prepare('SELECT COUNT(*) as count FROM thinking_log').get();
  console.log(`\n=== CONVERSATION DATA ===`);
  console.log(`  Total conversations: ${count.count}`);
  
  if (count.count > 0) {
    const recent = db.prepare('SELECT id, created_at, user_message FROM thinking_log ORDER BY created_at DESC LIMIT 3').all();
    console.log('\n  Recent conversations:');
    recent.forEach(r => {
      const msg = r.user_message.substring(0, 50) + (r.user_message.length > 50 ? '...' : '');
      console.log(`    [${r.id}] ${msg}`);
    });
  }
}

db.close();

console.log('\n');
