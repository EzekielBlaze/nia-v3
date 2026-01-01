/**
 * NIA V3 - Widget Launcher
 * 
 * Simple launcher that starts the Electron widget.
 * Just run: node start-widget.js
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('\n=== Starting NIA Desktop Widget ===\n');

// Find electron executable
const electronPath = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');

// Start electron with widget-main.js
const widget = spawn(electronPath, [path.join(__dirname, 'widget-main.js')], {
  stdio: 'inherit'
});

widget.on('close', (code) => {
  console.log(`\nWidget stopped (exit code: ${code})\n`);
});

console.log('✓ Widget starting...');
console.log('✓ Look for the floating NIA widget on your desktop!');
console.log('✓ Press Ctrl+C to stop (or right-click tray → Quit)\n');
