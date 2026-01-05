const IPCClient = require("./ipc-client");

/**
 * NIA V3 - IPC Connection Diagnostic Tool
 * 
 * Tests the IPC connection to see where it's failing.
 */

async function diagnoseDaemon() {
  console.log("=== NIA V3 IPC Diagnostic ===");
  console.log("Testing connection to daemon...");
  
  const client = new IPCClient();
  
  try {
    console.log("1. Attempting to connect...");
    await client.connect();
    console.log("✓ Connected successfully!");
    
    console.log("2. Testing ping...");
    const pingResult = await client.ping();
    console.log("✓ Ping successful:", pingResult);
    
    console.log("3. Getting daemon status...");
    const status = await client.getStatus();
    console.log("✓ Status retrieved:", status);
    
    console.log("4. Getting health info...");
    const health = await client.getHealth();
    console.log("✓ Health retrieved:", health);
    
    console.log("\n🎉 All tests passed! Daemon is responding properly.");
    
  } catch (err) {
    console.error("❌ Test failed:", err.message);
    console.error("\nPossible causes:");
    console.error("- Daemon service is running but IPC server failed to start");
    console.error("- Socket name mismatch between client and server");
    console.error("- Permissions issue with IPC socket");
    console.error("- Firewall blocking local IPC communication");
  } finally {
    client.disconnect();
  }
}

// Run the diagnostic
diagnoseDaemon().catch(console.error);
