/**
 * QDRANT DIAGNOSTIC
 * 
 * Checks all collections, counts, and recent entries
 * Run: node diagnose-qdrant.js
 */

const QDRANT_URL = 'http://localhost:6333';

async function diagnose() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           QDRANT FULL DIAGNOSTIC                             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  
  // 1. Check if Qdrant is running
  console.log('1. QDRANT STATUS');
  console.log('─'.repeat(60));
  try {
    // Use /collections endpoint (more reliable than /health)
    const health = await fetch(`${QDRANT_URL}/collections`);
    if (health.ok) {
      console.log('   ✓ Qdrant is running\n');
    } else {
      console.log(`   ✗ Qdrant returned status ${health.status}\n`);
      return;
    }
  } catch (err) {
    console.log(`   ✗ Qdrant not reachable: ${err.message}`);
    console.log('   Run: docker start qdrant\n');
    return;
  }
  
  // 2. List all collections
  console.log('2. COLLECTIONS');
  console.log('─'.repeat(60));
  let collections = [];
  try {
    const resp = await fetch(`${QDRANT_URL}/collections`);
    const data = await resp.json();
    collections = data.result?.collections || [];
    
    if (collections.length === 0) {
      console.log('   ✗ No collections found!\n');
    } else {
      console.log(`   Found ${collections.length} collections:`);
      for (const col of collections) {
        console.log(`   - ${col.name}`);
      }
      console.log('');
    }
  } catch (err) {
    console.log(`   ✗ Failed to list collections: ${err.message}\n`);
    return;
  }
  
  // 3. Check each collection
  for (const col of collections) {
    console.log(`3. COLLECTION: ${col.name.toUpperCase()}`);
    console.log('─'.repeat(60));
    
    try {
      // Get collection info
      const infoResp = await fetch(`${QDRANT_URL}/collections/${col.name}`);
      const info = await infoResp.json();
      
      const pointCount = info.result?.points_count || 0;
      const vectorSize = info.result?.config?.params?.vectors?.size || 
                         info.result?.config?.params?.size || 'unknown';
      
      console.log(`   Points: ${pointCount}`);
      console.log(`   Vector size: ${vectorSize}`);
      
      if (pointCount === 0) {
        console.log('   ⚠️  Collection is EMPTY\n');
        continue;
      }
      
      // Get sample points (most recent by scrolling)
      const scrollResp = await fetch(`${QDRANT_URL}/collections/${col.name}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 5,
          with_payload: true,
          with_vector: false
        })
      });
      const scrollData = await scrollResp.json();
      const points = scrollData.result?.points || [];
      
      console.log(`\n   Sample entries (${points.length}):`);
      
      for (const point of points) {
        const payload = point.payload || {};
        const id = point.id;
        
        // Format based on collection type
        if (col.name === 'memories') {
          const text = payload.text || payload.statement || '(no text)';
          const created = payload.created_at ? new Date(payload.created_at).toLocaleString() : 'unknown';
          console.log(`   [${id}] ${text.substring(0, 60)}...`);
          console.log(`         Created: ${created}`);
        } 
        else if (col.name === 'beliefs') {
          const text = payload.text || payload.statement || '(no text)';
          const type = payload.type || payload.belief_type || 'unknown';
          const beliefId = payload.belief_id || 'unknown';
          console.log(`   [${id}] ${text.substring(0, 60)}...`);
          console.log(`         Type: ${type}, Belief ID: ${beliefId}`);
        }
        else if (col.name === 'conversation_archive') {
          const userMsg = payload.user_message || '(no user msg)';
          const niaMsg = payload.nia_response || '(no nia response)';
          const timestamp = payload.timestamp ? new Date(payload.timestamp).toLocaleString() : 'unknown';
          console.log(`   [${id}] User: "${userMsg.substring(0, 40)}..."`);
          console.log(`         Nia: "${niaMsg.substring(0, 40)}..."`);
          console.log(`         Time: ${timestamp}`);
        }
        else {
          // Generic display
          console.log(`   [${id}] ${JSON.stringify(payload).substring(0, 80)}...`);
        }
        console.log('');
      }
      
      // Check for recent entries (last 24 hours)
      const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
      const recentResp = await fetch(`${QDRANT_URL}/collections/${col.name}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 100,
          with_payload: true,
          with_vector: false,
          filter: {
            must: [{
              key: col.name === 'conversation_archive' ? 'timestamp' : 'created_at',
              range: { gte: oneDayAgo }
            }]
          }
        })
      });
      const recentData = await recentResp.json();
      const recentCount = recentData.result?.points?.length || 0;
      
      console.log(`   📅 Last 24 hours: ${recentCount} entries`);
      
      // Check for entries in last hour
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const hourResp = await fetch(`${QDRANT_URL}/collections/${col.name}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 100,
          with_payload: true,
          with_vector: false,
          filter: {
            must: [{
              key: col.name === 'conversation_archive' ? 'timestamp' : 'created_at',
              range: { gte: oneHourAgo }
            }]
          }
        })
      });
      const hourData = await hourResp.json();
      const hourCount = hourData.result?.points?.length || 0;
      
      console.log(`   ⏰ Last hour: ${hourCount} entries`);
      
      if (hourCount === 0 && recentCount === 0) {
        console.log('   ⚠️  NO RECENT WRITES - Pipeline may be broken!');
      }
      
    } catch (err) {
      console.log(`   ✗ Error checking ${col.name}: ${err.message}`);
    }
    
    console.log('');
  }
  
  // 4. Check embedder services
  console.log('4. EMBEDDER SERVICES');
  console.log('─'.repeat(60));
  
  // Memory embedder
  try {
    const memResp = await fetch('http://localhost:5001/health', { signal: AbortSignal.timeout(2000) });
    if (memResp.ok) {
      const data = await memResp.json();
      console.log(`   Memory Embedder (5001): ✓ Running`);
      console.log(`     Model: ${data.model || 'unknown'}`);
    } else {
      console.log(`   Memory Embedder (5001): ✗ Not OK (${memResp.status})`);
    }
  } catch (err) {
    console.log(`   Memory Embedder (5001): ✗ Not running`);
  }
  
  // Belief embedder
  try {
    const belResp = await fetch('http://localhost:5002/health', { signal: AbortSignal.timeout(2000) });
    if (belResp.ok) {
      const data = await belResp.json();
      console.log(`   Belief Embedder (5002): ✓ Running`);
      console.log(`     Model: ${data.model || 'unknown'}`);
    } else {
      console.log(`   Belief Embedder (5002): ✗ Not OK (${belResp.status})`);
    }
  } catch (err) {
    console.log(`   Belief Embedder (5002): ✗ Not running`);
  }
  
  console.log('\n' + '═'.repeat(60));
  console.log('DIAGNOSIS COMPLETE');
  console.log('═'.repeat(60));
}

diagnose().catch(console.error);
