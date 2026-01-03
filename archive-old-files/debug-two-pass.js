/**
 * DEBUG TWO-PASS EXTRACTION
 * 
 * Shows raw LLM output from both passes for the first unprocessed entry
 */

const TwoPassExtractionEngine = require('./belief-extraction-engine-v2');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'nia.db');

async function debug() {
  console.log('\n🔍 DEBUG: Testing two-pass extraction\n');
  
  const db = new Database(DB_PATH);
  
  // Get first unprocessed entry
  const entry = db.prepare(`
    SELECT * FROM thinking_log
    WHERE processed_for_beliefs = 0
    ORDER BY created_at ASC
    LIMIT 1
  `).get();
  
  if (!entry) {
    console.log('❌ No unprocessed thinking log entries found');
    console.log('\nCreate a test entry with:');
    console.log('  sqlite3 data\\nia.db');
    console.log('  INSERT INTO thinking_log (user_message, thinking_content, response_summary, processed_for_beliefs)');
    console.log('  VALUES (\'I love programming in Rust\', \'User values type safety\', \'That makes sense!\', 0);');
    return;
  }
  
  console.log('📝 Found thinking log entry:');
  console.log(`  ID: ${entry.id}`);
  console.log(`  User message: "${entry.user_message}"`);
  console.log(`  Thinking: "${entry.thinking_content}"`);
  console.log(`  Response: "${entry.response_summary}"\n`);
  
  const engine = new TwoPassExtractionEngine(DB_PATH, { dryRun: true });
  
  const conversation = {
    userMessage: entry.user_message || '',
    assistantResponse: entry.response_summary || '',
    thinking: entry.thinking_content || ''
  };
  
  console.log('🤖 Pass A: Extracting subjects...\n');
  
  try {
    const passA = await engine.extractSubjects(conversation);
    
    console.log('📥 RAW PASS A OUTPUT:');
    console.log(passA.rawOutput);
    console.log('\n');
    
    console.log('✅ PARSED SUBJECTS:');
    console.log(JSON.stringify(passA.subjects, null, 2));
    console.log('\n');
    
    console.log('🤖 Pass B: Extracting beliefs...\n');
    
    const passB = await engine.extractBeliefs(conversation, passA.subjects);
    
    console.log('📥 RAW PASS B OUTPUT:');
    console.log(passB.rawOutput);
    console.log('\n');
    
    console.log('✅ PARSED BELIEFS:');
    console.log(JSON.stringify(passB.beliefs, null, 2));
    console.log('\n');
    
    console.log('📊 Summary:');
    console.log(`  Subjects extracted: ${passA.subjects.length}`);
    console.log(`  Subject IDs: ${passA.subjects.map(s => s.id).join(', ')}`);
    console.log(`  Beliefs extracted: ${passB.beliefs.length}`);
    
    if (passB.beliefs.length > 0) {
      console.log('\n  Belief subjects (about_id):');
      const aboutIds = passB.beliefs.map(b => b.about_id);
      const uniqueAboutIds = [...new Set(aboutIds)];
      uniqueAboutIds.forEach(id => {
        const count = aboutIds.filter(a => a === id).length;
        console.log(`    - ${id}: ${count} belief(s)`);
      });
    }
    
    console.log('\n✅ Two-pass extraction test complete!');
    
  } catch (err) {
    console.error('\n❌ Error during extraction:', err.message);
    console.error(err.stack);
  }
}

debug();
