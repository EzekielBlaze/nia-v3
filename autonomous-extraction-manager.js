/**
 * AUTONOMOUS EXTRACTION MANAGER (FORGIVING VERSION)
 * 
 * Orchestrates belief extraction with cognitive autonomy.
 * 
 * CHANGES:
 * - Recovery interval: 10 min → 5 min (300000ms)
 * - Queue processing threshold: 60 → 40 energy
 * - Uses forgiving CognitiveState and ExtractionGatekeeper
 */

const Database = require('better-sqlite3');
const logger = require('./utils/logger');
const CognitiveState = require('./cognitive-state');
const ExtractionGatekeeper = require('./extraction-gatekeeper');
const TwoPassExtractionEngine = require('./belief-extraction-engine-v2');

class AutonomousExtractionManager {
  constructor(dbPath, options = {}) {
    this.db = new Database(dbPath);
    
    // Core systems
    this.cognitiveState = new CognitiveState(this.db);
    this.gatekeeper = new ExtractionGatekeeper(this.cognitiveState, this.db);
    this.extractionEngine = new TwoPassExtractionEngine(dbPath, options);
    
    // FASTER RECOVERY: 5 minutes instead of 10
    this.recoveryInterval = options.recoveryInterval || 300000; // 5 minutes (was 600000)
    this._startRecovery();
    
    logger.info('AutonomousExtractionManager initialized');
  }
  
  /**
   * Request extraction (respects autonomy)
   */
  async requestExtraction(conversation) {
    logger.info(`Extraction requested for conversation ${conversation.id || 'new'}`);
    
    // Pre-flight evaluation
    const evaluation = this.gatekeeper.evaluate(conversation);
    
    // Handle decision
    if (evaluation.decision === 'extract_now') {
      return await this._processImmediately(conversation, evaluation);
    }
    
    if (evaluation.decision === 'defer') {
      return this._deferExtraction(conversation, evaluation);
    }
    
    if (evaluation.decision === 'skip') {
      return this._skipExtraction(conversation, evaluation);
    }
    
    if (evaluation.decision === 'ask_consent') {
      return this._requestConsent(conversation, evaluation);
    }
  }
  
  /**
   * Process extraction immediately
   */
  async _processImmediately(conversation, evaluation) {
    try {
      const result = await this.extractionEngine.processEntry(conversation);
      
      // Spend energy (only if cost > 0)
      if (evaluation.cost > 0) {
        this.cognitiveState.spendEnergy(evaluation.cost, conversation.id);
      }
      
      logger.info(`Extraction completed: ${result.created} created, ${result.updated} updated`);
      
      return {
        decision: 'extracted',
        result,
        userMessage: null
      };
      
    } catch (err) {
      logger.error(`Extraction failed: ${err.message}`);
      
      // Queue for retry
      this.gatekeeper.queueExtraction(
        conversation.id,
        'extraction_failed',
        evaluation.cost,
        evaluation.identityImpact
      );
      
      return {
        decision: 'error',
        error: err.message,
        userMessage: null // Don't burden user with errors
      };
    }
  }
  
  /**
   * Defer extraction to queue
   */
  _deferExtraction(conversation, evaluation) {
    this.gatekeeper.queueExtraction(
      conversation.id,
      evaluation.reason,
      evaluation.cost,
      evaluation.identityImpact
    );
    
    this.cognitiveState.recordDecline(conversation.id, evaluation.reason);
    
    logger.info(`Extraction deferred: ${evaluation.reason}`);
    
    return {
      decision: 'deferred',
      reason: evaluation.reason,
      userMessage: evaluation.userMessage
    };
  }
  
  /**
   * Skip extraction entirely
   */
  _skipExtraction(conversation, evaluation) {
    // Mark as skipped
    try {
      this.db.prepare(`
        UPDATE thinking_log
        SET processed_for_beliefs = -2
        WHERE id = ?
      `).run(conversation.id);
    } catch (e) {}
    
    this.cognitiveState.recordDecline(conversation.id, evaluation.reason);
    
    logger.info(`Extraction skipped: ${evaluation.reason}`);
    
    return {
      decision: 'skipped',
      reason: evaluation.reason,
      userMessage: evaluation.userMessage
    };
  }
  
  /**
   * Request user consent
   */
  _requestConsent(conversation, evaluation) {
    logger.info(`Requesting consent for extraction: ${evaluation.reason}`);
    
    return {
      decision: 'consent_required',
      reason: evaluation.reason,
      userMessage: evaluation.userMessage,
      conversationId: conversation.id,
      
      onConsent: async (consented) => {
        return await this._handleConsentResponse(conversation, evaluation, consented);
      }
    };
  }
  
  /**
   * Handle user's consent response
   */
  async _handleConsentResponse(conversation, evaluation, consented) {
    const result = this.gatekeeper.processConsent(conversation.id, consented);
    
    if (!result.proceed) {
      return {
        decision: 'user_declined',
        userMessage: null
      };
    }
    
    return await this._processImmediately(conversation, evaluation);
  }
  
  /**
   * Process queued extractions
   */
  async processQueue(maxToProcess = 3) {
    logger.debug('Processing extraction queue...');
    
    const result = await this.gatekeeper.processQueue(this.extractionEngine, maxToProcess);
    
    if (result.processed > 0) {
      logger.info(`Processed ${result.processed} queued extractions`);
    }
    
    return result;
  }
  
  /**
   * Get current cognitive status
   */
  getStatus() {
    const queueStatus = this.gatekeeper.getQueueStatus();
    const energy = this.cognitiveState.getEnergy();
    const state = this.cognitiveState.getState();
    const expression = this.cognitiveState.getEmotionalExpression();
    
    return {
      energy,
      state,
      feeling: expression.feeling,
      canProcess: expression.canProcess,
      queuedExtractions: queueStatus.pending,
      highPriorityQueued: queueStatus.highPriority,
      recoveryEstimate: this.cognitiveState.getRecoveryEstimate()
    };
  }
  
  /**
   * Get status message for user
   */
  getStatusMessage() {
    const status = this.getStatus();
    
    // Don't burden user unless critically low
    if (status.state === 'critically_low') {
      return `*Taking a mental break - energy at ${status.energy}%*`;
    }
    
    return null;
  }
  
  /**
   * Start passive recovery - FASTER: every 5 minutes
   */
  _startRecovery() {
    setInterval(() => {
      const before = this.cognitiveState.getEnergy();
      this.cognitiveState.recover(5);
      const after = this.cognitiveState.getEnergy();
      
      if (before !== after) {
        logger.debug(`Passive recovery: ${before} → ${after}`);
      }
      
      // Process queue if energy sufficient (lowered threshold)
      if (after >= 40) {
        this.processQueue(2).catch(err => {
          logger.error(`Queue processing failed: ${err.message}`);
        });
      }
      
    }, this.recoveryInterval);
    
    logger.info(`Recovery system started (${this.recoveryInterval}ms interval = ${this.recoveryInterval / 60000} min)`);
  }
  
  /**
   * Daily reset
   */
  dailyReset() {
    this.cognitiveState.dailyReset();
    logger.info('Daily cognitive reset completed');
  }
  
  /**
   * Shutdown cleanup
   */
  shutdown() {
    logger.info('AutonomousExtractionManager shutting down');
    this.cognitiveState._saveState();
  }
}

module.exports = AutonomousExtractionManager;
