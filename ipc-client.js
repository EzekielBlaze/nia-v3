const config = require("./utils/config");

/**
 * NIA V3 - IPC Client (TCP VERSION)
 * 
 * Uses TCP instead of named pipes to match the server.
 * This bypasses Windows service permission issues.
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
} catch (err) {
  console.error(`Failed to import node-ipc: ${err.message}`);
  throw err;
}

class IPCClient {
  constructor() {
    this.isConnected = false;
    this.connectionPromise = null;
    
    // Configure IPC
    const allConfig = config.getAll();
    ipc.config.id = "nia-client-" + Date.now();
    ipc.config.retry = allConfig.ipc_retry_delay || 1000;
    ipc.config.maxRetries = allConfig.ipc_retry_attempts || 5;
    ipc.config.silent = true;
    
    this.serverId = allConfig.ipc_socket_name || 'nia-v3-ipc';
    
    // WINDOWS TCP MODE: Must match server settings!
    if (process.platform === 'win32') {
      this.tcpHost = 'localhost';
      this.tcpPort = allConfig.ipc_port || 41234;
      console.log(`[IPCClient] Using TCP mode: ${this.tcpHost}:${this.tcpPort}`);
    }
  }
  
  /**
   * Connect to the daemon
   */
  connect() {
    if (this.isConnected) {
      return Promise.resolve();
    }
    
    if (this.connectionPromise) {
      return this.connectionPromise;
    }
    
    this.connectionPromise = new Promise((resolve, reject) => {
      // Use TCP connection on Windows
      if (process.platform === 'win32') {
        ipc.connectToNet(this.serverId, this.tcpHost, this.tcpPort, () => {
          ipc.of[this.serverId].on("connect", () => {
            this.isConnected = true;
            resolve();
          });
          
          ipc.of[this.serverId].on("disconnect", () => {
            this.isConnected = false;
          });
          
          ipc.of[this.serverId].on("error", (err) => {
            this.isConnected = false;
            reject(new Error(`IPC connection error: ${err.message || err}`));
          });
        });
      } else {
        // Unix socket for non-Windows
        ipc.connectTo(this.serverId, () => {
          ipc.of[this.serverId].on("connect", () => {
            this.isConnected = true;
            resolve();
          });
          
          ipc.of[this.serverId].on("disconnect", () => {
            this.isConnected = false;
          });
          
          ipc.of[this.serverId].on("error", (err) => {
            this.isConnected = false;
            reject(new Error(`IPC connection error: ${err.message || err}`));
          });
        });
      }
      
      // Timeout after 5 seconds
      setTimeout(() => {
        if (!this.isConnected) {
          reject(new Error("IPC connection timeout"));
        }
      }, 5000);
    });
    
    return this.connectionPromise;
  }
  
  /**
   * Disconnect from the daemon
   */
  disconnect() {
    if (!this.isConnected) return;
    
    try {
      ipc.disconnect(this.serverId);
    } catch (err) {
      // Ignore disconnect errors
    }
    this.isConnected = false;
    this.connectionPromise = null;
  }
  
  /**
   * Send a command and wait for response
   */
  _sendCommand(command, data = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        return reject(new Error("Not connected to daemon"));
      }
      
      const responseEvent = `${command}-response`;
      
      ipc.of[this.serverId].once(responseEvent, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error || "Command failed"));
        }
      });
      
      ipc.of[this.serverId].emit(command, data);
      
      setTimeout(() => {
        reject(new Error("Command timeout"));
      }, 3000);
    });
  }
  
  /**
   * Ping the daemon
   */
  async ping() {
    await this.connect();
    
    return new Promise((resolve, reject) => {
      ipc.of[this.serverId].once("pong", (response) => {
        resolve(response);
      });
      
      ipc.of[this.serverId].emit("ping", {});
      
      setTimeout(() => {
        reject(new Error("Ping timeout"));
      }, 3000);
    });
  }
  
  /**
   * Get daemon status
   */
  async getStatus() {
    await this.connect();
    const response = await this._sendCommand("status");
    return response.data;
  }
  
  /**
   * Get daemon health info
   */
  async getHealth() {
    await this.connect();
    const response = await this._sendCommand("get-health");
    return response.data;
  }
  
  /**
   * Get daemon configuration
   */
  async getConfig() {
    await this.connect();
    const response = await this._sendCommand("get-config");
    return response.data;
  }
  
  /**
   * Shutdown the daemon
   */
  async shutdown() {
    await this.connect();
    const response = await this._sendCommand("shutdown");
    this.disconnect();
    return response;
  }
}

module.exports = IPCClient;
