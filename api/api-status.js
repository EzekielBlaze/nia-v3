/**
 * API - STATUS
 * System health and status information
 * ~75 lines (Target: <80)
 */

const logger = require('../utils/logger');

class StatusAPI {
  constructor(daemon) {
    this.daemon = daemon;
  }
  
  /**
   * Register IPC handlers
   */
  register(ipcServer) {
    ipcServer.registerHandler('system_status', async () => {
      return this.getSystemStatus();
    });
    
    ipcServer.registerHandler('memory_system_status', async () => {
      return this.getMemorySystemStatus();
    });
  }
  
  /**
   * Get complete system status
   */
  getSystemStatus() {
    try {
      const status = {
        daemon: this.daemon.getStatus(),
        session: this.daemon.sessionManagerIntegrator.getCurrentSession(),
        uptime: this.daemon.sessionManagerIntegrator.getUptimeString(),
        memory: this.daemon.memoryIntegrator.getStats(),
        beliefs: this.daemon.beliefIntegrator.getStats(),
        corrections: this.daemon.correctionIntegrator.getStats(),
        identity: this.daemon.identity ? {
          loaded: true,
          hasAnchors: this.daemon.identity.getCoreAnchors().length > 0
        } : {
          loaded: false
        }
      };
      
      return {
        success: true,
        status
      };
      
    } catch (err) {
      logger.error(`System status error: ${err.message}`);
      return {
        success: false,
        error: err.message
      };
    }
  }
  
  /**
   * Get memory system specific status
   */
  getMemorySystemStatus() {
    try {
      const status = {
        embedder: {
          memory: this.daemon.memoryIntegrator.embedderAvailable,
          belief: this.daemon.beliefIntegrator.embedderAvailable
        },
        semanticSearch: this.daemon.memoryIntegrator.semanticRecall !== null,
        vectorStore: {
          available: this.daemon.memoryIntegrator.vectorStore !== null
        },
        stats: {
          memory: this.daemon.memoryIntegrator.getStats(),
          beliefs: this.daemon.beliefIntegrator.getStats(),
          corrections: this.daemon.correctionIntegrator.getStats()
        }
      };
      
      return {
        success: true,
        status
      };
      
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }
}

module.exports = StatusAPI;
