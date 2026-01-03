/**
 * NIA V3 - Tray Launcher
 * 
 * Starts the system tray application.
 */

const NiaTray = require("./nia-tray");
const logger = require("./utils/logger");

console.log("\n=== Starting NIA Tray Application ===\n");

const tray = new NiaTray();

// Start the tray
tray.start()
  .then(() => {
    console.log("✓ Tray application started!");
    console.log("\nNIA icon should now appear in your system tray.");
    console.log("Right-click the icon to access the menu.\n");
    console.log("Press Ctrl+C to stop the tray application.\n");
  })
  .catch(err => {
    console.error(`✗ Failed to start tray: ${err.message}`);
    console.error("\nTroubleshooting:");
    console.error("- Make sure systray2 is installed: npm install systray2");
    console.error("- Check that nia-icon.ico exists in the project folder");
    console.error("- Run as Administrator if you get permission errors\n");
    process.exit(1);
  });

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\nStopping tray application...");
  tray.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n\nStopping tray application...");
  tray.stop();
  process.exit(0);
});
