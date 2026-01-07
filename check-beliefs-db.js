/**
 * Check beliefs database - diagnose embedding issues
 * Searches for the correct database with beliefs table
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Find all .db files
function findDbFiles(dir, depth = 0) {
  if (depth > 2) return [];
  const results = [];
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (item === 'node_modules') continue;
      const fullPath = path.join(dir, item);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && item.endsWith('.db')) {
          results.push(fullPath);
        } else if (stat.isDirectory()) {
          results.push(...findDbFiles(fullPath, depth + 1));
        }
      } catch (e) {}
    }
  } catch (e) {}
  return results;
}

console.log('Searching for database files...\n');
const dbFiles = findDbFiles(process.cwd());
console.log('Found:', dbFiles);

// Check each for beliefs table
let beliefDb = null;
for (const dbPath of dbFiles) {
  try {
    const db = new Database(dbPath, { readonly: true });
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='beliefs'").all();
    db.close();
    if (tables.length > 0) {
      beliefDb = dbPath;
      console.log(`\n✓ Found beliefs table in: ${dbPath}`);
      break;
    } else {
      console.log(`  No beliefs in: ${dbPath}`);
    }
  } catch (e) {
    console.log(`  Error reading ${dbPath}: ${e.message}`);
  }
}

if (!beliefDb) {
  console.log('\n❌ No database with beliefs table found!');
  console.log('The beliefs table should be in data/nia.db');
  process.exit(1);
}

console.log(`\nUsing: ${beliefDb}\n`);

const db = new Database(beliefDb, { readonly: true });

// Check beliefs table schema
console.log('=== BELIEFS TABLE COLUMNS ===');
const schema = db.prepare('PRAGMA table_info(beliefs)').all();
const columns = schema.map(c => c.name);
console.log(columns.join(', '));

// Check if vector_id column exists
const hasVectorId = columns.includes('vector_id');
console.log(`\nvector_id column exists: ${hasVectorId}`);

// Count beliefs
console.log('\n=== BELIEF COUNTS ===');
const total = db.prepare('SELECT COUNT(*) as c FROM beliefs').get().c;
console.log(`Total beliefs: ${total}`);

const active = db.prepare('SELECT COUNT(*) as c FROM beliefs WHERE valid_to IS NULL').get().c;
console.log(`Active (valid_to IS NULL): ${active}`);

if (hasVectorId) {
  const withVector = db.prepare('SELECT COUNT(*) as c FROM beliefs WHERE vector_id IS NOT NULL').get().c;
  const withoutVector = db.prepare('SELECT COUNT(*) as c FROM beliefs WHERE vector_id IS NULL').get().c;
  const toEmbed = db.prepare('SELECT COUNT(*) as c FROM beliefs WHERE vector_id IS NULL AND valid_to IS NULL').get().c;
  
  console.log(`With vector_id: ${withVector}`);
  console.log(`Without vector_id: ${withoutVector}`);
  console.log(`\n📌 To embed (no vector_id + active): ${toEmbed}`);
  
  if (toEmbed > 0) {
    console.log('\n=== BELIEFS NEEDING EMBEDDING ===');
    const beliefs = db.prepare(`
      SELECT id, belief_type, substr(belief_statement, 1, 50) as stmt
      FROM beliefs 
      WHERE vector_id IS NULL AND valid_to IS NULL
      LIMIT 10
    `).all();
    
    beliefs.forEach(b => {
      console.log(`  [${b.id}] ${b.belief_type}: ${b.stmt}...`);
    });
  }
} else {
  console.log('\n⚠️ vector_id column does not exist!');
  console.log('The daemon should add this column automatically.');
  console.log('Check that you have the latest daemon.js and belief-upserter.js');
}

// Sample beliefs
console.log('\n=== SAMPLE BELIEFS (first 5) ===');
const sample = db.prepare(`SELECT id, belief_type, ${hasVectorId ? 'vector_id,' : ''} substr(belief_statement, 1, 40) as stmt FROM beliefs LIMIT 5`).all();
sample.forEach(b => {
  console.log(`  [${b.id}] ${b.belief_type} | vector: ${hasVectorId ? (b.vector_id || 'NULL') : 'N/A'} | ${b.stmt}`);
});

db.close();
console.log('\n✓ Done');
