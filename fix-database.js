/**
 * NIA DATABASE FIX SCRIPT
 * 
 * Fixes:
 * 1. Resets energy to 100
 * 2. Clears extraction queue
 * 3. Fixes conversation_turns FK issue
 * 4. Shows current state
 * 
 * Run: node fix-database.js
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nia.db');
console.log(`\nDatabase: ${dbPath}\n`);

const db = new Database(dbPath);

// 1. Reset energy
console.log('1. RESETTING ENERGY');
console.log('   ─────────────────────────────────────');
try {
  db.exec(`
    UPDATE cognitive_state 
    SET energy = 100, 
        state = 'normal',
        extractions_today = 0,
        extractions_declined = 0
    WHERE id = 1
  `);
  console.log('   ✅ Energy reset to 100');
} catch (e) {
  console.log(`   ❌ Error: ${e.message}`);
}

// 2. Clear extraction queue
console.log('\n2. CLEARING EXTRACTION QUEUE');
console.log('   ─────────────────────────────────────');
try {
  const before = db.prepare(`SELECT COUNT(*) as c FROM extraction_queue WHERE processed_at IS NULL`).get();
  db.exec(`DELETE FROM extraction_queue WHERE processed_at IS NULL`);
  console.log(`   ✅ Cleared ${before.c} pending items`);
} catch (e) {
  console.log(`   ❌ Error: ${e.message}`);
}

// 3. Ensure conversation_sessions table exists and has default session
console.log('\n3. FIXING CONVERSATION SESSIONS');
console.log('   ─────────────────────────────────────');
try {
  // Create table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
      ended_at INTEGER,
      message_count INTEGER DEFAULT 0,
      topics TEXT,
      summary TEXT
    )
  `);
  
  // Create conversation_turns if not exists (without FK constraint)
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_turns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER,
      turn_number INTEGER,
      role TEXT,
      message TEXT,
      timestamp INTEGER,
      thinking_log_id INTEGER
    )
  `);
  
  // Check if any session exists
  const sessions = db.prepare(`SELECT COUNT(*) as c FROM conversation_sessions`).get();
  
  if (sessions.c === 0) {
    db.exec(`INSERT INTO conversation_sessions (id, started_at) VALUES (1, ${Date.now()})`);
    console.log('   ✅ Created default session (id=1)');
  } else {
    console.log(`   ✅ ${sessions.c} sessions exist`);
  }
  
  // Get current session
  const current = db.prepare(`SELECT MAX(id) as id FROM conversation_sessions`).get();
  console.log(`   Current session: ${current.id}`);
  
} catch (e) {
  console.log(`   ❌ Error: ${e.message}`);
}

// 4. Show current state
console.log('\n4. CURRENT STATE');
console.log('   ─────────────────────────────────────');

try {
  const cogState = db.prepare(`SELECT * FROM cognitive_state WHERE id = 1`).get();
  console.log(`   Energy: ${cogState.energy}/100`);
  console.log(`   State: ${cogState.state}`);
  console.log(`   Extractions today: ${cogState.extractions_today}`);
} catch (e) {
  console.log(`   ❌ Error: ${e.message}`);
}

try {
  const memCount = db.prepare(`SELECT COUNT(*) as c FROM memory_commits`).get();
  console.log(`   Memories: ${memCount.c}`);
} catch (e) {}

try {
  const beliefCount = db.prepare(`SELECT COUNT(*) as c FROM beliefs`).get();
  console.log(`   Beliefs: ${beliefCount.c}`);
} catch (e) {}

try {
  const thinkingCount = db.prepare(`SELECT COUNT(*) as c FROM thinking_log`).get();
  console.log(`   Thinking logs: ${thinkingCount.c}`);
} catch (e) {}

// 5. List recent memories
console.log('\n5. RECENT MEMORIES');
console.log('   ─────────────────────────────────────');
try {
  const memories = db.prepare(`
    SELECT id, memory_statement, topics, subjects, strength 
    FROM memory_commits 
    ORDER BY committed_at DESC 
    LIMIT 5
  `).all();
  
  if (memories.length === 0) {
    console.log('   (none)');
  } else {
    memories.forEach(m => {
      console.log(`   [${m.id}] "${m.memory_statement}" (strength: ${m.strength})`);
      if (m.subjects) console.log(`       subjects: ${m.subjects}`);
    });
  }
} catch (e) {
  console.log(`   ❌ Error: ${e.message}`);
}

// 6. List recent beliefs
console.log('\n6. RECENT BELIEFS');
console.log('   ─────────────────────────────────────');
try {
  const beliefs = db.prepare(`
    SELECT id, statement, subject, holder, confidence, maturity_level
    FROM beliefs 
    ORDER BY created_at DESC 
    LIMIT 5
  `).all();
  
  if (beliefs.length === 0) {
    console.log('   (none)');
  } else {
    beliefs.forEach(b => {
      console.log(`   [${b.id}] "${b.statement}"`);
      console.log(`       holder: ${b.holder}, subject: ${b.subject}, confidence: ${b.confidence}%, maturity: ${b.maturity_level}`);
    });
  }
} catch (e) {
  console.log(`   ❌ Error: ${e.message}`);
}

db.close();

console.log('\n✅ Database fixes applied!\n');
console.log('Next steps:');
console.log('1. Start embedding services: python memory-embedder-service.py');
console.log('2.                          python belief-embedder-service.py');
console.log('3. Restart NIA daemon');
console.log('');
