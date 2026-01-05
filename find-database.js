/**
 * Find Database - Locate the actual NIA database with data
 */

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

console.log('╔════════════════════════════════════════╗');
console.log('║     FIND NIA DATABASE                  ║');
console.log('╚════════════════════════════════════════╝\n');

// Search locations
const searchPaths = [
  'N:\\Nia V3',
  'N:\\Nia V3\\data',
  'N:\\Nia V3\\db',
  'N:\\Nia V3\\database',
  process.cwd(),
  path.join(process.cwd(), 'data'),
  path.join(process.cwd(), 'db'),
  process.env.APPDATA ? path.join(process.env.APPDATA, 'nia') : null,
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'nia') : null,
  'C:\\Users',
].filter(Boolean);

// Find all .db files
function findDbFiles(dir, results = []) {
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && item.endsWith('.db')) {
          results.push(fullPath);
        } else if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          // Only recurse one level deep
          if (dir.split(path.sep).length < 6) {
            findDbFiles(fullPath, results);
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
  return results;
}

console.log('Searching for .db files...\n');

const allDbFiles = [];
for (const searchPath of searchPaths) {
  const found = findDbFiles(searchPath);
  for (const f of found) {
    if (!allDbFiles.includes(f)) {
      allDbFiles.push(f);
    }
  }
}

console.log(`Found ${allDbFiles.length} database files:\n`);

// Check each database
for (const dbPath of allDbFiles) {
  console.log(`📁 ${dbPath}`);
  
  try {
    const stat = fs.statSync(dbPath);
    console.log(`   Size: ${(stat.size / 1024).toFixed(1)} KB`);
    
    const db = new Database(dbPath, { readonly: true });
    
    // Get tables
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    
    if (tables.length === 0) {
      console.log('   Tables: (empty database)');
    } else {
      console.log(`   Tables: ${tables.map(t => t.name).join(', ')}`);
      
      // Check for our tables
      const hasBeliefs = tables.some(t => t.name === 'beliefs');
      const hasMemories = tables.some(t => t.name === 'memory_commits');
      
      if (hasBeliefs) {
        const count = db.prepare('SELECT COUNT(*) as c FROM beliefs').get();
        console.log(`   → beliefs: ${count.c} rows`);
      }
      
      if (hasMemories) {
        const count = db.prepare('SELECT COUNT(*) as c FROM memory_commits').get();
        console.log(`   → memory_commits: ${count.c} rows`);
      }
      
      if (hasBeliefs || hasMemories) {
        console.log('   ⭐ THIS IS THE DATABASE WITH DATA!');
      }
    }
    
    db.close();
  } catch (e) {
    console.log(`   Error: ${e.message}`);
  }
  
  console.log('');
}

// Also check what the daemon config says
console.log('=== Checking Config Files ===\n');

const configFiles = [
  'config.js',
  'config.json',
  '.env',
  'daemon.js'
];

for (const configFile of configFiles) {
  const fullPath = path.join('N:\\Nia V3', configFile);
  if (fs.existsSync(fullPath)) {
    console.log(`Found: ${fullPath}`);
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      // Look for db path references
      const dbMatches = content.match(/['"](.*\.db)['"]/g) || [];
      const pathMatches = content.match(/db[_-]?path['":\s]+['"]([^'"]+)['"]/gi) || [];
      const dataMatches = content.match(/data[_-]?dir['":\s]+['"]([^'"]+)['"]/gi) || [];
      
      if (dbMatches.length > 0) {
        console.log(`   DB references: ${dbMatches.join(', ')}`);
      }
      if (pathMatches.length > 0) {
        console.log(`   Path refs: ${pathMatches.join(', ')}`);
      }
    } catch (e) {}
  }
}

console.log('\n✅ Done searching. Use the path marked with ⭐ for fix-embeddings.js');
