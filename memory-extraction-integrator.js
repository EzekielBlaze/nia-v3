/**
 * MEMORY EXTRACTION INTEGRATOR
 * 
 * Integrates MemoryExtractionEngine into NiaDaemon.
 * Handles initialization, hooks, and API exposure.
 */

const logger = require('./utils/logger');
const MemoryExtractionEngine = require('./memory-extraction-engine');

class MemoryExtractionIntegrator {
  constructor(daemon) {
    this.daemon = daemon;
    this.engine = null;
    this.enabled = true;
    this.llmClient = null;  // Will be set from daemon
    
    // Throttling
    this.extractionQueue = [];
    this.isProcessing = false;
    this.minTimeBetweenExtractions = 2000; // 2 seconds
    this.lastExtractionTime = 0;
  }
  
  /**
   * Initialize the extraction engine
   */
  async init() {
    try {
      // Get embedder from daemon's memory integrator if available
      const embedder = this.daemon.memoryIntegrator?.embedder || null;
      
      // Get llmClient from daemon (global)
      let llmClient = null;
      try {
        llmClient = require('./llm-client');
      } catch (e) {
        // llm-client not available
      }
      
      this.engine = new MemoryExtractionEngine(this.daemon.identityDbPath, {
        llmClient: llmClient,  // Inject LLM client
        llmEndpoint: this.daemon.llmEndpoint,
        llmModel: this.daemon.llmModel,
        embedder: embedder,
        dryRun: false
      });
      
      logger.info('MemoryExtractionIntegrator initialized');
      if (embedder) {
        logger.info('  - Auto-embedding to Qdrant: enabled');
      }
      if (llmClient) {
        logger.info(`  - LLM client: ${llmClient.getMode()} mode`);
      }
      return true;
      
    } catch (err) {
      logger.error(`Failed to initialize MemoryExtractionIntegrator: ${err.message}`);
      this.enabled = false;
      return false;
    }
  }
  
  /**
   * Process a conversation turn (called from daemon chat handler)
   * Non-blocking - queues extraction
   */
  async processConversationTurn(userMessage, assistantResponse, metadata = {}) {
    if (!this.enabled || !this.engine) {
      return { skipped: true, reason: 'not_initialized' };
    }
    
    // Add to queue
    this.extractionQueue.push({
      userMessage,
      assistantResponse,
      metadata,
      queuedAt: Date.now()
    });
    
    // Process queue (non-blocking)
    this._processQueue();
    
    return { queued: true, queueLength: this.extractionQueue.length };
  }
  
  /**
   * Process extraction queue
   */
  async _processQueue() {
    if (this.isProcessing) return;
    if (this.extractionQueue.length === 0) return;
    
    // Throttle
    const now = Date.now();
    if (now - this.lastExtractionTime < this.minTimeBetweenExtractions) {
      // Schedule for later
      setTimeout(() => this._processQueue(), this.minTimeBetweenExtractions);
      return;
    }
    
    this.isProcessing = true;
    
    try {
      const item = this.extractionQueue.shift();
      if (!item) {
        this.isProcessing = false;
        return;
      }
      
      this.lastExtractionTime = now;
      
      // Ensure embedder is available (lazy load - might not have been ready at init)
      if (!this.engine.embedder && this.daemon.memoryIntegrator?.embedder) {
        this.engine.embedder = this.daemon.memoryIntegrator.embedder;
        this.engine.upserter.embedder = this.daemon.memoryIntegrator.embedder;
        logger.info('Memory extraction: embedder now available for auto-embedding');
      }
      
      // Run extraction
      const result = await this.engine.extractFromTurn(
        item.userMessage,
        item.assistantResponse,
        item.metadata
      );
      
      if (result.created > 0) {
        logger.info(`Auto-extracted ${result.created} new memories`);
      }
      
    } catch (err) {
      logger.error(`Queue processing error: ${err.message}`);
    } finally {
      this.isProcessing = false;
      
      // Process next item if queue not empty
      if (this.extractionQueue.length > 0) {
        setTimeout(() => this._processQueue(), 100);
      }
    }
  }
  
  /**
   * Manually trigger extraction for a message
   */
  async extractNow(userMessage, assistantResponse = '', metadata = {}) {
    if (!this.enabled || !this.engine) {
      return { success: false, error: 'Not initialized' };
    }
    
    return await this.engine.extractFromTurn(userMessage, assistantResponse, metadata);
  }
  
  /**
   * Get extraction statistics
   */
  getStats() {
    if (!this.engine) {
      return { enabled: false };
    }
    
    return {
      enabled: this.enabled,
      queueLength: this.extractionQueue.length,
      isProcessing: this.isProcessing,
      ...this.engine.getStats()
    };
  }
  
  /**
   * Get recent extractions
   */
  getRecentExtractions(limit = 10) {
    if (!this.engine) return [];
    return this.engine.getRecentExtractions(limit);
  }
  
  /**
   * Enable/disable extraction
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    logger.info(`Memory extraction ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Shutdown
   */
  shutdown() {
    if (this.engine) {
      this.engine.shutdown();
    }
    logger.info('MemoryExtractionIntegrator shut down');
  }
}

module.exports = MemoryExtractionIntegrator;
