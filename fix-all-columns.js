/**
 * Add ALL missing columns to beliefs table
 */

const sqlite3 = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'nia.db');
const db = sqlite3(dbPath);

console.log('\n=== Adding ALL Missing Columns to Beliefs ===\n');

// All columns that should exist
const requiredColumns = {
  'decay_rate': 'REAL DEFAULT 0.1',
  'last_reinforced': 'INTEGER',
  'last_challenged': 'INTEGER',
  'created_at': 'INTEGER',
  'updated_at': 'INTEGER',
  'superseded_by_belief_id': 'INTEGER',
  'revision_reasoning': 'TEXT',
  'valid_from': 'INTEGER',
  'valid_to': 'INTEGER',
  'formation_reasoning': 'TEXT',
  'evidence_count': 'INTEGER DEFAULT 1',
  'conviction_score': 'REAL DEFAULT 10.0'
};

try {
  // Check current columns
  const info = db.prepare("PRAGMA table_info(beliefs)").all();
  const existing = info.map(c => c.name);
  
  console.log(`Current columns: ${existing.length}\n`);
  
  let added = 0;
  
  for (const [colName, colDef] of Object.entries(requiredColumns)) {
    if (!existing.includes(colName)) {
      try {
        console.log(`Adding ${colName}...`);
        db.exec(`ALTER TABLE beliefs ADD COLUMN ${colName} ${colDef}`);
        added++;
        console.log(`  ✓ ${colName} added`);
      } catch (err) {
        console.log(`  ✗ ${colName}: ${err.message}`);
      }
    } else {
      console.log(`  - ${colName} (already exists)`);
    }
  }
  
  // Set timestamps for existing rows
  if (added > 0) {
    console.log('\nSetting default values for existing rows...');
    
    const now = Math.floor(Date.now() / 1000);
    
    // Set created_at and updated_at if NULL
    db.exec(`UPDATE beliefs SET created_at = ${now} WHERE created_at IS NULL`);
    db.exec(`UPDATE beliefs SET updated_at = ${now} WHERE updated_at IS NULL`);
    
    // Set valid_from if NULL
    db.exec(`UPDATE beliefs SET valid_from = ${now} WHERE valid_from IS NULL`);
    
    console.log('  ✓ Defaults set');
  }
  
  // Verify
  const finalInfo = db.prepare("PRAGMA table_info(beliefs)").all();
  const finalColumns = finalInfo.map(c => c.name);
  
  console.log(`\n=== FINAL STATE ===\n`);
  console.log(`Total columns: ${finalColumns.length}`);
  console.log(`Columns added: ${added}\n`);
  
  // Check for any still missing
  const stillMissing = Object.keys(requiredColumns).filter(col => !finalColumns.includes(col));
  
  if (stillMissing.length > 0) {
    console.log('⚠ Still missing:', stillMissing.join(', '));
  } else {
    console.log('✓ All required columns exist!\n');
  }
  
} catch (err) {
  console.error('Error:', err.message);
} finally {
  db.close();
}
