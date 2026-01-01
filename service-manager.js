const path = require("path");
const logger = require("./utils/logger");
const config = require("./utils/config");

/**
 * NIA V3 - Service Manager
 * 
 * Manages NIA as a Windows service using node-windows.
 * Handles installation, uninstallation, start, stop, and status checking.
 * 
 * Requires: npm install node-windows
 */

class ServiceManager {
  constructor() {
    // Lazy-load node-windows (only needed for install/uninstall)
    this.Service = null;
    
    // Service configuration
    const allConfig = config.getAll();
    this.serviceName = allConfig.service_name;
    this.serviceDisplayName = allConfig.service_display_name;
    this.serviceDescription = allConfig.service_description;
    
    // Path to the daemon script
    this.scriptPath = path.join(config.BASE_DIR, "service-wrapper.js");
    
    logger.info("ServiceManager initialized");
  }
  
  /**
   * Load node-windows library (lazy-loaded to avoid errors if not installed)
   */
  _loadNodeWindows() {
    if (this.Service) return true;
    
    try {
      const nodeWindows = require("node-windows");
      this.Service = nodeWindows.Service;
      return true;
    } catch (err) {
      logger.error("node-windows not installed. Run: npm install node-windows");
      return false;
    }
  }
  
  /**
   * Install NIA as a Windows service
   */
  install() {
    return new Promise((resolve, reject) => {
      if (!this._loadNodeWindows()) {
        return reject(new Error("node-windows package not installed"));
      }
      
      logger.info("Installing NIA V3 as Windows service...");
      
      // Check if service wrapper exists
      const fs = require("fs");
      if (!fs.existsSync(this.scriptPath)) {
        const error = `Service wrapper not found: ${this.scriptPath}`;
        logger.error(error);
        return reject(new Error(error));
      }
      
      // Create service
      const svc = new this.Service({
        name: this.serviceName,
        description: this.serviceDescription,
        script: this.scriptPath,
        nodeOptions: [
          "--max-old-space-size=512" // Limit memory to 512MB
        ],
        // Service will restart automatically if it crashes
        restart: true,
        restartDelay: 5000, // Wait 5 seconds before restarting
        maxRestarts: 3, // Max 3 restarts per hour
        maxRestartDelay: 3600000, // Reset restart count after 1 hour
        // Run as LocalSystem account
        runAsSystem: true
      });
      
      // Event: Service installed
      svc.on("install", () => {
        logger.info(`Service installed: ${this.serviceName}`);
        logger.info(`Display name: ${this.serviceDisplayName}`);
        logger.info(`Description: ${this.serviceDescription}`);
        logger.info(`Script: ${this.scriptPath}`);
        logger.info("Service will start automatically on Windows startup");
        
        // Start the service
        logger.info("Starting service...");
        svc.start();
      });
      
      // Event: Service already exists
      svc.on("alreadyinstalled", () => {
        const msg = "Service already installed";
        logger.warn(msg);
        resolve({ success: false, message: msg });
      });
      
      // Event: Service started
      svc.on("start", () => {
        logger.info("Service started successfully");
        logger.info("NIA is now running as a Windows service!");
        resolve({ success: true, message: "Service installed and started" });
      });
      
      // Event: Error
      svc.on("error", (err) => {
        logger.error(`Service error: ${err.message}`);
        reject(err);
      });
      
      // Install the service
      svc.install();
    });
  }
  
  /**
   * Uninstall the Windows service
   */
  uninstall() {
    return new Promise((resolve, reject) => {
      if (!this._loadNodeWindows()) {
        return reject(new Error("node-windows package not installed"));
      }
      
      logger.info("Uninstalling NIA V3 Windows service...");
      
      // Create service reference
      const svc = new this.Service({
        name: this.serviceName,
        script: this.scriptPath
      });
      
      // Event: Service uninstalled
      svc.on("uninstall", () => {
        logger.info("Service uninstalled successfully");
        logger.info("NIA is no longer running as a Windows service");
        resolve({ success: true, message: "Service uninstalled" });
      });
      
      // Event: Service doesn't exist
      svc.on("alreadyuninstalled", () => {
        const msg = "Service not installed (nothing to uninstall)";
        logger.warn(msg);
        resolve({ success: false, message: msg });
      });
      
      // Event: Error
      svc.on("error", (err) => {
        logger.error(`Uninstall error: ${err.message}`);
        reject(err);
      });
      
      // Uninstall the service
      svc.uninstall();
    });
  }
  
  /**
   * Check if service is installed
   */
  isInstalled() {
    return new Promise((resolve) => {
      // Use Windows SC (Service Control) command to check
      const { exec } = require("child_process");
      
      exec(`sc query ${this.serviceName}`, (error, stdout, stderr) => {
        if (error) {
          // Service doesn't exist
          resolve(false);
        } else {
          // Service exists
          resolve(true);
        }
      });
    });
  }
  
  /**
   * Get service status
   */
  getStatus() {
    return new Promise((resolve, reject) => {
      const { exec } = require("child_process");
      
      exec(`sc query ${this.serviceName}`, (error, stdout, stderr) => {
        if (error) {
          resolve({
            installed: false,
            running: false,
            message: "Service not installed"
          });
          return;
        }
        
        // Parse output
        const isRunning = stdout.includes("RUNNING");
        const isStopped = stdout.includes("STOPPED");
        
        resolve({
          installed: true,
          running: isRunning,
          stopped: isStopped,
          raw: stdout
        });
      });
    });
  }
  
  /**
   * Start the service
   */
  start() {
    return new Promise((resolve, reject) => {
      logger.info("Starting service...");
      
      const { exec } = require("child_process");
      
      exec(`sc start ${this.serviceName}`, (error, stdout, stderr) => {
        if (error) {
          logger.error(`Failed to start service: ${error.message}`);
          reject(error);
        } else {
          logger.info("Service started successfully");
          resolve({ success: true, message: "Service started" });
        }
      });
    });
  }
  
  /**
   * Stop the service
   */
  stop() {
    return new Promise((resolve, reject) => {
      logger.info("Stopping service...");
      
      const { exec } = require("child_process");
      
      exec(`sc stop ${this.serviceName}`, (error, stdout, stderr) => {
        if (error) {
          logger.error(`Failed to stop service: ${error.message}`);
          reject(error);
        } else {
          logger.info("Service stopped successfully");
          resolve({ success: true, message: "Service stopped" });
        }
      });
    });
  }
  
  /**
   * Restart the service
   */
  async restart() {
    logger.info("Restarting service...");
    
    try {
      await this.stop();
      // Wait a moment before starting
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.start();
      return { success: true, message: "Service restarted" };
    } catch (err) {
      logger.error(`Failed to restart service: ${err.message}`);
      throw err;
    }
  }
}

// Export the class
module.exports = ServiceManager;
