/**
 * EXTRACT BELIEFS CLI - Two-Pass System
 * 
 * Usage:
 *   node extract-beliefs-v2.js --process [limit]
 *   node extract-beliefs-v2.js --process [limit] --dry-run
 *   node extract-beliefs-v2.js --stats
 *   node extract-beliefs-v2.js --recent [limit]
 */

const TwoPassExtractionEngine = require('./belief-extraction-engine-v2');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'nia.db');

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let command = null;
  let limit = 10;
  let dryRun = false;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--process') {
      command = 'process';
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        limit = parseInt(args[i + 1]);
        i++;
      }
    } else if (args[i] === '--stats') {
      command = 'stats';
    } else if (args[i] === '--recent') {
      command = 'recent';
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        limit = parseInt(args[i + 1]);
        i++;
      }
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }
  
  const engine = new TwoPassExtractionEngine(DB_PATH, { dryRun });
  
  if (command === 'process') {
    console.log(`\n🔄 Processing beliefs (two-pass extraction)...\n`);
    const result = await engine.processUnprocessedThinking(limit);
    
    console.log('\nResults:');
    console.log(`  Processed: ${result.processed}`);
    console.log(`  Created: ${result.created}`);
    console.log(`  Updated: ${result.updated}`);
    console.log(`  Rejected: ${result.rejected}`);
    
  } else if (command === 'stats') {
    const stats = engine.getStats();
    
    console.log('\n📊 Extraction Statistics:');
    console.log(`  Total extractions: ${stats.total_extractions || 0}`);
    console.log(`  Total candidates: ${stats.total_candidates || 0}`);
    console.log(`  Valid candidates: ${stats.valid_candidates || 0}`);
    console.log(`  Rejected: ${stats.rejected || 0}`);
    console.log(`  Beliefs created: ${stats.beliefs_created || 0}`);
    console.log(`  Beliefs updated: ${stats.beliefs_updated || 0}`);
    console.log(`  Avg processing time: ${Math.round(stats.avg_processing_time || 0)}ms`);
    
  } else if (command === 'recent') {
    const Database = require('better-sqlite3');
    const db = new Database(DB_PATH);
    
    const recent = db.prepare(`
      SELECT 
        b.id,
        b.subject,
        b.belief_class,
        b.belief_statement,
        b.conviction_score,
        datetime(b.created_at, 'unixepoch') as created
      FROM beliefs b
      ORDER BY b.created_at DESC
      LIMIT ?
    `).all(limit);
    
    console.log(`\n📝 Recent ${limit} beliefs:\n`);
    recent.forEach(b => {
      console.log(`[${b.id}] (${b.subject}) [${b.belief_class || 'unknown'}] "${b.belief_statement}" (${b.conviction_score}%)`);
      console.log(`    Created: ${b.created}\n`);
    });
    
  } else {
    console.log('\n📖 Usage:');
    console.log('  node extract-beliefs-v2.js --process [limit]          Process unprocessed entries');
    console.log('  node extract-beliefs-v2.js --process [limit] --dry-run  Test without writing to DB');
    console.log('  node extract-beliefs-v2.js --stats                     Show extraction statistics');
    console.log('  node extract-beliefs-v2.js --recent [limit]            Show recent beliefs');
    console.log('\nExamples:');
    console.log('  node extract-beliefs-v2.js --process 1 --dry-run');
    console.log('  node extract-beliefs-v2.js --process 10');
    console.log('  node extract-beliefs-v2.js --stats');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
