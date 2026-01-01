/**
 * NIA V3 - Service Installation Script
 * 
 * Run this to install NIA as a Windows service.
 * Must be run as Administrator.
 */

const ServiceManager = require("./service-manager");
const logger = require("./utils/logger");

console.log("\n=== NIA V3 Service Installation ===\n");
console.log("This will install NIA as a Windows service.");
console.log("The service will start automatically when Windows boots.\n");

const manager = new ServiceManager();

// Install the service
manager.install()
  .then(result => {
    console.log("\n✓ Installation successful!");
    console.log("\nWhat happens next:");
    console.log("- NIA is now running in the background");
    console.log("- NIA will start automatically when Windows starts");
    console.log("- You can manage the service from Windows Services (services.msc)");
    console.log("\nService name: NiaService");
    console.log("Display name: NIA V3 Daemon\n");
    process.exit(0);
  })
  .catch(err => {
    console.error("\n✗ Installation failed!");
    console.error(`Error: ${err.message}`);
    console.error("\nTroubleshooting:");
    console.error("- Make sure you're running as Administrator");
    console.error("- Check that node-windows is installed: npm install node-windows");
    console.error("- Check logs in data/logs/ for details\n");
    process.exit(1);
  });
