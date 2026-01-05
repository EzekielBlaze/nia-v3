/**
 * MEMORY INTEGRATOR
 * Adds memory storage and recall to NiaDaemon
 * ~140 lines (Target: <150)
 * 
 * FIXED: Correct require paths
 */

// FIXED: Use '../recall' not '../memory/recall'
const {
  MemoryStore,
  MemoryRecallFast,
  MemoryRecallSemantic,
  MemoryRecallHybrid,
  MemoryEmbedder,
  MemoryDecay,
  MemoryAccessTracker
} = require('../recall');

const logger = require('../../../utils/logger');

class MemoryIntegrator {
  constructor(daemon, vectorStore = null) {
    this.daemon = daemon;
    this.vectorStore = vectorStore; // Optional VectorStoreMemories
    
    // Initialize components
    this.memoryEmbedder = null;
    this.memoryStore = null;
    this.fastRecall = null;
    this.semanticRecall = null;
    this.hybridRecall = null;
    this.memoryDecay = null;
    this.accessTracker = null;
    
    this.embedderAvailable = false;
  }
  
  /**
   * Initialize memory system
   */
  async init() {
    try {
      // Check if embedder service is available
      this.memoryEmbedder = new MemoryEmbedder('http://localhost:5001');
      this.embedderAvailable = await this.memoryEmbedder.checkHealth();
      
      if (!this.embedderAvailable) {
        logger.warn('Memory embedder service not available - semantic search disabled');
      }
      
      // Initialize storage
      this.memoryStore = new MemoryStore(
        this.daemon.identityDbPath,
        this.embedderAvailable ? this.memoryEmbedder : null
      );
      
      // Initialize recall systems
      this.fastRecall = new MemoryRecallFast(this.daemon.identityDbPath);
      
      if (this.embedderAvailable && this.vectorStore) {
        this.semanticRecall = new MemoryRecallSemantic(
          this.daemon.identityDbPath,
          this.vectorStore,
          this.memoryEmbedder
        );
        
        this.hybridRecall = new MemoryRecallHybrid(
          this.fastRecall,
          this.semanticRecall
        );
      } else {
        // Hybrid with just fast search
        this.hybridRecall = new MemoryRecallHybrid(this.fastRecall, null);
      }
      
      // Initialize decay and tracking
      this.memoryDecay = new MemoryDecay(this.daemon.identityDbPath);
      this.accessTracker = new MemoryAccessTracker(
        this.daemon.identityDbPath,
        this.memoryDecay
      );
      
      // Start decay scheduler
      this.memoryDecay.start();
      
      logger.info('Memory integrator initialized');
      logger.info(`  - Embedder: ${this.embedderAvailable ? 'available' : 'unavailable'}`);
      logger.info(`  - Semantic search: ${this.semanticRecall ? 'enabled' : 'disabled'}`);
      
      return true;
      
    } catch (err) {
      logger.error(`Failed to initialize memory integrator: ${err.message}`);
      return false;
    }
  }
  
  /**
   * Store a memory
   */
  async storeMemory(statement, metadata = {}) {
    if (!this.memoryStore) {
      logger.warn('Memory store not initialized');
      return null;
    }
    
    try {
      const memory = await this.memoryStore.store(statement, {
        sessionId: this.daemon.sessionManagerIntegrator?.currentSessionId,
        ...metadata
      });
      
      logger.debug(`Memory stored: ${memory.id}`);
      
      return memory;
      
    } catch (err) {
      logger.error(`Failed to store memory: ${err.message}`);
      return null;
    }
  }
  
  /**
   * Recall memories related to query
   */
  async recallMemories(query, options = {}) {
    if (!this.hybridRecall) {
      logger.warn('Recall system not initialized');
      return { memories: [], stats: {} };
    }
    
    try {
      const result = await this.hybridRecall.recall(query, options);
      
      // Track accesses (non-critical, don't fail recall)
      if (result.memories.length > 0 && this.accessTracker) {
        try {
          const memoryIds = result.memories.map(m => m.id);
          this.accessTracker.trackBatch(memoryIds, 'conversation_recall');
        } catch (trackErr) {
          logger.warn(`Failed to track memory access: ${trackErr.message}`);
        }
      }
      
      logger.debug(`Recalled ${result.memories.length} memories for: "${query.substring(0, 30)}..."`);
      
      return result;
      
    } catch (err) {
      logger.error(`Failed to recall memories: ${err.message}`);
      return { memories: [], stats: { error: err.message } };
    }
  }
  
  /**
   * Get memory statistics
   */
  getStats() {
    if (!this.fastRecall || !this.memoryDecay) {
      return { total: 0, error: 'Not initialized' };
    }
    
    const count = this.fastRecall.count();
    const decayStats = this.memoryDecay.getStats();
    
    return {
      total: count,
      embedderAvailable: this.embedderAvailable,
      semanticEnabled: this.semanticRecall !== null,
      decay: decayStats
    };
  }
  
  /**
   * Shutdown
   */
  shutdown() {
    if (this.memoryDecay) {
      this.memoryDecay.stop();
      logger.info('Memory decay scheduler stopped');
    }
  }
}

module.exports = MemoryIntegrator;
