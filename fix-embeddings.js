/**
 * Fix Embeddings - Diagnose and repair vector storage
 * 
 * Issues found:
 * - Qdrant has 0 vectors
 * - Beliefs exist but no embeddings stored
 * - Need to re-embed everything
 */

const Database = require('better-sqlite3');
const path = require('path');
const fetch = require('node-fetch');

// Find database
const dbPaths = [
  path.join(__dirname, 'data', 'nia.db'),  // Correct location per config.js
  path.join(__dirname, 'nia.db'),
  'N:\\Nia V3\\data\\nia.db',
  'N:\\Nia V3\\nia.db'
];

let db;
for (const p of dbPaths) {
  try {
    db = new Database(p);
    console.log(`✅ Found database: ${p}`);
    break;
  } catch (e) {}
}

if (!db) {
  console.error('❌ Could not find database');
  process.exit(1);
}

// Config
const MEMORY_EMBEDDER = 'http://localhost:5001/embed';
const BELIEF_EMBEDDER = 'http://localhost:5002/embed';
const QDRANT_URL = 'http://localhost:6333';

async function checkServices() {
  console.log('\n=== Checking Services ===\n');
  
  // Memory embedder
  try {
    const res = await fetch('http://localhost:5001/health');
    const data = await res.json();
    console.log(`✅ Memory Embedder: ${data.model} (${data.dimensions} dims)`);
  } catch (e) {
    console.log(`❌ Memory Embedder offline: ${e.message}`);
    return false;
  }
  
  // Belief embedder
  try {
    const res = await fetch('http://localhost:5002/health');
    const data = await res.json();
    console.log(`✅ Belief Embedder: ${data.model} (${data.dimensions} dims)`);
  } catch (e) {
    console.log(`❌ Belief Embedder offline: ${e.message}`);
    return false;
  }
  
  // Qdrant
  try {
    const res = await fetch(`${QDRANT_URL}/collections`);
    const data = await res.json();
    console.log(`✅ Qdrant: ${data.result?.collections?.length || 0} collections`);
  } catch (e) {
    console.log(`❌ Qdrant offline: ${e.message}`);
    return false;
  }
  
  return true;
}

async function checkSchema() {
  console.log('\n=== Checking Schema ===\n');
  
  // Check beliefs table
  try {
    const beliefsInfo = db.prepare("PRAGMA table_info(beliefs)").all();
    console.log('Beliefs columns:', beliefsInfo.map(c => c.name).join(', '));
    
    // Find the statement/content column
    const stmtCol = beliefsInfo.find(c => ['statement', 'content', 'belief_statement', 'text'].includes(c.name));
    if (stmtCol) {
      console.log(`  → Statement column: "${stmtCol.name}"`);
    } else {
      console.log('  ⚠️ No statement column found!');
    }
  } catch (e) {
    console.log(`❌ Beliefs table error: ${e.message}`);
  }
  
  // Check memories table
  try {
    const memoriesInfo = db.prepare("PRAGMA table_info(memory_commits)").all();
    console.log('Memory columns:', memoriesInfo.map(c => c.name).join(', '));
  } catch (e) {
    console.log(`❌ Memory table error: ${e.message}`);
  }
}

async function showSampleData() {
  console.log('\n=== Sample Data ===\n');
  
  // Sample beliefs
  try {
    const beliefs = db.prepare("SELECT * FROM beliefs LIMIT 3").all();
    console.log('Sample beliefs:');
    beliefs.forEach((b, i) => {
      console.log(`  ${i + 1}. ID=${b.id}, holder=${b.holder}, subject=${b.subject}`);
      // Try various column names
      const text = b.statement || b.content || b.belief_statement || b.text || '[no text found]';
      console.log(`     Text: "${text.substring(0, 80)}..."`);
      console.log(`     Vector ID: ${b.vector_id || 'none'}`);
    });
  } catch (e) {
    console.log(`❌ Error reading beliefs: ${e.message}`);
  }
  
  // Sample memories
  try {
    const memories = db.prepare("SELECT * FROM memory_commits LIMIT 3").all();
    console.log('\nSample memories:');
    memories.forEach((m, i) => {
      console.log(`  ${i + 1}. ID=${m.id}, type=${m.memory_type}`);
      const text = m.memory_statement || m.statement || m.content || '[no text found]';
      console.log(`     Text: "${text.substring(0, 80)}..."`);
      console.log(`     Vector ID: ${m.vector_id || 'none'}`);
    });
  } catch (e) {
    console.log(`❌ Error reading memories: ${e.message}`);
  }
}

async function ensureQdrantCollections() {
  console.log('\n=== Ensuring Qdrant Collections ===\n');
  
  // Create memories collection (384 dims for all-MiniLM-L6-v2)
  try {
    const res = await fetch(`${QDRANT_URL}/collections/memories`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: { size: 384, distance: 'Cosine' }
      })
    });
    const data = await res.json();
    if (data.result === true || data.status === 'ok') {
      console.log('✅ Memories collection ready');
    } else if (res.status === 409) {
      console.log('✅ Memories collection already exists');
    } else {
      console.log('⚠️ Memories collection:', JSON.stringify(data));
    }
  } catch (e) {
    console.log(`❌ Failed to create memories collection: ${e.message}`);
  }
  
  // Create beliefs collection (100 dims for Poincaré)
  try {
    const res = await fetch(`${QDRANT_URL}/collections/beliefs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: { size: 100, distance: 'Cosine' }
      })
    });
    const data = await res.json();
    if (data.result === true || data.status === 'ok') {
      console.log('✅ Beliefs collection ready');
    } else if (res.status === 409) {
      console.log('✅ Beliefs collection already exists');
    } else {
      console.log('⚠️ Beliefs collection:', JSON.stringify(data));
    }
  } catch (e) {
    console.log(`❌ Failed to create beliefs collection: ${e.message}`);
  }
}

async function embedMemories() {
  console.log('\n=== Embedding Memories ===\n');
  
  // Get all memories without vectors
  const memories = db.prepare(`
    SELECT * FROM memory_commits 
    WHERE vector_id IS NULL OR vector_id = ''
  `).all();
  
  console.log(`Found ${memories.length} memories without vectors`);
  
  let success = 0, failed = 0;
  
  for (const mem of memories) {
    const text = mem.memory_statement || mem.statement || mem.content;
    if (!text) {
      console.log(`  ⚠️ Memory #${mem.id} has no text, skipping`);
      failed++;
      continue;
    }
    
    try {
      // Get embedding
      const embRes = await fetch(MEMORY_EMBEDDER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      const embData = await embRes.json();
      
      if (!embData.embedding) {
        console.log(`  ❌ Memory #${mem.id}: No embedding returned`);
        failed++;
        continue;
      }
      
      // Store in Qdrant
      const vectorId = `mem_${mem.id}`;
      const qdrantRes = await fetch(`${QDRANT_URL}/collections/memories/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [{
            id: mem.id,
            vector: embData.embedding,
            payload: {
              memory_id: mem.id,
              text: text.substring(0, 500),
              subjects: mem.subjects || '',
              type: mem.memory_type || 'observation'
            }
          }]
        })
      });
      
      const qdrantData = await qdrantRes.json();
      
      if (qdrantData.status === 'ok' || qdrantData.result) {
        // Update database
        db.prepare('UPDATE memory_commits SET vector_id = ? WHERE id = ?').run(vectorId, mem.id);
        console.log(`  ✅ Memory #${mem.id}: "${text.substring(0, 40)}..."`);
        success++;
      } else {
        console.log(`  ❌ Memory #${mem.id}: Qdrant error`, qdrantData);
        failed++;
      }
      
    } catch (e) {
      console.log(`  ❌ Memory #${mem.id}: ${e.message}`);
      failed++;
    }
  }
  
  console.log(`\nMemories: ${success} embedded, ${failed} failed`);
}

async function embedBeliefs() {
  console.log('\n=== Embedding Beliefs ===\n');
  
  // Get all beliefs without vectors
  const beliefs = db.prepare(`
    SELECT * FROM beliefs 
    WHERE vector_id IS NULL OR vector_id = ''
  `).all();
  
  console.log(`Found ${beliefs.length} beliefs without vectors`);
  
  let success = 0, failed = 0;
  
  for (const belief of beliefs) {
    // Try various column names for text
    const text = belief.statement || belief.content || belief.belief_statement || belief.text;
    if (!text) {
      console.log(`  ⚠️ Belief #${belief.id} has no text, skipping`);
      failed++;
      continue;
    }
    
    try {
      // Get embedding
      const embRes = await fetch(BELIEF_EMBEDDER, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, type: 'belief' })
      });
      const embData = await embRes.json();
      
      if (!embData.embedding) {
        console.log(`  ❌ Belief #${belief.id}: No embedding returned`);
        failed++;
        continue;
      }
      
      // Store in Qdrant
      const vectorId = `belief_${belief.id}`;
      const qdrantRes = await fetch(`${QDRANT_URL}/collections/beliefs/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [{
            id: belief.id,
            vector: embData.embedding,
            payload: {
              belief_id: belief.id,
              text: text.substring(0, 500),
              holder: belief.holder || 'unknown',
              subject: belief.subject || '',
              confidence: belief.confidence || 50
            }
          }]
        })
      });
      
      const qdrantData = await qdrantRes.json();
      
      if (qdrantData.status === 'ok' || qdrantData.result) {
        // Update database
        db.prepare('UPDATE beliefs SET vector_id = ? WHERE id = ?').run(vectorId, belief.id);
        console.log(`  ✅ Belief #${belief.id}: "${text.substring(0, 40)}..."`);
        success++;
      } else {
        console.log(`  ❌ Belief #${belief.id}: Qdrant error`, qdrantData);
        failed++;
      }
      
    } catch (e) {
      console.log(`  ❌ Belief #${belief.id}: ${e.message}`);
      failed++;
    }
  }
  
  console.log(`\nBeliefs: ${success} embedded, ${failed} failed`);
}

async function verifyQdrant() {
  console.log('\n=== Verifying Qdrant ===\n');
  
  try {
    // Check memories
    const memRes = await fetch(`${QDRANT_URL}/collections/memories`);
    const memData = await memRes.json();
    console.log(`Memories collection: ${memData.result?.points_count || 0} vectors`);
    
    // Check beliefs
    const belRes = await fetch(`${QDRANT_URL}/collections/beliefs`);
    const belData = await belRes.json();
    console.log(`Beliefs collection: ${belData.result?.points_count || 0} vectors`);
    
  } catch (e) {
    console.log(`❌ Verification error: ${e.message}`);
  }
}

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║     FIX EMBEDDINGS - NIA V3            ║');
  console.log('╚════════════════════════════════════════╝');
  
  // Check services first
  const servicesOk = await checkServices();
  if (!servicesOk) {
    console.log('\n❌ Services not ready. Please start:');
    console.log('   - python memory-embedder-service.py');
    console.log('   - python belief-embedder-service.py');
    console.log('   - qdrant (docker or standalone)');
    process.exit(1);
  }
  
  await checkSchema();
  await showSampleData();
  await ensureQdrantCollections();
  await embedMemories();
  await embedBeliefs();
  await verifyQdrant();
  
  console.log('\n✅ Done! Refresh the Debug Tools page to see vectors.\n');
  
  db.close();
}

main().catch(console.error);
