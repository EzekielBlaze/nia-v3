/**
 * NIA SYSTEM DIAGNOSTIC
 * 
 * Checks ALL dependencies and shows exactly what's working/broken.
 * Run: node diagnose-nia.js
 */

const path = require('path');
const fs = require('fs');

console.log('\n');
console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║              NIA CHROMAFLUX SYSTEM DIAGNOSTIC                  ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log('');

const results = {
  database: { status: 'unknown', details: {} },
  qdrant: { status: 'unknown', details: {} },
  embedder: { status: 'unknown', details: {} },
  daemon: { status: 'unknown', details: {} }
};

async function checkDatabase() {
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  1. DATABASE (SQLite)                                           │');
  console.log('└─────────────────────────────────────────────────────────────────┘');
  
  const dbPath = path.join(__dirname, 'data', 'nia.db');
  
  // Check if DB exists
  if (!fs.existsSync(dbPath)) {
    console.log('   ✗ Database file not found at:', dbPath);
    console.log('   → Run: node init-memory-db.js');
    results.database.status = 'missing';
    return;
  }
  
  console.log('   ✓ Database file exists');
  
  try {
    const Database = require('better-sqlite3');
    const db = new Database(dbPath);
    
    // Check tables
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableNames = tables.map(t => t.name);
    
    console.log('   Tables found:', tableNames.length);
    
    const requiredTables = ['memory_commits', 'conversation_sessions', 'belief_extraction_audit'];
    const missingTables = [];
    
    for (const table of requiredTables) {
      if (tableNames.includes(table)) {
        const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get().count;
        console.log(`   ✓ ${table}: ${count} rows`);
      } else {
        console.log(`   ✗ ${table}: MISSING`);
        missingTables.push(table);
      }
    }
    
    // Check FTS5
    if (tableNames.includes('memory_fts')) {
      console.log('   ✓ memory_fts: FTS5 virtual table exists');
    } else {
      console.log('   ✗ memory_fts: FTS5 virtual table MISSING');
      missingTables.push('memory_fts');
    }
    
    // Check schema for memory_commits
    if (tableNames.includes('memory_commits')) {
      const columns = db.prepare("PRAGMA table_info(memory_commits)").all();
      const columnNames = columns.map(c => c.name);
      
      const requiredColumns = ['id', 'memory_statement', 'memory_type', 'vector_id', 'strength', 'is_active'];
      const missingCols = requiredColumns.filter(c => !columnNames.includes(c));
      
      if (missingCols.length > 0) {
        console.log('   ✗ Missing columns in memory_commits:', missingCols.join(', '));
      } else {
        console.log('   ✓ memory_commits schema looks good');
      }
    }
    
    db.close();
    
    results.database.status = missingTables.length === 0 ? 'ok' : 'incomplete';
    results.database.details = { missingTables };
    
    if (missingTables.length > 0) {
      console.log('');
      console.log('   → Fix: Run "node init-memory-db.js" to create missing tables');
    }
    
  } catch (err) {
    console.log('   ✗ Error reading database:', err.message);
    results.database.status = 'error';
    results.database.details.error = err.message;
  }
  
  console.log('');
}

async function checkQdrant() {
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  2. QDRANT (Vector Database)                                    │');
  console.log('└─────────────────────────────────────────────────────────────────┘');
  
  const qdrantUrl = 'http://localhost:6333';
  
  try {
    const response = await fetch(qdrantUrl, { 
      signal: AbortSignal.timeout(3000) 
    });
    
    if (response.ok) {
      console.log('   ✓ Qdrant is running on port 6333');
      
      // Check collections
      const collectionsRes = await fetch(`${qdrantUrl}/collections`);
      const collectionsData = await collectionsRes.json();
      
      const collections = collectionsData.result?.collections || [];
      console.log('   Collections:', collections.length);
      
      const neededCollections = ['memories', 'beliefs'];
      
      for (const name of neededCollections) {
        const exists = collections.some(c => c.name === name);
        if (exists) {
          // Get collection info
          const infoRes = await fetch(`${qdrantUrl}/collections/${name}`);
          const infoData = await infoRes.json();
          const pointCount = infoData.result?.points_count || 0;
          console.log(`   ✓ ${name}: ${pointCount} vectors`);
        } else {
          console.log(`   ○ ${name}: not created yet (will be created on first use)`);
        }
      }
      
      results.qdrant.status = 'ok';
      results.qdrant.details = { collections };
      
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
    
  } catch (err) {
    if (err.name === 'AbortError' || err.message.includes('fetch')) {
      console.log('   ✗ Qdrant is NOT running');
      console.log('');
      console.log('   Qdrant is REQUIRED for semantic memory (associative thinking).');
      console.log('   Without it, NIA can only do keyword search.');
      console.log('');
      console.log('   To install Qdrant:');
      console.log('');
      console.log('   Option A - Docker (easiest):');
      console.log('     docker run -d -p 6333:6333 -p 6334:6334 \\');
      console.log('       -v qdrant_storage:/qdrant/storage \\');
      console.log('       qdrant/qdrant');
      console.log('');
      console.log('   Option B - Download binary:');
      console.log('     1. Go to: https://github.com/qdrant/qdrant/releases');
      console.log('     2. Download qdrant-x86_64-pc-windows-msvc.zip');
      console.log('     3. Extract and run: qdrant.exe');
      console.log('');
    } else {
      console.log('   ✗ Qdrant error:', err.message);
    }
    
    results.qdrant.status = 'offline';
  }
  
  console.log('');
}

async function checkEmbedder() {
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  3. PYTHON EMBEDDER SERVICE                                     │');
  console.log('└─────────────────────────────────────────────────────────────────┘');
  
  const embedderUrl = 'http://localhost:5001';
  
  try {
    const response = await fetch(`${embedderUrl}/health`, { 
      signal: AbortSignal.timeout(3000) 
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('   ✓ Embedder service is running');
      console.log('   Model:', data.model || 'all-MiniLM-L6-v2');
      console.log('   Dimensions:', data.dimensions || 384);
      console.log('   Privacy: 100% local (nothing leaves your machine)');
      
      results.embedder.status = 'ok';
      results.embedder.details = data;
      
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
    
  } catch (err) {
    console.log('   ✗ Embedder service is NOT running');
    console.log('');
    console.log('   The embedder creates vector representations of memories.');
    console.log('   Without it, semantic search is disabled.');
    console.log('');
    console.log('   To start:');
    console.log('     1. Install requirements:');
    console.log('        pip install flask sentence-transformers');
    console.log('');
    console.log('     2. Run the service:');
    console.log('        python memory-embedder-service.py');
    console.log('');
    console.log('   First run downloads ~80MB model (cached after that).');
    console.log('');
    
    results.embedder.status = 'offline';
  }
  
  console.log('');
}

async function checkDaemon() {
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│  4. NIA DAEMON                                                  │');
  console.log('└─────────────────────────────────────────────────────────────────┘');
  
  // Try IPC connection
  try {
    const IPCClient = require('./ipc-client');
    const client = new IPCClient();
    
    await client.connect();
    const status = await client.request('status', {});
    client.disconnect();
    
    console.log('   ✓ Daemon is running');
    console.log('   Uptime:', status.uptime || 'unknown');
    console.log('   Memory system:', status.memorySystemAvailable ? 'enabled' : 'disabled');
    
    results.daemon.status = 'ok';
    results.daemon.details = status;
    
  } catch (err) {
    console.log('   ✗ Daemon is NOT running');
    console.log('');
    console.log('   To start:');
    console.log('     node daemon.js');
    console.log('');
    
    results.daemon.status = 'offline';
  }
  
  console.log('');
}

function printSummary() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                         SUMMARY                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  const statusIcon = (s) => {
    switch(s) {
      case 'ok': return '✓';
      case 'offline': return '✗';
      case 'incomplete': return '△';
      case 'missing': return '✗';
      default: return '?';
    }
  };
  
  console.log(`   ${statusIcon(results.database.status)} Database:   ${results.database.status}`);
  console.log(`   ${statusIcon(results.qdrant.status)} Qdrant:     ${results.qdrant.status}`);
  console.log(`   ${statusIcon(results.embedder.status)} Embedder:   ${results.embedder.status}`);
  console.log(`   ${statusIcon(results.daemon.status)} Daemon:     ${results.daemon.status}`);
  console.log('');
  
  // Overall status
  const allOk = Object.values(results).every(r => r.status === 'ok');
  
  if (allOk) {
    console.log('   🎉 ALL SYSTEMS GO! NIA is fully operational.');
    console.log('');
    console.log('   Semantic memory is ENABLED:');
    console.log('   - "ocean" can find "beach", "waves", "calm"');
    console.log('   - Memories connect by meaning, not just keywords');
    console.log('   - Associative thinking is possible');
  } else {
    console.log('   ⚠️  Some systems need attention.');
    console.log('');
    
    if (results.qdrant.status !== 'ok') {
      console.log('   IMPORTANT: Without Qdrant, NIA cannot think associatively.');
      console.log('   This is a KEY feature - please set it up!');
    }
  }
  
  console.log('');
}

// Run all checks
async function main() {
  await checkDatabase();
  await checkQdrant();
  await checkEmbedder();
  await checkDaemon();
  printSummary();
}

main().catch(console.error);
