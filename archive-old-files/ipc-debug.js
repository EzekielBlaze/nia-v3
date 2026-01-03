/**
 * NIA V3 - IPC Debug Tool
 * 
 * Verbose version to debug health/config timeouts.
 */

const IPCClient = require("./ipc-client");

const command = process.argv[2] || "health";

console.log("\n=== NIA V3 IPC Debug ===\n");
console.log(`Testing command: ${command}\n`);

const client = new IPCClient();

async function debugTest() {
  try {
    console.log("[1] Creating client...");
    console.log("    Client created successfully");
    
    console.log("\n[2] Connecting to daemon...");
    await client.connect();
    console.log("    ✓ Connected!");
    
    console.log("\n[3] Sending command:", command);
    console.log("    Waiting for response...");
    
    // Set a flag to track if we got a response
    let gotResponse = false;
    
    // Add a timer to show we're waiting
    const waitInterval = setInterval(() => {
      if (!gotResponse) {
        process.stdout.write(".");
      }
    }, 500);
    
    let result;
    try {
      if (command === "health") {
        result = await client.getHealth();
      } else if (command === "config") {
        result = await client.getConfig();
      } else if (command === "status") {
        result = await client.getStatus();
      } else if (command === "ping") {
        result = await client.ping();
      }
      
      gotResponse = true;
      clearInterval(waitInterval);
      
      console.log("\n    ✓ Response received!");
      console.log("\n[4] Result:");
      console.log(JSON.stringify(result, null, 2));
      
    } catch (err) {
      gotResponse = true;
      clearInterval(waitInterval);
      
      console.log("\n    ✗ Error:", err.message);
      
      // Show more details
      console.log("\n[4] Error Details:");
      console.log("    Type:", err.constructor.name);
      console.log("    Message:", err.message);
      if (err.stack) {
        console.log("    Stack:", err.stack.split('\n')[0]);
      }
    }
    
    console.log("\n[5] Disconnecting...");
    client.disconnect();
    console.log("    ✓ Disconnected\n");
    
  } catch (err) {
    console.error(`\n✗ Fatal Error: ${err.message}\n`);
    
    if (err.message.includes("connection")) {
      console.log("Troubleshooting:");
      console.log("- Is the daemon running? (check: node service-status.js)");
      console.log("- Try: sc start niaservice.exe\n");
    }
    
    process.exit(1);
  }
}

// Run with timeout tracking
console.log("Command timeout: 3 seconds");
console.log("Connection timeout: 5 seconds\n");

debugTest();
