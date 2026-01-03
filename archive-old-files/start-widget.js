/**
 * NIA V3 - Widget Launcher (FIXED)
 * 
 * Properly launches the Electron widget.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('\n=== Starting NIA Desktop Widget ===\n');

// Check if electron is installed
const electronModule = path.join(__dirname, 'node_modules', 'electron');
if (!fs.existsSync(electronModule)) {
  console.error('ERROR: Electron not installed!');
  console.error('Run: npm install electron');
  process.exit(1);
}

// Use electron CLI (works on all platforms)
const electron = require('electron');
const widgetPath = path.join(__dirname, 'widget-main.js');

console.log('Starting Electron...');
console.log(`Widget: ${widgetPath}`);

// Spawn electron process
const widget = spawn(electron, [widgetPath], {
  stdio: 'inherit',
  env: { ...process.env }
});

widget.on('error', (err) => {
  console.error(`\nWidget error: ${err.message}\n`);
});

widget.on('close', (code) => {
  console.log(`\nWidget stopped (exit code: ${code})\n`);
  process.exit(code);
});

console.log('✓ Widget starting...');
console.log('✓ Look for the floating NIA widget on your desktop!');
console.log('✓ Press Ctrl+C to stop\n');
