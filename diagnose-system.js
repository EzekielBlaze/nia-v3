/**
 * NIA SYSTEM DIAGNOSTIC
 * 
 * Checks all components of the memory/embedding system
 * Run: node diagnose-system.js
 */

const fetch = require('node-fetch') || globalThis.fetch;

async function diagnose() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║              NIA V3 SYSTEM DIAGNOSTIC                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');
  
  const results = {
    memoryEmbedder: false,
    beliefEmbedder: false,
    qdrant: false,
    lmStudio: false,
    database: false
  };
  
  // 1. Memory Embedder (port 5001)
  console.log('1. MEMORY EMBEDDER SERVICE (port 5001)');
  console.log('   ─────────────────────────────────────');
  try {
    const healthRes = await fetch('http://localhost:5001/health', {
      signal: AbortSignal.timeout(3000)
    });
    
    if (healthRes.ok) {
      const data = await healthRes.json();
      console.log('   ✅ ONLINE');
      console.log(`   Model: ${data.model || 'unknown'}`);
      console.log(`   Dimensions: ${data.dimensions || 'unknown'}`);
      
      // Test actual embedding
      const testRes = await fetch('http://localhost:5001/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'test embedding' }),
        signal: AbortSignal.timeout(5000)
      });
      
      if (testRes.ok) {
        const embedData = await testRes.json();
        console.log(`   Test embed: ✅ Got ${embedData.embedding?.length || 0} dimensions`);
        results.memoryEmbedder = true;
      } else {
        console.log('   Test embed: ❌ Failed');
      }
    } else {
      console.log(`   ❌ OFFLINE (status: ${healthRes.status})`);
    }
  } catch (err) {
    console.log('   ❌ OFFLINE');
    console.log(`   Error: ${err.message}`);
    console.log('   Fix: Run "python memory-embedder-service.py"');
  }
  
  console.log('');
  
  // 2. Belief Embedder (port 5002)
  console.log('2. BELIEF EMBEDDER SERVICE (port 5002)');
  console.log('   ─────────────────────────────────────');
  try {
    const healthRes = await fetch('http://localhost:5002/health', {
      signal: AbortSignal.timeout(3000)
    });
    
    if (healthRes.ok) {
      const data = await healthRes.json();
      console.log('   ✅ ONLINE');
      console.log(`   Model: ${data.model || 'Poincaré'}`);
      console.log(`   Space: ${data.space || 'hyperbolic'}`);
      console.log(`   Dimensions: ${data.dimensions || 'unknown'}`);
      
      // Test actual embedding
      const testRes = await fetch('http://localhost:5002/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'test belief', type: 'value' }),
        signal: AbortSignal.timeout(5000)
      });
      
      if (testRes.ok) {
        const embedData = await testRes.json();
        console.log(`   Test embed: ✅ Got ${embedData.embedding?.length || 0} dimensions`);
        console.log(`   Poincaré norm: ${embedData.poincare_norm?.toFixed(3) || 'N/A'}`);
        results.beliefEmbedder = true;
      } else {
        console.log('   Test embed: ❌ Failed');
      }
    } else {
      console.log(`   ❌ OFFLINE (status: ${healthRes.status})`);
    }
  } catch (err) {
    console.log('   ❌ OFFLINE');
    console.log(`   Error: ${err.message}`);
    console.log('   Fix: Run "python belief-embedder-service.py"');
  }
  
  console.log('');
  
  // 3. Qdrant Vector Database (port 6333)
  console.log('3. QDRANT VECTOR DATABASE (port 6333)');
  console.log('   ─────────────────────────────────────');
  try {
    const healthRes = await fetch('http://localhost:6333/', {
      signal: AbortSignal.timeout(3000)
    });
    
    if (healthRes.ok) {
      console.log('   ✅ ONLINE');
      
      // Check collections
      const collectionsRes = await fetch('http://localhost:6333/collections', {
        signal: AbortSignal.timeout(3000)
      });
      
      if (collectionsRes.ok) {
        const data = await collectionsRes.json();
        const collections = data.result?.collections || [];
        console.log(`   Collections: ${collections.length}`);
        collections.forEach(c => {
          console.log(`     - ${c.name}`);
        });
        results.qdrant = true;
      }
    } else {
      console.log(`   ❌ OFFLINE (status: ${healthRes.status})`);
    }
  } catch (err) {
    console.log('   ❌ OFFLINE');
    console.log(`   Error: ${err.message}`);
    console.log('   Fix: Start Qdrant Docker container');
  }
  
  console.log('');
  
  // 4. LM Studio (port 1234)
  console.log('4. LM STUDIO (port 1234)');
  console.log('   ─────────────────────────────────────');
  try {
    const modelsRes = await fetch('http://localhost:1234/v1/models', {
      signal: AbortSignal.timeout(3000)
    });
    
    if (modelsRes.ok) {
      const data = await modelsRes.json();
      console.log('   ✅ ONLINE');
      const models = data.data || [];
      console.log(`   Models loaded: ${models.length}`);
      models.forEach(m => {
        console.log(`     - ${m.id}`);
      });
      results.lmStudio = true;
    } else {
      console.log(`   ⚠️  Running but no models (status: ${modelsRes.status})`);
    }
  } catch (err) {
    console.log('   ❌ OFFLINE');
    console.log(`   Error: ${err.message}`);
    console.log('   Fix: Start LM Studio and load a model');
  }
  
  console.log('');
  
  // 5. Database Check
  console.log('5. SQLITE DATABASE');
  console.log('   ─────────────────────────────────────');
  try {
    const Database = require('better-sqlite3');
    const path = require('path');
    const dbPath = path.join(process.cwd(), 'data', 'nia.db');
    
    const db = new Database(dbPath, { readonly: true });
    
    // Check tables
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
    `).all();
    
    console.log(`   ✅ Database found: ${dbPath}`);
    console.log(`   Tables: ${tables.length}`);
    
    // Check memory_commits
    const memCount = db.prepare(`SELECT COUNT(*) as c FROM memory_commits`).get();
    console.log(`   memory_commits: ${memCount.c} records`);
    
    // Check beliefs
    const beliefCount = db.prepare(`SELECT COUNT(*) as c FROM beliefs`).get();
    console.log(`   beliefs: ${beliefCount.c} records`);
    
    // Check cognitive state
    const cogState = db.prepare(`SELECT * FROM cognitive_state WHERE id = 1`).get();
    if (cogState) {
      console.log(`   cognitive_state: energy=${cogState.energy}, state=${cogState.state}`);
    }
    
    db.close();
    results.database = true;
    
  } catch (err) {
    console.log('   ❌ Error');
    console.log(`   ${err.message}`);
  }
  
  console.log('');
  
  // Summary
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║                      SUMMARY                              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('');
  
  const allGood = Object.values(results).every(v => v);
  
  console.log(`Memory Embedder (5001):  ${results.memoryEmbedder ? '✅' : '❌'}`);
  console.log(`Belief Embedder (5002):  ${results.beliefEmbedder ? '✅' : '❌'}`);
  console.log(`Qdrant (6333):           ${results.qdrant ? '✅' : '❌'}`);
  console.log(`LM Studio (1234):        ${results.lmStudio ? '✅' : '❌'}`);
  console.log(`SQLite Database:         ${results.database ? '✅' : '❌'}`);
  console.log('');
  
  if (allGood) {
    console.log('🎉 ALL SYSTEMS OPERATIONAL!');
  } else {
    console.log('⚠️  Some systems need attention:');
    if (!results.memoryEmbedder) {
      console.log('   → Run: python memory-embedder-service.py');
    }
    if (!results.beliefEmbedder) {
      console.log('   → Run: python belief-embedder-service.py');
    }
    if (!results.qdrant) {
      console.log('   → Start Qdrant: docker run -p 6333:6333 qdrant/qdrant');
    }
    if (!results.lmStudio) {
      console.log('   → Start LM Studio and load a model');
    }
  }
  
  console.log('');
  
  // Semantic search capability
  console.log('SEMANTIC SEARCH STATUS:');
  if (results.memoryEmbedder && results.qdrant) {
    console.log('   ✅ Memory semantic search: ENABLED');
  } else {
    console.log('   ❌ Memory semantic search: DISABLED');
    console.log('      (needs Memory Embedder + Qdrant)');
  }
  
  if (results.beliefEmbedder && results.qdrant) {
    console.log('   ✅ Belief semantic search: ENABLED');
  } else {
    console.log('   ❌ Belief semantic search: DISABLED');
    console.log('      (needs Belief Embedder + Qdrant)');
  }
  
  console.log('');
  
  return results;
}

// Run
diagnose().catch(console.error);
