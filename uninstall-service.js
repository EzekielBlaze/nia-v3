/**
 * NIA V3 - Service Uninstallation Script
 * 
 * Run this to uninstall NIA Windows service.
 * Must be run as Administrator.
 */

const ServiceManager = require("./service-manager");
const logger = require("./utils/logger");

console.log("\n=== NIA V3 Service Uninstallation ===\n");
console.log("This will remove NIA from Windows services.");
console.log("NIA will no longer start automatically.\n");

const manager = new ServiceManager();

// Check if installed first
manager.isInstalled()
  .then(installed => {
    if (!installed) {
      console.log("✓ Service is not installed (nothing to uninstall)\n");
      process.exit(0);
      return;
    }
    
    // Uninstall the service
    return manager.uninstall();
  })
  .then(result => {
    if (result) {
      console.log("\n✓ Uninstallation successful!");
      console.log("\nNIA service has been removed.");
      console.log("NIA will no longer start automatically with Windows.\n");
    }
    process.exit(0);
  })
  .catch(err => {
    console.error("\n✗ Uninstallation failed!");
    console.error(`Error: ${err.message}`);
    console.error("\nTroubleshooting:");
    console.error("- Make sure you're running as Administrator");
    console.error("- Try stopping the service first: sc stop NiaService");
    console.error("- Check logs in data/logs/ for details\n");
    process.exit(1);
  });
