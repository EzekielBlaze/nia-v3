/**
 * COMPREHENSIVE MEMORY DIAGNOSTIC
 * Tests every part of the memory system
 */

const IPCClient = require('./ipc-client');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

console.log('');
console.log('========================================');
console.log('MEMORY SYSTEM COMPREHENSIVE DIAGNOSTIC');
console.log('========================================');
console.log('');

// Test 1: Check file locations
console.log('[TEST 1] Checking file locations...');
console.log('');

const requiredFiles = [
  'core/memory/daemon/index.js',
  'core/memory/daemon/memory-integrator.js',
  'core/memory/daemon/session-manager.js',
  'core/memory/daemon/belief-integrator.js',
  'core/memory/daemon/correction-integrator.js',
  'core/memory/daemon/chat-handler.js',
  'api/index.js',
  'api/api-commit-memory.js',
  'api/api-recall-memories.js'
];

let missingFiles = [];
for (const file of requiredFiles) {
  if (fs.existsSync(file)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ MISSING: ${file}`);
    missingFiles.push(file);
  }
}

if (missingFiles.length > 0) {
  console.log('');
  console.log('❌ Missing files! Memory system cannot load.');
  console.log('   Run: fix-memory-location.bat');
  process.exit(1);
}

console.log('');
console.log('✅ All required files present!');
console.log('');

// Test 2: Check database schema
console.log('[TEST 2] Checking database schema...');
console.log('');

const dbPath = './data/nia.db';
if (!fs.existsSync(dbPath)) {
  console.log('❌ Database not found!');
  process.exit(1);
}

const db = new Database(dbPath);

// Check for memory_commits table
try {
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='memory_commits'
  `).all();
  
  if (tables.length === 0) {
    console.log('❌ memory_commits table not found!');
    console.log('   Database schema not initialized.');
  } else {
    console.log('✅ memory_commits table exists');
    
    // Check row count
    const count = db.prepare('SELECT COUNT(*) as count FROM memory_commits').get();
    console.log(`   Total memories in database: ${count.count}`);
  }
} catch (err) {
  console.log(`❌ Database error: ${err.message}`);
}

db.close();
console.log('');

// Test 3: IPC Connection
console.log('[TEST 3] Testing IPC connection...');
console.log('');

async function testIPC() {
  const client = new IPCClient();
  
  try {
    await client.connect(5000);
    console.log('✅ Connected to daemon!');
    console.log('');
    
    // Test 4: Check daemon status
    console.log('[TEST 4] Checking daemon status...');
    console.log('');
    
    const status = await client.request('status', {});
    console.log('Daemon status:', JSON.stringify(status, null, 2));
    console.log('');
    
    // Test 5: Test memory_stats handler
    console.log('[TEST 5] Testing memory_stats handler...');
    console.log('');
    
    try {
      const stats = await client.request('memory_stats', {});
      console.log('✅ memory_stats handler works!');
      console.log('Stats:', JSON.stringify(stats, null, 2));
    } catch (err) {
      console.log('❌ memory_stats handler failed!');
      console.log(`   Error: ${err.message}`);
      console.log('   This means API handlers are NOT registered.');
    }
    console.log('');
    
    // Test 6: Test commit_memory handler
    console.log('[TEST 6] Testing commit_memory handler...');
    console.log('');
    
    try {
      const commit = await client.request('commit_memory', {
        content: 'Test memory from diagnostic script',
        context: 'testing',
        importance: 5
      });
      console.log('✅ commit_memory handler works!');
      console.log('Result:', JSON.stringify(commit, null, 2));
    } catch (err) {
      console.log('❌ commit_memory handler failed!');
      console.log(`   Error: ${err.message}`);
    }
    console.log('');
    
    client.disconnect();
    
  } catch (err) {
    console.log('❌ Cannot connect to daemon!');
    console.log(`   Error: ${err.message}`);
    console.log('   Make sure daemon is running.');
    console.log('');
  }
}

testIPC().then(() => {
  console.log('========================================');
  console.log('DIAGNOSTIC COMPLETE');
  console.log('========================================');
  console.log('');
});
