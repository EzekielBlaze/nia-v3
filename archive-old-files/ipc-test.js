/**
 * NIA V3 - IPC Test Tool
 * 
 * Command-line tool to test IPC communication with the daemon.
 * 
 * Usage:
 *   node ipc-test.js ping
 *   node ipc-test.js status
 *   node ipc-test.js health
 *   node ipc-test.js config
 */

const IPCClient = require("./ipc-client");

const command = process.argv[2] || "status";

console.log("\n=== NIA V3 IPC Test ===\n");
console.log(`Command: ${command}\n`);

const client = new IPCClient();

async function run() {
  try {
    console.log("Connecting to daemon...");
    await client.connect();
    console.log("✓ Connected!\n");
    
    switch (command) {
      case "ping":
        console.log("Sending ping...");
        const pong = await client.ping();
        console.log("✓ Pong received!");
        console.log(`Timestamp: ${pong.timestamp}\n`);
        break;
        
      case "status":
        console.log("Requesting status...");
        const status = await client.getStatus();
        console.log("✓ Status received!\n");
        console.log(`Running: ${status.running}`);
        console.log(`Uptime: ${status.uptime}`);
        console.log(`Ticks: ${status.tick_count}`);
        console.log(`IPC clients: ${status.ipc_clients}`);
        console.log(`Started: ${status.start_time}`);
        console.log(`Last health check: ${status.last_health_check}\n`);
        break;
        
      case "health":
        console.log("Requesting health info...");
        const health = await client.getHealth();
        console.log("✓ Health info received!\n");
        console.log(`Status: ${health.status}`);
        console.log(`Uptime: ${health.uptime}`);
        console.log(`Ticks: ${health.tick_count}`);
        console.log(`Memory (heap): ${(health.memory_usage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
        console.log(`Timestamp: ${health.timestamp}\n`);
        break;
        
      case "config":
        console.log("Requesting configuration...");
        const cfg = await client.getConfig();
        console.log("✓ Configuration received!\n");
        console.log(JSON.stringify(cfg, null, 2));
        console.log();
        break;
        
      default:
        console.log(`Unknown command: ${command}`);
        console.log("\nAvailable commands:");
        console.log("  ping   - Check if daemon is alive");
        console.log("  status - Get daemon status");
        console.log("  health - Get health information");
        console.log("  config - Get configuration\n");
    }
    
    client.disconnect();
    console.log("Disconnected.\n");
    
  } catch (err) {
    console.error(`\n✗ Error: ${err.message}\n`);
    
    if (err.message.includes("connection")) {
      console.log("Troubleshooting:");
      console.log("- Is the daemon running?");
      console.log("- Check: node service-status.js");
      console.log("- If service is stopped: sc start niaservice.exe\n");
    }
    
    process.exit(1);
  }
}

run();
