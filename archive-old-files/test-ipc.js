/**
 * TEST IPC CONNECTION
 * Directly tests IPC to see what daemon returns
 */

const IPCClient = require('./ipc-client');

async function test() {
  console.log('========================================');
  console.log('IPC CONNECTION TEST');
  console.log('========================================');
  console.log('');
  
  const client = new IPCClient();
  
  try {
    console.log('[1] Connecting to daemon...');
    await client.connect(5000);
    console.log('✅ Connected!');
    console.log('');
    
    console.log('[2] Testing status command...');
    const status = await client.request('status', {});
    console.log('✅ Response received!');
    console.log('');
    console.log('Response type:', typeof status);
    console.log('Response:', JSON.stringify(status, null, 2));
    console.log('');
    
    console.log('[3] Testing cognitive_state command...');
    const cogState = await client.request('cognitive_state', {});
    console.log('✅ Response received!');
    console.log('');
    console.log('Response type:', typeof cogState);
    console.log('Response:', JSON.stringify(cogState, null, 2));
    console.log('');
    
    console.log('[4] Disconnecting...');
    client.disconnect();
    console.log('✅ Disconnected!');
    console.log('');
    
    console.log('========================================');
    console.log('TEST COMPLETE - ALL WORKING!');
    console.log('========================================');
    
  } catch (err) {
    console.error('❌ ERROR:', err.message);
    console.error('Stack:', err.stack);
    
    if (client) {
      client.disconnect();
    }
  }
}

test();
