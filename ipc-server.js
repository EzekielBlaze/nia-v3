const net = require('net');
const logger = require('./utils/logger');

/**
 * NIA V3 - IPC Server (TCP-based)
 * 
 * Uses TCP on localhost to avoid Windows pipe permission issues
 * between SYSTEM service and user-level widget.
 */

const IPC_PORT = 19700;

class IPCServer {
  constructor(daemon) {
    this.daemon = daemon;
    this.clients = new Set();
    this.handlers = new Map();
    this.server = null;
    this.port = IPC_PORT;
    
    logger.info(`IPCServer initialized (TCP port ${this.port})`);
  }
  
  /**
   * Register a custom handler for a message type
   */
  registerHandler(type, handler) {
    this.handlers.set(type, handler);
    logger.info(`Registered IPC handler: ${type}`);
  }
  
  /**
   * Start the IPC server
   */
  start() {
    logger.info('Starting IPC server...');
    
    this.server = net.createServer((socket) => {
      this.clients.add(socket);
      logger.debug(`IPC client connected (${this.clients.size} total)`);
      
      let buffer = '';
      
      socket.on('data', async (data) => {
        buffer += data.toString();
        
        // Process complete messages (newline-delimited JSON)
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const messageStr = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          
          try {
            const message = JSON.parse(messageStr);
            await this._handleMessage(message, socket);
          } catch (err) {
            logger.error(`Failed to parse IPC message: ${err.message}`);
          }
        }
      });
      
      socket.on('close', () => {
        this.clients.delete(socket);
        logger.debug(`IPC client disconnected (${this.clients.size} total)`);
      });
      
      socket.on('error', (err) => {
        logger.error(`Socket error: ${err.message}`);
        this.clients.delete(socket);
      });
    });
    
    this.server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${this.port} already in use - another daemon running?`);
      } else {
        logger.error(`Server error: ${err.message}`);
      }
    });
    
    this.server.listen(this.port, '127.0.0.1', () => {
      logger.info(`IPC server listening on 127.0.0.1:${this.port}`);
    });
  }
  
  /**
   * Handle incoming message
   */
  async _handleMessage(message, socket) {
    const { id, type, payload } = message;
    
    logger.debug(`IPC request: ${type} (id: ${id})`);
    
    try {
      let response;
      
      // Check for registered handler
      if (this.handlers.has(type)) {
        const handler = this.handlers.get(type);
        response = await handler(payload || {});
      } else {
        // Built-in handlers
        switch (type) {
          case 'status':
            response = this.daemon.getStatus();
            break;
          case 'health':
            response = this.daemon.getHealth ? this.daemon.getHealth() : { status: 'ok' };
            break;
          case 'ping':
            response = { pong: Date.now() };
            break;
          default:
            response = { error: `Unknown request type: ${type}` };
        }
      }
      
      this._send(socket, { id, success: true, data: response });
      
    } catch (err) {
      logger.error(`IPC request error (${type}): ${err.message}`);
      this._send(socket, { id, success: false, error: err.message });
    }
  }
  
  /**
   * Send message to socket
   */
  _send(socket, data) {
    try {
      socket.write(JSON.stringify(data) + '\n');
    } catch (err) {
      logger.error(`Failed to send: ${err.message}`);
    }
  }
  
  /**
   * Stop the IPC server
   */
  stop() {
    logger.info('Stopping IPC server...');
    
    // Close all client connections
    for (const socket of this.clients) {
      try {
        socket.end();
      } catch (e) {
        // Ignore
      }
    }
    this.clients.clear();
    
    // Close server
    if (this.server) {
      this.server.close();
      this.server = null;
    }
    
    logger.info('IPC server stopped');
  }
  
  /**
   * Get connected client count
   */
  getClientCount() {
    return this.clients.size;
  }
  
  /**
   * Broadcast message to all clients
   */
  broadcast(event, data) {
    const message = JSON.stringify({ event, data }) + '\n';
    for (const socket of this.clients) {
      try {
        socket.write(message);
      } catch (e) {
        logger.error(`Broadcast error: ${e.message}`);
      }
    }
  }
}

module.exports = IPCServer;
