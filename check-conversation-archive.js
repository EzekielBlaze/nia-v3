/**
 * Quick diagnostic for conversation archive in Qdrant
 */

async function main() {
  console.log('Checking conversation_archive collection...\n');
  
  try {
    // Get collection info
    const infoRes = await fetch('http://localhost:6333/collections/conversation_archive');
    const info = await infoRes.json();
    console.log('Collection status:', info.result?.status);
    console.log('Total points:', info.result?.points_count);
    console.log('');
    
    // Get ALL points with timestamps
    const scrollRes = await fetch('http://localhost:6333/collections/conversation_archive/points/scroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 100,
        with_payload: true,
        with_vector: false
      })
    });
    
    const scrollData = await scrollRes.json();
    const points = scrollData.result?.points || [];
    
    console.log(`Retrieved ${points.length} points\n`);
    
    // Sort by timestamp
    points.sort((a, b) => (b.payload?.timestamp || 0) - (a.payload?.timestamp || 0));
    
    console.log('=== MOST RECENT 10 ===');
    points.slice(0, 10).forEach((p, i) => {
      const ts = p.payload?.timestamp;
      const date = ts ? new Date(ts).toLocaleString() : 'no timestamp';
      const user = p.payload?.user_message?.substring(0, 40) || '(no user msg)';
      const nia = p.payload?.nia_response?.substring(0, 40) || '(no nia msg)';
      console.log(`${i+1}. [${date}]`);
      console.log(`   ID: ${p.id}`);
      console.log(`   User: ${user}...`);
      console.log(`   Nia: ${nia}...`);
      console.log('');
    });
    
    console.log('=== OLDEST 5 ===');
    points.slice(-5).reverse().forEach((p, i) => {
      const ts = p.payload?.timestamp;
      const date = ts ? new Date(ts).toLocaleString() : 'no timestamp';
      const user = p.payload?.user_message?.substring(0, 40) || '(no user msg)';
      console.log(`${i+1}. [${date}] User: ${user}...`);
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

main();
