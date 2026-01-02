const net = require('net');

/**
 * NIA V3 - IPC Client (TCP-based)
 * 
 * Uses TCP on localhost to communicate with daemon.
 */

const IPC_PORT = 19700;

class IPCClient {
  constructor() {
    this.port = IPC_PORT;
    this.host = '127.0.0.1';
    this.socket = null;
    this.isConnected = false;
    this.pendingRequests = new Map();
    this.requestCounter = 0;
    this.buffer = '';
  }
  
  /**
   * Connect to the daemon
   */
  connect(timeout = 5000) {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        resolve();
        return;
      }
      
      const timer = setTimeout(() => {
        if (this.socket) {
          this.socket.destroy();
        }
        reject(new Error('Connection timeout'));
      }, timeout);
      
      this.socket = net.createConnection({ port: this.port, host: this.host }, () => {
        clearTimeout(timer);
        this.isConnected = true;
        this._setupDataHandler();
        resolve();
      });
      
      this.socket.on('error', (err) => {
        clearTimeout(timer);
        this.isConnected = false;
        reject(err);
      });
      
      this.socket.on('close', () => {
        this.isConnected = false;
        // Reject any pending requests
        for (const [id, pending] of this.pendingRequests) {
          pending.reject(new Error('Connection closed'));
        }
        this.pendingRequests.clear();
      });
    });
  }
  
  /**
   * Set up handler for incoming data
   */
  _setupDataHandler() {
    this.socket.on('data', (data) => {
      this.buffer += data.toString();
      
      // Process complete messages (newline-delimited JSON)
      let newlineIndex;
      while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
        const messageStr = this.buffer.slice(0, newlineIndex);
        this.buffer = this.buffer.slice(newlineIndex + 1);
        
        try {
          const message = JSON.parse(messageStr);
          this._handleResponse(message);
        } catch (err) {
          console.error('Failed to parse response:', err.message);
        }
      }
    });
  }
  
  /**
   * Handle response from server
   */
  _handleResponse(message) {
    const { id, success, data, error } = message;
    
    const pending = this.pendingRequests.get(id);
    if (pending) {
      this.pendingRequests.delete(id);
      
      if (success) {
        pending.resolve(data);
      } else {
        pending.reject(new Error(error || 'Request failed'));
      }
    }
  }
  
  /**
   * Disconnect from the daemon
   */
  disconnect() {
    if (!this.isConnected) return;
    
    if (this.socket) {
      this.socket.end();
      this.socket = null;
    }
    this.isConnected = false;
    this.pendingRequests.clear();
    this.buffer = '';
  }
  
  /**
   * Get daemon status
   */
  getStatus() {
    return this.request('status', {});
  }
  
  /**
   * Get daemon health
   */
  getHealth() {
    return this.request('health', {});
  }
  
  /**
   * Send a custom request
   */
  request(type, payload, timeout = 30000) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('Not connected'));
        return;
      }
      
      const id = `req-${++this.requestCounter}-${Date.now()}`;
      
      // Set up timeout
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${type}`));
      }, timeout);
      
      // Store pending request
      this.pendingRequests.set(id, {
        resolve: (data) => {
          clearTimeout(timer);
          resolve(data);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      });
      
      // Send request
      const message = JSON.stringify({ id, type, payload }) + '\n';
      this.socket.write(message);
    });
  }
  
  /**
   * Send chat message
   */
  chat(message, context = {}) {
    return this.request('chat', { message, context }, 60000); // 60s timeout for LLM
  }
  
  /**
   * Get identity status
   */
  getIdentityStatus() {
    return this.request('identity_status', {});
  }
  
  /**
   * Check if action is allowed
   */
  checkAction(domain, action) {
    return this.request('check_action', { domain, action });
  }
  
  /**
   * Get identity context
   */
  getIdentityContext() {
    return this.request('identity_context', {});
  }
  
  /**
   * Ping the daemon
   */
  ping() {
    return this.request('ping', {}, 5000);
  }
}

module.exports = IPCClient;
