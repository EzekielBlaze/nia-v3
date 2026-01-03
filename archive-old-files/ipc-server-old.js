const ipc = require("node-ipc").default;
const logger = require("./utils/logger");
const config = require("./utils/config");

/**
 * NIA V3 - IPC Server (FINAL WORKING VERSION)
 * 
 * Runs inside the daemon process and listens for commands.
 */

class IPCServer {
  constructor(daemon) {
    this.daemon = daemon; // Reference to the main daemon instance
    this.isRunning = false;
    this.clientCount = 0;
    
    // Configure IPC
    const allConfig = config.getAll();
    ipc.config.id = allConfig.ipc_socket_name;
    ipc.config.retry = 1500;
    ipc.config.silent = true; // Don't spam console with IPC logs
    
    logger.info("IPCServer initialized");
  }
  
  /**
   * Start the IPC server
   */
  start() {
    if (this.isRunning) {
      logger.warn("IPC server already running");
      return;
    }
    
    logger.info("Starting IPC server...");
    
    ipc.serve(() => {
      // Event: Client connected
      ipc.server.on("connect", (socket) => {
        this.clientCount++;
        logger.debug(`IPC client connected (total: ${this.clientCount})`);
      });
      
      // Event: Client disconnected
      ipc.server.on("socket.disconnected", (socket, destroyedSocketID) => {
        this.clientCount--;
        logger.debug(`IPC client disconnected (total: ${this.clientCount})`);
      });
      
      // Command: ping
      ipc.server.on("ping", (data, socket) => {
        logger.debug("IPC: Received ping");
        ipc.server.emit(socket, "pong", {
          success: true,
          timestamp: new Date().toISOString()
        });
      });
      
      // Command: status
      ipc.server.on("status", (data, socket) => {
        logger.debug("IPC: Received status request");
        
        const status = this.daemon.getStatus();
        
        ipc.server.emit(socket, "status-response", {
          success: true,
          data: status
        });
      });
      
      // Command: shutdown
      ipc.server.on("shutdown", (data, socket) => {
        logger.info("IPC: Received shutdown command");
        
        // Acknowledge before shutting down
        ipc.server.emit(socket, "shutdown-response", {
          success: true,
          message: "Daemon shutting down..."
        });
        
        // Shutdown after a brief delay (let response send)
        setTimeout(() => {
          this.daemon.stop();
        }, 500);
      });
      
      // Command: get-config
      ipc.server.on("get-config", (data, socket) => {
        logger.debug("IPC: Received get-config request");
        
        const allConfig = config.getAll();
        
        ipc.server.emit(socket, "config-response", {
          success: true,
          data: allConfig
        });
      });
      
      // Command: get-health
      ipc.server.on("get-health", (data, socket) => {
        logger.debug("IPC: Received health check request");
        
        const health = this.daemon._performHealthCheck();
        
        ipc.server.emit(socket, "health-response", {
          success: true,
          data: health
        });
      });
      
      logger.info("IPC server handlers registered");
    });
    
    ipc.server.start();
    this.isRunning = true;
    
    logger.info(`IPC server started: ${ipc.config.id}`);
  }
  
  /**
   * Stop the IPC server
   */
  stop() {
    if (!this.isRunning) {
      logger.warn("IPC server not running");
      return;
    }
    
    logger.info("Stopping IPC server...");
    
    ipc.server.stop();
    this.isRunning = false;
    
    logger.info("IPC server stopped");
  }
  
  /**
   * Get current connection count
   */
  getClientCount() {
    return this.clientCount;
  }
}

module.exports = IPCServer;
