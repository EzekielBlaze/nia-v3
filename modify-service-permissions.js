/**
 * NIA V3 - Service Permission Modifier
 * 
 * WARNING: This modifies Windows service security!
 * Allows your user to control the service without admin rights.
 * 
 * MUST RUN AS ADMINISTRATOR ONCE to apply permissions.
 */

const { exec } = require('child_process');
const os = require('os');

console.log('\n╔═══════════════════════════════════════╗');
console.log('║   NIA Service Permission Modifier    ║');
console.log('╚═══════════════════════════════════════╝\n');

console.log('⚠️  WARNING: This modifies service security!');
console.log('⚠️  Only proceed if you understand the risks.\n');

const username = os.userInfo().username;
console.log(`Current user: ${username}\n`);

/**
 * Get current service security descriptor
 */
function getCurrentSD() {
  return new Promise((resolve, reject) => {
    console.log('[1/4] Getting current service permissions...\n');
    
    exec('sc sdshow niaservice.exe', (err, stdout, stderr) => {
      if (err) {
        reject(new Error('Failed to get service descriptor. Run as Administrator!'));
        return;
      }
      
      const sd = stdout.trim().split('\n').pop();
      console.log('Current Security Descriptor:');
      console.log(sd);
      console.log();
      
      resolve(sd);
    });
  });
}

/**
 * Get user SID
 */
function getUserSID() {
  return new Promise((resolve, reject) => {
    console.log('[2/4] Getting your user SID...\n');
    
    exec(`wmic useraccount where name="${username}" get sid`, (err, stdout, stderr) => {
      if (err) {
        reject(new Error('Failed to get user SID'));
        return;
      }
      
      const lines = stdout.trim().split('\n');
      const sid = lines[lines.length - 1].trim();
      
      console.log(`Your SID: ${sid}`);
      console.log();
      
      resolve(sid);
    });
  });
}

/**
 * Modify security descriptor to add user permissions
 */
function modifySD(currentSD, userSID) {
  console.log('[3/4] Creating new security descriptor...\n');
  
  // Parse the SD
  // Format: D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)...
  
  // We need to add permissions for the user to:
  // - Start/Stop service (RP = Start, WP = Stop)
  // - Query status (LC = Query)
  
  // User permissions: (A;;RPWPLC;;;[USER_SID])
  // RP = SERVICE_START
  // WP = SERVICE_STOP  
  // LC = SERVICE_QUERY_STATUS
  
  const userACE = `(A;;RPWPLC;;;${userSID})`;
  
  // Find where to insert (before the S: section if it exists, or at the end)
  let newSD;
  if (currentSD.includes('S:')) {
    // Insert before integrity section
    newSD = currentSD.replace('S:', userACE + 'S:');
  } else {
    // Just append to DACL
    newSD = currentSD + userACE;
  }
  
  console.log('New Security Descriptor:');
  console.log(newSD);
  console.log();
  console.log('Added permissions for your user:');
  console.log('  - SERVICE_START (can start service)');
  console.log('  - SERVICE_STOP (can stop service)');
  console.log('  - SERVICE_QUERY_STATUS (can check status)');
  console.log();
  
  return newSD;
}

/**
 * Apply new security descriptor
 */
function applySD(newSD) {
  return new Promise((resolve, reject) => {
    console.log('[4/4] Applying new permissions...\n');
    
    exec(`sc sdset niaservice.exe "${newSD}"`, (err, stdout, stderr) => {
      if (err) {
        reject(new Error('Failed to apply permissions. Run as Administrator!'));
        return;
      }
      
      console.log('✓ Permissions applied successfully!');
      resolve();
    });
  });
}

/**
 * Main process
 */
async function main() {
  try {
    const currentSD = await getCurrentSD();
    const userSID = await getUserSID();
    const newSD = modifySD(currentSD, userSID);
    await applySD(newSD);
    
    console.log('\n╔═══════════════════════════════════════╗');
    console.log('║   Permission Modification Complete!  ║');
    console.log('╚═══════════════════════════════════════╝\n');
    
    console.log('✓ Your user can now control the service without admin!');
    console.log('✓ Test it: Close widget, relaunch normally (not as admin)');
    console.log('✓ Restart Daemon should now work!\n');
    
    console.log('⚠️  Note: This only applies to NIA service.');
    console.log('⚠️  Other services still need admin as normal.\n');
    
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    console.log('\n💡 Make sure you:');
    console.log('   1. Run this script as Administrator');
    console.log('   2. Service is installed (niaservice.exe)');
    console.log('   3. You\'re in the correct directory\n');
  }
}

main();
