/**
 * NIA V3 - Service Auto-Start Checker
 * 
 * Verifies that the daemon service is set to auto-start with Windows.
 * Fixes it if needed.
 */

const { exec } = require('child_process');

console.log('\n╔═══════════════════════════════════════╗');
console.log('║   NIA Service Auto-Start Check       ║');
console.log('╚═══════════════════════════════════════╝\n');

/**
 * Check service configuration
 */
function checkService() {
  return new Promise((resolve, reject) => {
    exec('sc qc niaservice.exe', (err, stdout) => {
      if (err) {
        reject(new Error('Service not installed'));
        return;
      }
      
      console.log('Service configuration:');
      console.log('─'.repeat(40));
      
      // Parse output
      const lines = stdout.split('\n');
      lines.forEach(line => {
        if (line.includes('START_TYPE')) {
          console.log(line.trim());
          
          if (line.includes('AUTO_START')) {
            console.log('✓ Auto-start: ENABLED');
            resolve(true);
          } else {
            console.log('❌ Auto-start: DISABLED');
            resolve(false);
          }
        }
      });
    });
  });
}

/**
 * Enable auto-start
 */
function enableAutoStart() {
  return new Promise((resolve, reject) => {
    console.log('\nEnabling auto-start...');
    
    exec('sc config niaservice.exe start= auto', (err, stdout) => {
      if (err) {
        if (err.message.includes('Access is denied')) {
          reject(new Error('Access denied - run as Administrator'));
        } else {
          reject(err);
        }
        return;
      }
      
      console.log('✓ Auto-start enabled!');
      resolve(true);
    });
  });
}

/**
 * Check if service is currently running
 */
function checkRunning() {
  return new Promise((resolve) => {
    exec('sc query niaservice.exe', (err, stdout) => {
      if (err) {
        resolve(false);
        return;
      }
      
      const running = stdout.includes('RUNNING');
      resolve(running);
    });
  });
}

/**
 * Main check
 */
async function main() {
  try {
    // Check configuration
    console.log('[1/3] Checking service configuration...\n');
    const autoStartEnabled = await checkService();
    
    if (!autoStartEnabled) {
      console.log('\n[2/3] Fixing auto-start setting...');
      await enableAutoStart();
    } else {
      console.log('\n[2/3] Auto-start is already enabled ✓');
    }
    
    // Check if running
    console.log('\n[3/3] Checking service status...\n');
    const running = await checkRunning();
    
    if (running) {
      console.log('✓ Service is currently RUNNING');
    } else {
      console.log('⚠️  Service is NOT running');
      console.log('\nTo start it now:');
      console.log('  sc start niaservice.exe\n');
    }
    
    // Summary
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║   Summary                             ║');
    console.log('╚═══════════════════════════════════════╝\n');
    
    console.log('✓ Service installed: YES');
    console.log(`✓ Auto-start: ${autoStartEnabled ? 'ENABLED' : 'FIXED'}`);
    console.log(`✓ Currently running: ${running ? 'YES' : 'NO'}`);
    
    console.log('\nThe service will auto-start when Windows boots.');
    console.log('No manual action needed on startup! ✓\n');
    
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    
    if (err.message.includes('Administrator')) {
      console.log('\n💡 Solution:');
      console.log('   Right-click Command Prompt → Run as Administrator');
      console.log('   Then run this script again\n');
    } else if (err.message.includes('not installed')) {
      console.log('\n💡 Service not installed yet!');
      console.log('   Run: node install-service.js\n');
    }
  }
}

main();
