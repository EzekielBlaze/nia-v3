/**
 * TEST LLM CLIENT
 * 
 * Run: node test-llm.js local
 * Run: node test-llm.js cloud
 */

const llm = require('./llm-client');

async function test() {
  const mode = process.argv[2] || 'local';
  
  console.log('\n=== LLM Toggle Test ===\n');
  
  // Show status
  console.log('Status:', llm.getStatus());
  console.log('');
  
  // Set mode
  try {
    llm.setMode(mode);
  } catch (err) {
    console.error('❌ ' + err.message);
    process.exit(1);
  }
  
  // Test chat
  console.log(`\nTesting ${mode} mode...\n`);
  
  const startTime = Date.now();
  
  try {
    const response = await llm.chat(
      'You are Nia, a cozy catgirl AI. Keep responses short.',
      [{ role: 'user', content: 'Hey Nia! Just testing if you work. Say hi!' }],
      { maxTokens: 100 }
    );
    
    const elapsed = Date.now() - startTime;
    
    console.log('Response:', response);
    console.log(`\n⏱️ Time: ${elapsed}ms (${(elapsed/1000).toFixed(1)}s)`);
    console.log('✅ Success!\n');
    
  } catch (err) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

test();
