/**
 * API - RECALL MEMORIES
 * Search and retrieve memories
 * ~70 lines (Target: <80)
 */

const logger = require('../utils/logger');

class RecallMemoriesAPI {
  constructor(daemon) {
    this.daemon = daemon;
  }
  
  /**
   * Register IPC handlers
   */
  register(ipcServer) {
    ipcServer.registerHandler('recall_memories', async (data) => {
      return await this.recallMemories(data);
    });
    
    ipcServer.registerHandler('memory_stats', async () => {
      return this.getMemoryStats();
    });
  }
  
  /**
   * Recall memories matching query
   */
  async recallMemories(data) {
    try {
      const {
        query,
        limit = 10,
        minStrength = 0.3,
        timeWindow = null,
        topics = [],
        subjects = []
      } = data;
      
      if (!query) {
        return {
          success: false,
          error: 'Missing query'
        };
      }
      
      const result = await this.daemon.memoryIntegrator.recallMemories(query, {
        limit,
        minStrength,
        timeWindow,
        topics,
        subjects
      });
      
      return {
        success: true,
        memories: result.memories,
        stats: result.stats
      };
      
    } catch (err) {
      logger.error(`Recall memories error: ${err.message}`);
      return {
        success: false,
        error: err.message,
        memories: []
      };
    }
  }
  
  /**
   * Get memory statistics
   */
  getMemoryStats() {
    try {
      const stats = this.daemon.memoryIntegrator.getStats();
      
      return {
        success: true,
        stats
      };
      
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }
}

module.exports = RecallMemoriesAPI;
