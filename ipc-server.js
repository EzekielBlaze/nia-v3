const logger = require("./utils/logger");
const config = require("./utils/config");

/**
 * NIA V3 - IPC Server (TCP VERSION)
 * 
 * Uses TCP instead of named pipes to bypass Windows service permission issues.
 * IMPORTANT: Uses serveNet() for TCP mode, not serve()!
 */

// Robust node-ipc import
let ipc;
try {
  const nodeIPC = require("node-ipc");
  if (nodeIPC.default && nodeIPC.default.config) {
    ipc = nodeIPC.default;
  } else if (nodeIPC.config) {
    ipc = nodeIPC;
  } else {
    throw new Error("Could not find valid IPC interface");
  }
  logger.info("node-ipc imported successfully");
} catch (err) {
  logger.error(`Failed to import node-ipc: ${err.message}`);
  throw err;
}

class IPCServer {
  constructor(daemon) {
    this.daemon = daemon;
    this.isRunning = false;
    this.clientCount = 0;
    
    // Configure IPC
    const allConfig = config.getAll();
    ipc.config.id = allConfig.ipc_socket_name || 'nia-v3-ipc';
    ipc.config.retry = 1500;
    ipc.config.silent = true;
    
    // TCP settings for Windows
    this.tcpHost = 'localhost';
    this.tcpPort = allConfig.ipc_port || 41234;
    this.usesTcp = (process.platform === 'win32');
    
    logger.info("IPCServer initialized");
    logger.info(`IPC socket name: ${ipc.config.id}`);
    if (this.usesTcp) {
      logger.info(`TCP Mode: ${this.tcpHost}:${this.tcpPort}`);
    }
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
    
    try {
      // Define the callback for when server is ready
      const serverCallback = () => {
        logger.info("IPC server callback fired - registering handlers...");
        
        // Event: Client connected
        ipc.server.on("connect", (socket) => {
          this.clientCount++;
          logger.info(`IPC client connected (total: ${this.clientCount})`);
        });
        
        // Event: Client disconnected
        ipc.server.on("socket.disconnected", (socket, destroyedSocketID) => {
          this.clientCount--;
          logger.info(`IPC client disconnected (total: ${this.clientCount})`);
        });
        
        // Command: ping
        ipc.server.on("ping", (data, socket) => {
          logger.info("IPC: Received PING command");
          ipc.server.emit(socket, "pong", {
            success: true,
            timestamp: new Date().toISOString()
          });
        });
        
        // Command: status
        ipc.server.on("status", (data, socket) => {
          logger.info("IPC: Received STATUS command");
          try {
            const status = this.daemon.getStatus();
            ipc.server.emit(socket, "status-response", {
              success: true,
              data: status
            });
          } catch (err) {
            logger.error(`IPC: Status error: ${err.message}`);
            ipc.server.emit(socket, "status-response", {
              success: false,
              error: err.message
            });
          }
        });
        
        // Command: get-health
        ipc.server.on("get-health", (data, socket) => {
          logger.info("IPC: Received GET-HEALTH command");
          try {
            const health = this.daemon._performHealthCheck();
            ipc.server.emit(socket, "get-health-response", {
              success: true,
              data: health
            });
          } catch (err) {
            logger.error(`IPC: Health error: ${err.message}`);
            ipc.server.emit(socket, "get-health-response", {
              success: false,
              error: err.message
            });
          }
        });
        
        // Command: get-config
        ipc.server.on("get-config", (data, socket) => {
          logger.info("IPC: Received GET-CONFIG command");
          try {
            const allConfig = config.getAll();
            ipc.server.emit(socket, "get-config-response", {
              success: true,
              data: allConfig
            });
          } catch (err) {
            logger.error(`IPC: Config error: ${err.message}`);
            ipc.server.emit(socket, "get-config-response", {
              success: false,
              error: err.message
            });
          }
        });
        
        // Command: shutdown
        ipc.server.on("shutdown", (data, socket) => {
          logger.info("IPC: Received SHUTDOWN command");
          ipc.server.emit(socket, "shutdown-response", {
            success: true,
            message: "Daemon shutting down..."
          });
          setTimeout(() => {
            this.daemon.stop();
          }, 500);
        });
        
        logger.info("IPC server handlers registered");
      };
      
      // Use TCP mode on Windows, Unix sockets otherwise
      if (this.usesTcp) {
        logger.info(`Starting TCP server on ${this.tcpHost}:${this.tcpPort}...`);
        ipc.serveNet(this.tcpHost, this.tcpPort, serverCallback);
      } else {
        logger.info("Starting Unix socket server...");
        ipc.serve(serverCallback);
      }
      
      ipc.server.start();
      this.isRunning = true;
      
      logger.info(`✓ IPC server started successfully!`);
      logger.info(`✓ Socket ID: ${ipc.config.id}`);
      if (this.usesTcp) {
        logger.info(`✓ Listening on TCP ${this.tcpHost}:${this.tcpPort}`);
      }
      
    } catch (err) {
      logger.error(`Failed to start IPC server: ${err.message}`);
      logger.error(err.stack);
      throw err;
    }
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
    
    try {
      ipc.server.stop();
      this.isRunning = false;
      logger.info("IPC server stopped");
    } catch (err) {
      logger.error(`Error stopping IPC server: ${err.message}`);
    }
  }
  
  /**
   * Get current connection count
   */
  getClientCount() {
    return this.clientCount;
  }
}

module.exports = IPCServer;
