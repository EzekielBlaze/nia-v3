const SysTray = require("systray2").default;
const path = require("path");
const { exec } = require("child_process");
const IPCClient = require("./ipc-client");
const logger = require("./utils/logger");

/**
 * NIA V3 - System Tray Application
 * 
 * Provides a system tray icon with menu for easy access to NIA.
 * Communicates with the daemon via IPC.
 */

class NiaTray {
  constructor() {
    this.ipcClient = new IPCClient();
    this.tray = null;
    this.statusCheckInterval = null;
    this.isConnected = false;
    
    // Tray icon path (will be set when icon is available)
    this.iconPath = path.join(__dirname, "nia-icon.ico");
    
    logger.info("NiaTray initialized");
  }
  
  /**
   * Start the tray application
   */
  async start() {
    logger.info("Starting NIA tray application...");
    
    try {
      // Create tray icon
      this.tray = new SysTray({
        menu: this._buildMenu(),
        debug: false,
        copyDir: true,
        icon: this.iconPath
      });
      
      // Handle menu clicks
      this.tray.onClick((action) => {
        this._handleMenuClick(action);
      });
      
      logger.info("Tray icon created");
      
      // Start status checking
      this._startStatusChecking();
      
      // Try to connect to daemon
      await this._checkDaemonStatus();
      
    } catch (err) {
      logger.error(`Failed to start tray: ${err.message}`);
      throw err;
    }
  }
  
  /**
   * Build the tray menu
   */
  _buildMenu() {
    return {
      icon: this.iconPath,
      title: "NIA",
      tooltip: "NIA - AI Companion (Starting...)",
      items: [
        {
          title: "Open Chat",
          tooltip: "Open NIA chat in browser",
          checked: false,
          enabled: true,
          click: "open_chat"
        },
        {
          title: "separator"
        },
        {
          title: "View Status",
          tooltip: "Show daemon status",
          checked: false,
          enabled: true,
          click: "view_status"
        },
        {
          title: "View Logs",
          tooltip: "Open log folder",
          checked: false,
          enabled: true,
          click: "view_logs"
        },
        {
          title: "separator"
        },
        {
          title: "Settings",
          tooltip: "Open settings",
          checked: false,
          enabled: true,
          click: "settings"
        },
        {
          title: "separator"
        },
        {
          title: "Restart Daemon",
          tooltip: "Restart the NIA service",
          checked: false,
          enabled: true,
          click: "restart_daemon"
        },
        {
          title: "separator"
        },
        {
          title: "Quit",
          tooltip: "Exit tray application",
          checked: false,
          enabled: true,
          click: "quit"
        }
      ]
    };
  }
  
  /**
   * Handle menu clicks
   */
  _handleMenuClick(action) {
    logger.info(`Menu clicked: ${action.item.click}`);
    
    switch (action.item.click) {
      case "open_chat":
        this._openChat();
        break;
        
      case "view_status":
        this._showStatus();
        break;
        
      case "view_logs":
        this._openLogs();
        break;
        
      case "settings":
        this._openSettings();
        break;
        
      case "restart_daemon":
        this._restartDaemon();
        break;
        
      case "quit":
        this._quit();
        break;
    }
  }
  
  /**
   * Open chat in browser
   */
  _openChat() {
    // TODO: In Phase 7, this will open the actual chat interface
    // For now, just show a message
    logger.info("Open chat requested (not implemented yet)");
    exec(`start http://localhost:3000`, (err) => {
      if (err) {
        logger.error(`Failed to open chat: ${err.message}`);
      }
    });
  }
  
  /**
   * Show status dialog
   */
  async _showStatus() {
    try {
      await this.ipcClient.connect();
      const status = await this.ipcClient.getStatus();
      const health = await this.ipcClient.getHealth();
      
      const message = `
NIA Status:
-----------
Running: ${status.running ? 'Yes' : 'No'}
Uptime: ${status.uptime}
Ticks: ${status.tick_count}
Memory: ${(health.memory_usage.heapUsed / 1024 / 1024).toFixed(2)} MB
Status: ${health.status}

Started: ${new Date(status.start_time).toLocaleString()}
Last Health Check: ${new Date(status.last_health_check).toLocaleString()}
      `.trim();
      
      // Show Windows message box
      exec(`msg * "${message}"`, (err) => {
        if (err) {
          logger.error(`Failed to show status: ${err.message}`);
        }
      });
      
      this.ipcClient.disconnect();
      
    } catch (err) {
      logger.error(`Failed to get status: ${err.message}`);
      exec(`msg * "Failed to get daemon status. Is the service running?"`, () => {});
    }
  }
  
  /**
   * Open logs folder
   */
  _openLogs() {
    const logsPath = path.join(__dirname, "data", "logs");
    exec(`explorer "${logsPath}"`, (err) => {
      if (err) {
        logger.error(`Failed to open logs: ${err.message}`);
      }
    });
  }
  
  /**
   * Open settings
   */
  _openSettings() {
    // TODO: In future, open settings GUI
    // For now, open config.json in notepad
    const configPath = path.join(__dirname, "config.json");
    exec(`notepad "${configPath}"`, (err) => {
      if (err) {
        logger.error(`Failed to open settings: ${err.message}`);
      }
    });
  }
  
  /**
   * Restart daemon
   */
  _restartDaemon() {
    logger.info("Restarting daemon...");
    
    exec("sc stop niaservice.exe && timeout /t 3 && sc start niaservice.exe", (err, stdout) => {
      if (err) {
        logger.error(`Failed to restart daemon: ${err.message}`);
        exec(`msg * "Failed to restart daemon. Try running as Administrator."`, () => {});
      } else {
        logger.info("Daemon restarted successfully");
        exec(`msg * "Daemon restarted successfully!"`, () => {});
        
        // Reconnect after restart
        setTimeout(() => {
          this._checkDaemonStatus();
        }, 5000);
      }
    });
  }
  
  /**
   * Quit tray application
   */
  _quit() {
    logger.info("Quitting tray application...");
    
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
    }
    
    if (this.ipcClient) {
      this.ipcClient.disconnect();
    }
    
    process.exit(0);
  }
  
  /**
   * Start periodic status checking
   */
  _startStatusChecking() {
    // Check status every 30 seconds
    this.statusCheckInterval = setInterval(async () => {
      await this._checkDaemonStatus();
    }, 30000);
    
    logger.info("Status checking started (every 30s)");
  }
  
  /**
   * Check daemon status and update tooltip
   */
  async _checkDaemonStatus() {
    try {
      await this.ipcClient.connect();
      const status = await this.ipcClient.getStatus();
      
      this.isConnected = true;
      
      // Update tooltip
      const tooltip = `NIA - Running (${status.uptime})`;
      this._updateTooltip(tooltip);
      
      this.ipcClient.disconnect();
      
      logger.debug(`Status check: Running, uptime ${status.uptime}`);
      
    } catch (err) {
      this.isConnected = false;
      
      // Update tooltip to show disconnected
      this._updateTooltip("NIA - Not Running");
      
      logger.debug("Status check: Daemon not responding");
    }
  }
  
  /**
   * Update tray tooltip
   */
  _updateTooltip(text) {
    if (this.tray) {
      this.tray.sendAction({
        type: "update-item",
        item: {
          tooltip: text
        }
      });
    }
  }
  
  /**
   * Stop the tray application
   */
  stop() {
    logger.info("Stopping tray application...");
    
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval);
    }
    
    if (this.tray) {
      this.tray.kill();
    }
    
    logger.info("Tray application stopped");
  }
}

module.exports = NiaTray;
