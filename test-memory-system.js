/**
 * TEST MEMORY SYSTEM
 * Tests if memory commit is working
 */

const IPCClient = require('./ipc-client');

async function testMemory() {
  console.log('');
  console.log('========================================');
  console.log('MEMORY SYSTEM TEST');
  console.log('========================================');
  console.log('');
  
  const client = new IPCClient();
  
  try {
    console.log('[1] Connecting to daemon...');
    await client.connect(5000);
    console.log('✅ Connected!');
    console.log('');
    
    console.log('[2] Testing memory commit...');
    const testMemory = {
      content: "This is a test memory from the test script",
      context: "testing",
      importance: 5
    };
    
    const commitResult = await client.request('commit_memory', testMemory);
    console.log('✅ Commit response received!');
    console.log('');
    console.log('Response:', JSON.stringify(commitResult, null, 2));
    console.log('');
    
    if (commitResult.success) {
      console.log('✅ MEMORY COMMITTED SUCCESSFULLY!');
      console.log(`   Memory ID: ${commitResult.memory_id || 'unknown'}`);
    } else {
      console.log('❌ MEMORY COMMIT FAILED!');
      console.log(`   Error: ${commitResult.error || 'Unknown error'}`);
    }
    console.log('');
    
    console.log('[3] Testing memory stats...');
    const stats = await client.request('memory_stats', {});
    console.log('Stats:', JSON.stringify(stats, null, 2));
    console.log('');
    
    console.log('[4] Disconnecting...');
    client.disconnect();
    console.log('✅ Disconnected!');
    console.log('');
    
    console.log('========================================');
    console.log('TEST COMPLETE!');
    console.log('========================================');
    
  } catch (err) {
    console.error('❌ ERROR:', err.message);
    console.error('Stack:', err.stack);
    
    if (client) {
      client.disconnect();
    }
  }
}

testMemory();
