const logger = require("./utils/logger");
const config = require("./utils/config");
const IPCServer = require("./ipc-server");

/**
 * NIA V3 - Daemon Core (WITH IPC)
 * 
 * The main background process that runs 24/7.
 * Now includes IPC server for communication with tray/CLI.
 */

class NiaDaemon {
  constructor() {
    this.isRunning = false;
    this.mainLoopInterval = null;
    this.tickIntervalMs = 5000; // Main loop runs every 5 seconds
    this.startTime = null;
    this.tickCount = 0;
    
    // Health monitoring
    this.lastHealthCheck = null;
    this.healthCheckIntervalMs = 60000; // Health check every minute
    
    // Graceful shutdown flag
    this.isShuttingDown = false;
    
    // IPC server
    this.ipcServer = new IPCServer(this);
    
    logger.info("NiaDaemon initialized");
  }
  
  /**
   * Start the daemon
   */
  async start() {
    if (this.isRunning) {
      logger.warn("Daemon already running");
      return;
    }
    
    logger.info("=== Starting NIA V3 Daemon ===");
    
    // Initialize configuration and directories
    config.initializeDirectories();
    config.validate();
    
    // Set up signal handlers for graceful shutdown
    this._setupSignalHandlers();
    
    // Start IPC server
    this.ipcServer.start();
    
    // Mark as running
    this.isRunning = true;
    this.startTime = new Date();
    
    logger.info(`Daemon started at ${this.startTime.toISOString()}`);
    logger.info(`Tick interval: ${this.tickIntervalMs}ms`);
    
    // Start the main loop
    this._startMainLoop();
    
    // Start health monitoring
    this._startHealthMonitoring();
    
    logger.info("=== NIA V3 Daemon is now running ===");
  }
  
  /**
   * Main loop - runs periodically
   */
  _startMainLoop() {
    this.mainLoopInterval = setInterval(async () => {
      if (!this.isRunning || this.isShuttingDown) return;
      
      try {
        await this._tick();
      } catch (err) {
        logger.error(`Main loop error: ${err.message}`);
        logger.error(err.stack);
      }
    }, this.tickIntervalMs);
    
    logger.info("Main loop started");
  }
  
  /**
   * Single tick of the main loop
   */
  async _tick() {
    this.tickCount++;
    
    // Debug logging (only log every 12 ticks = ~1 minute at 5s intervals)
    if (this.tickCount % 12 === 0) {
      const uptime = this._getUptime();
      logger.debug(`Daemon heartbeat - Tick #${this.tickCount}, Uptime: ${uptime}, IPC clients: ${this.ipcServer.getClientCount()}`);
    }
    
    // Future features will go here
  }
  
  /**
   * Health monitoring
   */
  _startHealthMonitoring() {
    setInterval(() => {
      if (!this.isRunning || this.isShuttingDown) return;
      
      try {
        this._performHealthCheck();
      } catch (err) {
        logger.error(`Health check error: ${err.message}`);
      }
    }, this.healthCheckIntervalMs);
    
    logger.info("Health monitoring started");
  }
  
  /**
   * Perform health check
   */
  _performHealthCheck() {
    this.lastHealthCheck = new Date();
    
    const health = {
      status: "healthy",
      uptime: this._getUptime(),
      tick_count: this.tickCount,
      ipc_clients: this.ipcServer.getClientCount(),
      memory_usage: process.memoryUsage(),
      timestamp: this.lastHealthCheck.toISOString()
    };
    
    // Check memory usage (warn if over 500MB)
    const memoryMB = health.memory_usage.heapUsed / 1024 / 1024;
    if (memoryMB > 500) {
      logger.warn(`High memory usage: ${memoryMB.toFixed(2)} MB`);
      health.status = "warning";
    }
    
    logger.debug(`Health check: ${health.status}, Uptime: ${health.uptime}, Memory: ${memoryMB.toFixed(2)} MB`);
    
    return health;
  }
  
  /**
   * Get human-readable uptime
   */
  _getUptime() {
    if (!this.startTime) return "0s";
    
    const uptimeMs = Date.now() - this.startTime.getTime();
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
  
  /**
   * Set up signal handlers
   */
  _setupSignalHandlers() {
    process.on("SIGINT", () => {
      logger.info("Received SIGINT (Ctrl+C)");
      this.stop();
    });
    
    process.on("SIGTERM", () => {
      logger.info("Received SIGTERM");
      this.stop();
    });
    
    process.on("uncaughtException", (err) => {
      logger.error(`Uncaught exception: ${err.message}`);
      logger.error(err.stack);
    });
    
    process.on("unhandledRejection", (reason, promise) => {
      logger.error(`Unhandled promise rejection: ${reason}`);
    });
    
    logger.info("Signal handlers registered");
  }
  
  /**
   * Stop the daemon gracefully
   */
  async stop() {
    if (!this.isRunning) {
      logger.warn("Daemon is not running");
      return;
    }
    
    if (this.isShuttingDown) {
      logger.warn("Shutdown already in progress");
      return;
    }
    
    logger.info("=== Stopping NIA V3 Daemon ===");
    this.isShuttingDown = true;
    
    // Stop IPC server
    this.ipcServer.stop();
    
    // Stop main loop
    if (this.mainLoopInterval) {
      clearInterval(this.mainLoopInterval);
      this.mainLoopInterval = null;
      logger.info("Main loop stopped");
    }
    
    // Perform cleanup
    await this._cleanup();
    
    // Mark as stopped
    this.isRunning = false;
    
    const uptime = this._getUptime();
    logger.info(`Daemon stopped after ${uptime} uptime (${this.tickCount} ticks)`);
    logger.info("=== NIA V3 Daemon shutdown complete ===");
    
    process.exit(0);
  }
  
  /**
   * Cleanup tasks
   */
  async _cleanup() {
    logger.info("Running cleanup tasks...");
    // Future: Save state, close connections, etc.
    logger.info("Cleanup complete");
  }
  
  /**
   * Get current daemon status
   */
  getStatus() {
    return {
      running: this.isRunning,
      uptime: this._getUptime(),
      tick_count: this.tickCount,
      ipc_clients: this.ipcServer.getClientCount(),
      start_time: this.startTime ? this.startTime.toISOString() : null,
      last_health_check: this.lastHealthCheck ? this.lastHealthCheck.toISOString() : null
    };
  }
}

module.exports = NiaDaemon;
