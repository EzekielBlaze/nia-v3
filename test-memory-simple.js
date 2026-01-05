/**
 * SIMPLE MEMORY DIAGNOSTIC
 * Just checks if handlers are registered
 */

const IPCClient = require('./ipc-client');

async function test() {
  console.log('');
  console.log('========================================');
  console.log('SIMPLE MEMORY CHECK');
  console.log('========================================');
  console.log('');
  
  const client = new IPCClient();
  
  try {
    console.log('[1] Connecting to daemon...');
    await client.connect(5000);
    console.log('✅ Connected!');
    console.log('');
    
    // Test if memory_stats handler exists
    console.log('[2] Testing memory_stats handler...');
    try {
      const stats = await client.request('memory_stats', {});
      console.log('✅ memory_stats WORKS!');
      console.log('Response:', JSON.stringify(stats, null, 2));
      console.log('');
    } catch (err) {
      console.log('❌ memory_stats FAILED!');
      console.log('Error:', err.message);
      console.log('');
      console.log('This means API handlers are NOT registered.');
      console.log('The daemon needs to be updated and restarted.');
      console.log('');
    }
    
    // Test if commit_memory handler exists
    console.log('[3] Testing commit_memory handler...');
    try {
      const result = await client.request('commit_memory', {
        content: 'Simple test memory',
        context: 'testing'
      });
      console.log('✅ commit_memory WORKS!');
      console.log('Response:', JSON.stringify(result, null, 2));
      console.log('');
    } catch (err) {
      console.log('❌ commit_memory FAILED!');
      console.log('Error:', err.message);
      console.log('');
    }
    
    client.disconnect();
    
    console.log('========================================');
    console.log('TEST COMPLETE');
    console.log('========================================');
    
  } catch (err) {
    console.log('❌ Cannot connect to daemon!');
    console.log('Error:', err.message);
    console.log('');
    console.log('Make sure daemon is running.');
  }
}

test();
