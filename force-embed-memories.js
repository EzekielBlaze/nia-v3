/**
 * Force Re-embed Memories - Ignores existing vector_id
 */

const Database = require('better-sqlite3');
const path = require('path');
const fetch = require('node-fetch');

const dbPath = path.join(__dirname, 'data', 'nia.db');
const db = new Database(dbPath);

const MEMORY_EMBEDDER = 'http://localhost:5001/embed';
const QDRANT_URL = 'http://localhost:6333';

async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   FORCE RE-EMBED ALL MEMORIES          ║');
  console.log('╚════════════════════════════════════════╝\n');

  // Check what tables exist
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables:', tables.map(t => t.name).join(', '));
  
  // Check for memory table
  const memoryTable = tables.find(t => 
    t.name === 'memory_commits' || 
    t.name === 'memories' || 
    t.name === 'memory'
  );
  
  if (!memoryTable) {
    console.log('\n❌ No memory table found!');
    console.log('Available tables:', tables.map(t => t.name).join(', '));
    
    // Maybe memories are stored differently - check beliefs for memory-like content
    console.log('\n=== Checking if memories are in beliefs table ===');
    const memoryBeliefs = db.prepare(`
      SELECT * FROM beliefs 
      WHERE subject LIKE '%memory%' OR holder = 'memory'
      LIMIT 5
    `).all();
    console.log(`Found ${memoryBeliefs.length} memory-like beliefs`);
    
    db.close();
    return;
  }
  
  console.log(`\nFound memory table: ${memoryTable.name}`);
  
  // Get schema
  const schema = db.prepare(`PRAGMA table_info(${memoryTable.name})`).all();
  console.log('Columns:', schema.map(c => c.name).join(', '));
  
  // Get all memories
  const memories = db.prepare(`SELECT * FROM ${memoryTable.name}`).all();
  console.log(`\nTotal memories: ${memories.length}`);
  
  if (memories.length === 0) {
    console.log('\n⚠️ No memories in database yet!');
    console.log('Memories are created when you chat with NIA and she learns things.');
    console.log('\nTo test, try saying something like:');
    console.log('  "I really love photography"');
    console.log('  "My favorite color is blue"');
    console.log('  "I work as a software developer"');
    db.close();
    return;
  }
  
  // Show sample
  console.log('\nSample memories:');
  memories.slice(0, 3).forEach((m, i) => {
    const text = m.memory_statement || m.statement || m.content || m.text;
    console.log(`  ${i+1}. "${text?.substring(0, 60)}..."`);
    console.log(`     vector_id: ${m.vector_id || 'none'}`);
  });
  
  // Embed all (force)
  console.log(`\n=== Embedding ${memories.length} memories ===\n`);
  
  let success = 0, failed = 0;
  
  for (const mem of memories) {
    const text = mem.memory_statement || mem.statement || mem.content || mem.text;
    
    if (!text) {
      console.log(`  ⚠️ Memory #${mem.id} has no text`);
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
        console.log(`  ❌ Memory #${mem.id}: No embedding`);
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
              type: mem.memory_type || mem.type || 'observation'
            }
          }]
        })
      });
      
      const qdrantData = await qdrantRes.json();
      
      if (qdrantData.status === 'ok' || qdrantData.result) {
        db.prepare(`UPDATE ${memoryTable.name} SET vector_id = ? WHERE id = ?`).run(vectorId, mem.id);
        console.log(`  ✅ #${mem.id}: "${text.substring(0, 50)}..."`);
        success++;
      } else {
        console.log(`  ❌ #${mem.id}: Qdrant error`);
        failed++;
      }
    } catch (e) {
      console.log(`  ❌ #${mem.id}: ${e.message}`);
      failed++;
    }
  }
  
  console.log(`\n✅ Done: ${success} embedded, ${failed} failed`);
  
  // Verify
  const memRes = await fetch(`${QDRANT_URL}/collections/memories`);
  const memData = await memRes.json();
  console.log(`\nQdrant memories collection: ${memData.result?.points_count || 0} vectors`);
  
  db.close();
}

main().catch(console.error);
