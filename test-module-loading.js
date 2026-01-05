/**
 * TEST MODULE LOADING
 * Shows exactly what Node loads when daemon requires session-manager
 */

console.log('');
console.log('========================================');
console.log('TESTING MODULE LOADING');
console.log('========================================');
console.log('');

// Simulate what daemon.js does
console.log('[1] Testing: require("./core/memory/daemon")');
try {
  const daemonIndex = require('./core/memory/daemon');
  console.log('✅ Loaded successfully!');
  console.log('   Exports:', Object.keys(daemonIndex).join(', '));
} catch (err) {
  console.log('❌ FAILED!');
  console.log('   Error:', err.message);
  console.log('   Stack:', err.stack.split('\n').slice(0, 5).join('\n   '));
}

console.log('');
console.log('[2] Testing: require("./core/memory/daemon/session-manager")');
try {
  const sessionManager = require('./core/memory/daemon/session-manager');
  console.log('✅ Loaded successfully!');
  console.log('   Type:', typeof sessionManager);
} catch (err) {
  console.log('❌ FAILED!');
  console.log('   Error:', err.message);
  
  // Show which file it tried to load
  if (err.stack) {
    const lines = err.stack.split('\n');
    const atLines = lines.filter(l => l.includes('at '));
    console.log('');
    console.log('   Tried to load from:');
    atLines.slice(0, 3).forEach(line => {
      console.log('   ' + line.trim());
    });
  }
}

console.log('');
console.log('[3] Testing: require("./core/memory/temporal")');
try {
  const temporal = require('./core/memory/temporal');
  console.log('✅ Loaded successfully!');
  console.log('   Exports:', Object.keys(temporal).join(', '));
} catch (err) {
  console.log('❌ FAILED!');
  console.log('   Error:', err.message);
}

console.log('');
console.log('========================================');
console.log('');
