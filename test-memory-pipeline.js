/**
 * NIA MEMORY PIPELINE TEST
 * 
 * Tests each step of the memory system to find where the clog is.
 * Run: node test-memory-pipeline.js
 */

const path = require('path');
const Database = require('better-sqlite3');

// Configuration - adjust this path to match your setup
const DB_PATH = path.join(__dirname, 'data', 'nia.db');

console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║         NIA MEMORY PIPELINE TEST                       ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result === true || result === undefined) {
      console.log(`✅ ${name}`);
      passed++;
      return true;
    } else {
      console.log(`❌ ${name}: ${result}`);
      failed++;
      return false;
    }
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    failed++;
    return false;
  }
}

async function testAsync(name, fn) {
  try {
    const result = await fn();
    if (result === true || result === undefined) {
      console.log(`✅ ${name}`);
      passed++;
      return true;
    } else {
      console.log(`❌ ${name}: ${result}`);
      failed++;
      return false;
    }
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    failed++;
    return false;
  }
}

async function runTests() {
  
  // ═══════════════════════════════════════════════════════════════
  // PHASE 1: DATABASE FOUNDATION
  // ═══════════════════════════════════════════════════════════════
  console.log('─── PHASE 1: DATABASE FOUNDATION ───\n');
  
  let db;
  
  // Test 1.1: Database exists and opens
  const dbExists = test('Database file exists', () => {
    const fs = require('fs');
    if (!fs.existsSync(DB_PATH)) {
      return `Not found at ${DB_PATH}`;
    }
    return true;
  });
  
  if (!dbExists) {
    console.log('\n⛔ Cannot continue without database. Run: node init-memory-db.js\n');
    return;
  }
  
  // Test 1.2: Database opens
  test('Database opens successfully', () => {
    db = new Database(DB_PATH);
    return true;
  });
  
  // Test 1.3: memory_commits table exists
  const tableExists = test('memory_commits table exists', () => {
    const tables = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='memory_commits'
    `).get();
    if (!tables) return 'Table not found - run: node init-memory-db.js';
    return true;
  });
  
  if (!tableExists) {
    console.log('\n⛔ Cannot continue without memory_commits table.\n');
    db.close();
    return;
  }
  
  // Test 1.4: Check table schema
  test('memory_commits has correct columns', () => {
    const columns = db.prepare('PRAGMA table_info(memory_commits)').all();
    const required = ['id', 'memory_statement', 'memory_type', 'committed_at', 'vector_id', 'is_active'];
    const existing = columns.map(c => c.name);
    const missing = required.filter(r => !existing.includes(r));
    if (missing.length > 0) return `Missing columns: ${missing.join(', ')}`;
    return true;
  });
  
  // Test 1.5: FTS table exists
  test('memory_fts (full-text search) exists', () => {
    const fts = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='memory_fts'
    `).get();
    if (!fts) return 'FTS table not found (optional but recommended)';
    return true;
  });
  
  // ═══════════════════════════════════════════════════════════════
  // PHASE 2: DIRECT DATABASE WRITE
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── PHASE 2: DIRECT DATABASE WRITE ───\n');
  
  const testMemoryId = `test_${Date.now()}`;
  let insertedId;
  
  // Test 2.1: Insert a test memory directly
  test('Direct INSERT into memory_commits', () => {
    const now = Date.now();
    const result = db.prepare(`
      INSERT INTO memory_commits (
        memory_statement, memory_type, committed_at, temporal_bucket,
        commit_trigger, vector_id, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(
      'TEST: This is a direct database test memory',
      'observation',
      now,
      new Date(now).toISOString().split('T')[0],
      'manual_button',
      testMemoryId
    );
    insertedId = result.lastInsertRowid;
    if (!insertedId) return 'No lastInsertRowid returned';
    return true;
  });
  
  // Test 2.2: Verify memory exists
  test('Verify inserted memory exists', () => {
    const memory = db.prepare('SELECT * FROM memory_commits WHERE id = ?').get(insertedId);
    if (!memory) return 'Memory not found after insert';
    if (memory.memory_statement !== 'TEST: This is a direct database test memory') {
      return 'Memory content mismatch';
    }
    return true;
  });
  
  // Test 2.3: Clean up test memory
  test('Delete test memory', () => {
    db.prepare('DELETE FROM memory_commits WHERE id = ?').run(insertedId);
    const check = db.prepare('SELECT * FROM memory_commits WHERE id = ?').get(insertedId);
    if (check) return 'Memory still exists after delete';
    return true;
  });
  
  // ═══════════════════════════════════════════════════════════════
  // PHASE 3: MODULE LOADING
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── PHASE 3: MODULE LOADING ───\n');
  
  let MemoryStore, TimeFormatter;
  
  // Test 3.1: TimeFormatter loads
  test('TimeFormatter module loads', () => {
    try {
      TimeFormatter = require('./core/memory/temporal/time-formatter');
      return true;
    } catch (err) {
      return `Failed: ${err.message}`;
    }
  });
  
  // Test 3.2: MemoryStore loads
  const storeLoads = test('MemoryStore module loads', () => {
    try {
      MemoryStore = require('./core/memory/recall/memory-store');
      return true;
    } catch (err) {
      return `Failed: ${err.message}`;
    }
  });
  
  if (!storeLoads) {
    console.log('\n⛔ Cannot continue without MemoryStore module.\n');
    db.close();
    return;
  }
  
  // ═══════════════════════════════════════════════════════════════
  // PHASE 4: MEMORYSTORE CLASS
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── PHASE 4: MEMORYSTORE CLASS ───\n');
  
  let memoryStore;
  
  // Test 4.1: MemoryStore instantiates
  test('MemoryStore instantiates', () => {
    memoryStore = new MemoryStore(DB_PATH, null); // null = no embedder
    if (!memoryStore) return 'Failed to create instance';
    return true;
  });
  
  // Test 4.2: MemoryStore.store() works
  let storedMemory;
  await testAsync('MemoryStore.store() writes memory', async () => {
    storedMemory = await memoryStore.store('TEST: MemoryStore class test memory', {
      type: 'observation',
      trigger: 'manual_button',
      topics: ['test'],
      subjects: ['pipeline']
    });
    if (!storedMemory) return 'store() returned null';
    if (!storedMemory.id) return 'No ID returned';
    return true;
  });
  
  // Test 4.3: Verify stored memory
  test('Verify MemoryStore write in DB', () => {
    if (!storedMemory) return 'No stored memory to verify';
    const memory = db.prepare('SELECT * FROM memory_commits WHERE id = ?').get(storedMemory.id);
    if (!memory) return 'Memory not found in DB';
    if (!memory.memory_statement.includes('MemoryStore class test')) {
      return 'Content mismatch';
    }
    return true;
  });
  
  // Test 4.4: Clean up
  test('Clean up MemoryStore test', () => {
    if (storedMemory && storedMemory.id) {
      db.prepare('DELETE FROM memory_commits WHERE id = ?').run(storedMemory.id);
    }
    return true;
  });
  
  // ═══════════════════════════════════════════════════════════════
  // PHASE 5: COMMIT PARSER (Detection)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── PHASE 5: COMMIT PARSER ───\n');
  
  let CommitParser;
  
  test('CommitParser module loads', () => {
    try {
      CommitParser = require('./core/memory/parsers/commit-parser');
      return true;
    } catch (err) {
      return `Failed: ${err.message}`;
    }
  });
  
  test('CommitParser detects "remember that..."', () => {
    const parser = new CommitParser();
    const result = parser.detect('Hey, remember that I like pizza');
    if (!result.isCommit) return 'Did not detect commit';
    return true;
  });
  
  test('CommitParser extracts statement', () => {
    const parser = new CommitParser();
    const result = parser.extract('Remember that my favorite color is blue');
    if (!result.statement) return 'No statement extracted';
    if (!result.statement.toLowerCase().includes('favorite color')) {
      return `Wrong extraction: "${result.statement}"`;
    }
    return true;
  });
  
  test('CommitParser ignores non-commit messages', () => {
    const parser = new CommitParser();
    const result = parser.detect('What is the weather like?');
    if (result.isCommit) return 'False positive on normal message';
    return true;
  });
  
  // ═══════════════════════════════════════════════════════════════
  // PHASE 6: FULL INTEGRATION (ChatHandler → MemoryStore)
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── PHASE 6: FULL INTEGRATION ───\n');
  
  let ChatHandlerIntegrator, MemoryIntegrator;
  
  test('ChatHandlerIntegrator loads', () => {
    try {
      ChatHandlerIntegrator = require('./core/memory/daemon/chat-handler');
      return true;
    } catch (err) {
      return `Failed: ${err.message}`;
    }
  });
  
  test('MemoryIntegrator loads', () => {
    try {
      MemoryIntegrator = require('./core/memory/daemon/memory-integrator');
      return true;
    } catch (err) {
      return `Failed: ${err.message}`;
    }
  });
  
  // ═══════════════════════════════════════════════════════════════
  // PHASE 7: END-TO-END TEST
  // ═══════════════════════════════════════════════════════════════
  console.log('\n─── PHASE 7: END-TO-END TEST ───\n');
  
  // Simulate what daemon does
  const countBefore = db.prepare('SELECT COUNT(*) as count FROM memory_commits').get().count;
  
  await testAsync('Full pipeline: "remember that I love whales"', async () => {
    const parser = new CommitParser();
    const message = 'Hey Nia, remember that I love whales';
    
    // Step 1: Detect commit intent
    const detection = parser.detect(message);
    if (!detection.isCommit) return 'Step 1 failed: Not detected as commit';
    
    // Step 2: Extract statement
    const extraction = parser.extract(message);
    if (!extraction.statement) return 'Step 2 failed: No statement extracted';
    
    // Step 3: Clean statement
    const cleaned = parser.clean(extraction.statement);
    
    // Step 4: Store via MemoryStore
    const store = new MemoryStore(DB_PATH, null);
    const memory = await store.store(cleaned, {
      type: 'preference',
      trigger: extraction.trigger,
      topics: ['whales', 'preferences'],
      subjects: ['user']
    });
    
    if (!memory || !memory.id) return 'Step 4 failed: Store returned no ID';
    
    // Step 5: Verify in DB
    const verify = db.prepare('SELECT * FROM memory_commits WHERE id = ?').get(memory.id);
    if (!verify) return 'Step 5 failed: Not found in DB';
    
    console.log(`   └─ Created memory #${memory.id}: "${cleaned}"`);
    
    return true;
  });
  
  const countAfter = db.prepare('SELECT COUNT(*) as count FROM memory_commits').get().count;
  
  test('Memory count increased', () => {
    if (countAfter <= countBefore) {
      return `Count unchanged: ${countBefore} → ${countAfter}`;
    }
    return true;
  });
  
  // ═══════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('                     TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log('');
  
  // Show current memories
  const memories = db.prepare(`
    SELECT id, memory_statement, memory_type, committed_at 
    FROM memory_commits 
    ORDER BY id DESC 
    LIMIT 5
  `).all();
  
  if (memories.length > 0) {
    console.log('  📝 Recent memories in database:');
    memories.forEach(m => {
      const time = new Date(m.committed_at).toLocaleTimeString();
      console.log(`     #${m.id} [${m.memory_type}] "${m.memory_statement.substring(0, 40)}..." (${time})`);
    });
  } else {
    console.log('  📝 No memories in database yet');
  }
  
  console.log('');
  
  if (failed === 0) {
    console.log('  🎉 ALL TESTS PASSED - Memory pipeline is working!\n');
  } else {
    console.log('  ⚠️  Some tests failed - check output above for details\n');
  }
  
  db.close();
}

// Run tests
runTests().catch(err => {
  console.error('\n💥 Test runner crashed:', err.message);
  console.error(err.stack);
});
