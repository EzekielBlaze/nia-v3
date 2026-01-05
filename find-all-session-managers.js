/**
 * FIND ALL SESSION-MANAGER FILES
 * Shows every copy and their require() paths
 */

const fs = require('fs');
const path = require('path');

function findFiles(dir, filename, results = []) {
  try {
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const filePath = path.join(dir, file);
      
      // Skip node_modules
      if (file === 'node_modules') continue;
      
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        findFiles(filePath, filename, results);
      } else if (file === filename) {
        results.push(filePath);
      }
    }
  } catch (err) {
    // Skip inaccessible directories
  }
  
  return results;
}

console.log('');
console.log('========================================');
console.log('FINDING ALL session-manager.js FILES');
console.log('========================================');
console.log('');

const files = findFiles('.', 'session-manager.js');

if (files.length === 0) {
  console.log('❌ NO session-manager.js files found!');
} else {
  console.log(`Found ${files.length} file(s):`);
  console.log('');
  
  files.forEach((file, i) => {
    console.log(`[${i + 1}] ${file}`);
    
    // Read first 10 lines
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n').slice(0, 10);
    
    // Find require lines
    const requireLines = lines.filter(line => line.includes('require'));
    if (requireLines.length > 0) {
      requireLines.forEach(line => {
        console.log(`    ${line.trim()}`);
      });
    }
    console.log('');
  });
}

console.log('========================================');
console.log('');
console.log('CORRECT paths should be:');
console.log("  require('../temporal')");
console.log("  require('../../../utils/logger')");
console.log('');
console.log('If you see different paths above, that file is WRONG!');
console.log('');
