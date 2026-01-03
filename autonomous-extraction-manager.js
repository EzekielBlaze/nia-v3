/**
 * AUTONOMOUS EXTRACTION MANAGER
 * 
 * Orchestrates belief extraction with cognitive autonomy.
 * Nia can refuse, defer, or request consent for extraction.
 * 
 * Integrates:
 * - CognitiveState (energy, capacity)
 * - ExtractionGatekeeper (pre-flight decisions)
 * - TwoPassExtractionEngine (actual extraction)
 * 
 * This is the system that gives Nia real control over her own cognitive processes.
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
    
    // Recovery interval
    this.recoveryInterval = options.recoveryInterval || 600000; // 10 minutes
    this._startRecovery();
    
    logger.info('AutonomousExtractionManager initialized');
  }
  
  /**
   * Request extraction (respects autonomy)
   * 
   * Returns: decision object with userMessage if Nia wants to communicate something
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
      
      // Spend energy
      this.cognitiveState.spendEnergy(evaluation.cost, conversation.id);
      
      logger.info(`Extraction completed: ${result.created} created, ${result.updated} updated`);
      
      return {
        decision: 'extracted',
        result,
        userMessage: null // No need to tell user
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
        userMessage: "Something went wrong while processing that - I'll try again later"
      };
    }
  }
  
  /**
   * Defer extraction to queue
   */
  _deferExtraction(conversation, evaluation) {
    // Queue for later
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
    // Mark as skipped (won't queue)
    this.db.prepare(`
      UPDATE thinking_log
      SET processed_for_beliefs = -2  -- Special flag: skipped due to energy
      WHERE id = ?
    `).run(conversation.id);
    
    this.cognitiveState.recordDecline(conversation.id, evaluation.reason);
    
    logger.info(`Extraction skipped: ${evaluation.reason}`);
    
    return {
      decision: 'skipped',
      reason: evaluation.reason,
      userMessage: evaluation.userMessage // Nia expresses her state
    };
  }
  
  /**
   * Request user consent
   */
  _requestConsent(conversation, evaluation) {
    // Don't process yet - wait for user response
    logger.info(`Requesting consent for extraction: ${evaluation.reason}`);
    
    return {
      decision: 'consent_required',
      reason: evaluation.reason,
      userMessage: evaluation.userMessage,
      conversationId: conversation.id,
      
      // Provide callback for when user responds
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
        userMessage: "Okay, I'll just hold space without analyzing"
      };
    }
    
    // User consented - process extraction
    return await this._processImmediately(conversation, evaluation);
  }
  
  /**
   * Process queued extractions during idle/recovery
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
   * Get status message for user (if Nia wants to share)
   */
  getStatusMessage() {
    const status = this.getStatus();
    
    if (status.state === 'normal') {
      return null; // No need to mention when doing well
    }
    
    if (status.state === 'tired') {
      return `*I'm getting a bit tired (${status.energy}% energy)*`;
    }
    
    if (status.state === 'overwhelmed') {
      return `*I'm honestly overwhelmed right now (${status.energy}% energy, ${status.queuedExtractions} deferred)*`;
    }
    
    if (status.state === 'critically_low') {
      return `*I need rest - I'm at ${status.energy}% and can't process deeply*`;
    }
  }
  
  /**
   * Start passive recovery
   */
  _startRecovery() {
    setInterval(() => {
      const before = this.cognitiveState.getEnergy();
      this.cognitiveState.recover(5); // Recover 5 energy per interval
      const after = this.cognitiveState.getEnergy();
      
      if (before !== after) {
        logger.debug(`Passive recovery: ${before} → ${after}`);
      }
      
      // Process queue during recovery if energy is sufficient
      if (after >= 60) {
        this.processQueue(2).catch(err => {
          logger.error(`Queue processing failed: ${err.message}`);
        });
      }
      
    }, this.recoveryInterval);
    
    logger.info(`Recovery system started (${this.recoveryInterval}ms interval)`);
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
    // Save final state
    this.cognitiveState._saveState();
  }
}

module.exports = AutonomousExtractionManager;
