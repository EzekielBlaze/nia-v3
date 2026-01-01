const NiaDaemon = require("./daemon");
const logger = require("./utils/logger");

// Create daemon instance
const daemon = new NiaDaemon();

// Start it up
logger.info("Starting NIA daemon...");
daemon.start().catch(err => {
  logger.error(`Failed to start daemon: ${err.message}`);
  process.exit(1);
});

// Log status every 10 seconds
setInterval(() => {
  const status = daemon.getStatus();
  console.log("\n--- Current Status ---");
  console.log(`Running: ${status.running}`);
  console.log(`Uptime: ${status.uptime}`);
  console.log(`Ticks: ${status.tick_count}`);
  console.log("Press Ctrl+C to stop");
}, 10000);