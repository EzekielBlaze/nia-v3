/**
 * MEMORY FLOW DIAGNOSTIC
 * Run this to check each step of the memory pipeline
 */

const Database = require('better-sqlite3');
const fetch = require('node-fetch');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nia.db');

async function diagnose() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║     MEMORY FLOW DIAGNOSTIC             ║');
  console.log('╚════════════════════════════════════════╝\n');

  const db = new Database(dbPath);

  // 1. Check SQLite memories
  console.log('=== STEP 1: SQLite Memories ===');
  const memories = db.prepare('SELECT * FROM memory_commits ORDER BY committed_at DESC LIMIT 5').all();
  console.log(`Total memories: ${db.prepare('SELECT COUNT(*) as c FROM memory_commits').get().c}`);
  console.log('Recent memories:');
  memories.forEach(m => {
    console.log(`  #${m.id}: "${m.memory_statement?.substring(0, 50)}..."`);
    console.log(`       vector_id: ${m.vector_id || 'NONE'}`);
  });

  // 2. Check Qdrant
  console.log('\n=== STEP 2: Qdrant Vectors ===');
  try {
    const res = await fetch('http://localhost:6333/collections/memories');
    const data = await res.json();
    console.log(`Qdrant memories collection: ${data.result?.points_count || 0} vectors`);
    
    if (data.result?.points_count === 0) {
      console.log('⚠️ PROBLEM: SQLite has memories but Qdrant is empty!');
      console.log('   → memory-embedder.js embed() method not working');
    }
  } catch (e) {
    console.log(`❌ Qdrant offline: ${e.message}`);
  }

  // 3. Check embedder service
  console.log('\n=== STEP 3: Embedder Service ===');
  try {
    const res = await fetch('http://localhost:5001/health');
    const data = await res.json();
    console.log(`✅ Memory embedder online: ${data.model} (${data.dimensions} dims)`);
  } catch (e) {
    console.log(`❌ Memory embedder offline: ${e.message}`);
  }

  // 4. Test the embed flow manually
  console.log('\n=== STEP 4: Test Embed Flow ===');
  const testText = 'diagnostic test memory ' + Date.now();
  
  try {
    // Get embedding
    const embRes = await fetch('http://localhost:5001/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: testText })
    });
    const embData = await embRes.json();
    
    if (embData.embedding) {
      console.log(`✅ Got embedding: ${embData.embedding.length} dimensions`);
      
      // Try to store in Qdrant
      const pointId = Date.now();
      const qdrantRes = await fetch('http://localhost:6333/collections/memories/points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [{
            id: pointId,
            vector: embData.embedding,
            payload: { text: testText, test: true }
          }]
        })
      });
      const qdrantData = await qdrantRes.json();
      
      if (qdrantData.status === 'ok' || qdrantData.result) {
        console.log(`✅ Stored in Qdrant: point ${pointId}`);
        
        // Clean up test point
        await fetch('http://localhost:6333/collections/memories/points/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: [pointId] })
        });
        console.log('✅ Cleaned up test point');
      } else {
        console.log(`❌ Qdrant store failed:`, qdrantData);
      }
    } else {
      console.log(`❌ No embedding returned`);
    }
  } catch (e) {
    console.log(`❌ Embed flow error: ${e.message}`);
  }

  // 5. Check memory-embedder.js has embed() method
  console.log('\n=== STEP 5: Check memory-embedder.js ===');
  try {
    const MemoryEmbedder = require('./core/memory/recall/memory-embedder');
    const embedder = new MemoryEmbedder();
    
    if (typeof embedder.embed === 'function') {
      console.log('✅ memory-embedder.js has embed() method');
    } else {
      console.log('❌ memory-embedder.js MISSING embed() method!');
      console.log('   → This is why Qdrant is not updating');
      console.log('   → Copy the fixed memory-embedder.js to core/memory/recall/');
    }
    
    if (typeof embedder.getEmbedding === 'function') {
      console.log('✅ memory-embedder.js has getEmbedding() method');
    }
  } catch (e) {
    console.log(`❌ Cannot load memory-embedder: ${e.message}`);
  }

  // 6. Check temporal-recall-helper
  console.log('\n=== STEP 6: Check temporal-recall-helper.js ===');
  try {
    const helper = require('./temporal-recall-helper');
    if (helper.detectTemporalQuery && helper.getRecentMemories) {
      console.log('✅ temporal-recall-helper.js loaded');
      
      // Test detection
      const test1 = helper.detectTemporalQuery("what have we talked about today?");
      console.log(`   "what have we talked about today?" -> isSessionQuery: ${test1.isSessionQuery}`);
    }
  } catch (e) {
    console.log(`❌ temporal-recall-helper not found: ${e.message}`);
  }

  console.log('\n=== SUMMARY ===');
  console.log('If Qdrant has 0 vectors but SQLite has memories:');
  console.log('  → Run: node force-embed-memories.js');
  console.log('  → Then copy fixed memory-embedder.js to core/memory/recall/');
  console.log('');
  console.log('If hallucinating:');
  console.log('  → Check daemon logs for "Recalled X existing memories"');
  console.log('  → If 0 recalled, recall system not working');

  db.close();
}

diagnose().catch(console.error);
