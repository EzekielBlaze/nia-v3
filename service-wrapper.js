/**
 * NIA V3 - Service Wrapper
 * 
 * This is the script that runs when NIA is installed as a Windows service.
 * It starts the daemon and keeps it running.
 * 
 * DO NOT run this directly - it's meant to be run by the Windows Service Manager.
 */

const NiaDaemon = require("./daemon");
const logger = require("./utils/logger");

// Create and start daemon
const daemon = new NiaDaemon();

logger.info("Service wrapper starting...");
logger.info("This process is running as a Windows service");

// Start the daemon
daemon.start().catch(err => {
  logger.error(`Failed to start daemon: ${err.message}`);
  logger.error(err.stack);
  process.exit(1);
});

// Log that we're running as a service
logger.info("NIA V3 is now running as a Windows service");
logger.info("The daemon will continue running until the service is stopped");

// Keep the process alive (the daemon handles its own lifecycle)
// This wrapper just ensures the service stays active
