/**
 * API - COMMIT MEMORY
 * Manual memory storage endpoint
 * ~60 lines (Target: <70)
 */

const logger = require('../utils/logger');

class CommitMemoryAPI {
  constructor(daemon) {
    this.daemon = daemon;
  }
  
  /**
   * Register IPC handlers
   */
  register(ipcServer) {
    ipcServer.registerHandler('memory_commit', async (data) => {
      return await this.commitMemory(data);
    });
  }
  
  /**
   * Commit a memory manually
   */
  async commitMemory(data) {
    try {
      const {
        statement,
        type = 'observation',
        topics = [],
        subjects = []
      } = data;
      
      if (!statement) {
        return {
          success: false,
          error: 'Missing statement'
        };
      }
      
      const memory = await this.daemon.memoryIntegrator.storeMemory(statement, {
        type,
        topics,
        subjects,
        trigger: 'manual_button',
        sessionId: this.daemon.sessionManagerIntegrator?.currentSessionId || null,
        turnId: null,
        thinkingLogId: null
      });
      
      if (!memory) {
        return {
          success: false,
          error: 'Failed to store memory'
        };
      }
      
      logger.info(`Memory committed via API: ${memory.id}`);
      
      return {
        success: true,
        memory: {
          id: memory.id,
          statement: memory.statement,
          type: memory.type,
          committedAt: memory.committedAt
        }
      };
      
    } catch (err) {
      logger.error(`Commit memory error: ${err.message}`);
      return {
        success: false,
        error: err.message
      };
    }
  }
}

module.exports = CommitMemoryAPI;
