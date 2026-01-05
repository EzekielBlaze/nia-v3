/**
 * EXTRACTION GATEKEEPER (FORGIVING VERSION)
 * 
 * Pre-flight evaluation of extraction requests.
 * Makes decisions: extract_now, defer, skip, ask_consent
 * 
 * CHANGES FROM ORIGINAL:
 * - Critical energy threshold: 15 → 5
 * - Low energy threshold: 40 → 20  
 * - Max extractions/hour: 12 → 30
 * - Heavy topic threshold: 50 → 30
 * - Trivial messages always skip (no cost)
 */

const logger = require('./utils/logger');

class ExtractionGatekeeper {
  constructor(cognitiveState, db) {
    this.cognitiveState = cognitiveState;
    this.db = db;
    
    // MORE FORGIVING THRESHOLDS
    this.ENERGY_CRITICAL = 5;    // Was 15
    this.ENERGY_LOW = 20;        // Was 40
    this.ENERGY_MEDIUM = 50;     // Was 70
    
    this.MAX_EXTRACTIONS_PER_HOUR = 30;  // Was 12
    this.HEAVY_TOPIC_ENERGY_THRESHOLD = 30; // Was 50
  }
  
  /**
   * Pre-flight evaluation of extraction request
   * Returns: extract_now, defer, skip, ask_consent
   */
  evaluate(conversation) {
    const startTime = Date.now();
    
    // Get current state
    const energy = this.cognitiveState.getEnergy();
    const state = this.cognitiveState.getState();
    
    // Check for trivial conversation FIRST
    const userMsg = conversation.user_message || '';
    if (this._isTrivialMessage(userMsg)) {
      return {
        decision: 'skip',
        reason: 'trivial_message',
        userMessage: null,
        energy,
        cost: 0,
        identityImpact: 'low',
        state,
        canProcess: false,
        evaluationTime: Date.now() - startTime
      };
    }
    
    // Estimate costs and impacts
    const cost = this.cognitiveState.estimateCost(conversation);
    const identityImpact = this.cognitiveState.estimateIdentityImpact(conversation);
    
    // Check rate limiting
    const recentExtractions = this._getRecentExtractionCount();
    
    logger.debug(`Pre-flight: energy=${energy}, cost=${cost}, identity=${identityImpact}, recent=${recentExtractions}`);
    
    // Decision logic
    let decision = null;
    let reason = null;
    let userMessage = null;
    
    // RULE 1: Critically low energy → SKIP
    if (energy < this.ENERGY_CRITICAL) {
      decision = 'skip';
      reason = 'critically_low_energy';
      userMessage = this._getExhaustedMessage();
    }
    
    // RULE 2: Rate limit exceeded → DEFER
    else if (recentExtractions >= this.MAX_EXTRACTIONS_PER_HOUR) {
      decision = 'defer';
      reason = 'rate_limit_exceeded';
      userMessage = null; // Don't tell user about rate limits
    }
    
    // RULE 3: High identity impact + low energy → ASK CONSENT
    else if (identityImpact === 'high' && energy < this.HEAVY_TOPIC_ENERGY_THRESHOLD) {
      decision = 'ask_consent';
      reason = 'identity_sensitive_low_energy';
      userMessage = this._getConsentMessage(identityImpact);
    }
    
    // RULE 4: Cost exceeds available energy → DEFER (but be more lenient)
    else if (cost > energy && cost > 10) {
      decision = 'defer';
      reason = 'insufficient_energy';
      userMessage = null; // Don't burden user with energy talk
    }
    
    // RULE 5: Normal state → EXTRACT NOW
    else {
      decision = 'extract_now';
      reason = 'capacity_available';
      userMessage = null;
    }
    
    const evaluationTime = Date.now() - startTime;
    
    const result = {
      decision,
      reason,
      userMessage,
      energy,
      cost,
      identityImpact,
      state,
      canProcess: decision === 'extract_now',
      evaluationTime
    };
    
    logger.info(`Pre-flight decision: ${decision} (${reason})`);
    
    return result;
  }
  
  /**
   * Check if message is trivial (no extraction needed)
   */
  _isTrivialMessage(msg) {
    if (!msg || msg.length < 15) return true;
    
    const lower = msg.toLowerCase().trim();
    
    // Greetings
    if (/^(hey|hi|hello|yo|sup|hiya|howdy|what's up)/i.test(lower)) return true;
    
    // Simple responses  
    if (/^(ok|okay|sure|yes|no|yeah|nah|yep|nope|cool|nice|great|thanks|thx|ty|lol|haha|hmm)/i.test(lower)) return true;
    
    // Questions about NIA (meta-questions, not extractable content)
    if (/^(how are you|what do you think|do you remember|can you recall|what do you know)/i.test(lower)) return true;
    
    // Single word or very short
    if (lower.split(/\s+/).length < 3) return true;
    
    return false;
  }
  
  /**
   * Get count of extractions in last hour
   */
  _getRecentExtractionCount() {
    try {
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      
      const result = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM cognitive_events
        WHERE event_type = 'extraction'
          AND timestamp > ?
      `).get(oneHourAgo);
      
      return result?.count || 0;
    } catch (e) {
      return 0;
    }
  }
  
  /**
   * Get authentic exhausted message
   */
  _getExhaustedMessage() {
    const expression = this.cognitiveState.getEmotionalExpression();
    const recoveryTime = this.cognitiveState.getRecoveryEstimate();
    
    const messages = [
      `I need to take a breather - can we chat about something lighter?`,
      `My head's a bit fuzzy right now - I can still chat, just not process deeply.`,
      `Taking a mental break - let's keep it casual for a bit.`
    ];
    
    const baseMessage = messages[Math.floor(Math.random() * messages.length)];
    
    return `${baseMessage}\n(Recovery: ${recoveryTime})`;
  }
  
  /**
   * Get consent request message
   */
  _getConsentMessage(identityImpact) {
    if (identityImpact === 'high') {
      return `This feels important... but I'm running low. Want me to really dig into this, or should we keep it light for now?`;
    } else {
      return `I'm getting tired but can push through if you want. Should I process this deeply?`;
    }
  }
  
  /**
   * Queue extraction for later
   */
  queueExtraction(thinkingLogId, reason, cost, identityImpact) {
    let priority = 5;
    
    if (identityImpact === 'high') priority = 9;
    else if (identityImpact === 'medium') priority = 7;
    else if (identityImpact === 'low') priority = 3;
    
    if (cost > 30) priority += 1;
    
    try {
      this.db.prepare(`
        INSERT INTO extraction_queue (
          thinking_log_id,
          reason,
          priority,
          estimated_cost,
          identity_impact
        ) VALUES (?, ?, ?, ?, ?)
      `).run(thinkingLogId, reason, priority, cost, identityImpact);
      
      logger.info(`Queued extraction: thinking_log ${thinkingLogId}, priority ${priority}, reason: ${reason}`);
    } catch (e) {
      logger.warn(`Failed to queue extraction: ${e.message}`);
    }
  }
  
  /**
   * Process consent response
   */
  processConsent(thinkingLogId, userConsented) {
    if (userConsented) {
      logger.info(`User consented to extraction for thinking_log ${thinkingLogId}`);
      return { proceed: true };
    } else {
      logger.info(`User declined extraction for thinking_log ${thinkingLogId}`);
      
      try {
        this.db.prepare(`
          UPDATE thinking_log
          SET processed_for_beliefs = -1
          WHERE id = ?
        `).run(thinkingLogId);
      } catch (e) {}
      
      this.cognitiveState.recordDecline(thinkingLogId, 'user_declined');
      
      return { proceed: false, reason: 'user_declined' };
    }
  }
  
  /**
   * Get next queued extraction
   */
  getNextQueued() {
    try {
      return this.db.prepare(`
        SELECT * FROM extraction_queue
        WHERE processed_at IS NULL
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
      `).get();
    } catch (e) {
      return null;
    }
  }
  
  /**
   * Process queued extractions
   */
  async processQueue(extractionEngine, maxToProcess = 3) {
    const energy = this.cognitiveState.getEnergy();
    
    if (energy < 30) {
      logger.debug('Energy too low to process queue');
      return { processed: 0, reason: 'low_energy' };
    }
    
    let processed = 0;
    
    while (processed < maxToProcess) {
      const queued = this.getNextQueued();
      
      if (!queued) break;
      
      if (this.cognitiveState.getEnergy() < queued.estimated_cost) {
        logger.info('Insufficient energy for next queued extraction');
        break;
      }
      
      const entry = this.db.prepare(`
        SELECT * FROM thinking_log WHERE id = ?
      `).get(queued.thinking_log_id);
      
      if (!entry) {
        this.db.prepare(`
          UPDATE extraction_queue SET processed_at = ? WHERE id = ?
        `).run(Date.now(), queued.id);
        continue;
      }
      
      try {
        await extractionEngine.processEntry(entry);
        
        this.db.prepare(`
          UPDATE extraction_queue SET processed_at = ? WHERE id = ?
        `).run(Date.now(), queued.id);
        
        processed++;
        
        logger.info(`Processed queued extraction: ${queued.id} (priority ${queued.priority})`);
        
      } catch (err) {
        logger.error(`Failed to process queued extraction ${queued.id}: ${err.message}`);
        break;
      }
    }
    
    return { processed };
  }
  
  /**
   * Get queue status
   */
  getQueueStatus() {
    try {
      const pending = this.db.prepare(`
        SELECT COUNT(*) as count FROM extraction_queue WHERE processed_at IS NULL
      `).get();
      
      const highPriority = this.db.prepare(`
        SELECT COUNT(*) as count FROM extraction_queue 
        WHERE processed_at IS NULL AND priority >= 8
      `).get();
      
      return {
        pending: pending?.count || 0,
        highPriority: highPriority?.count || 0
      };
    } catch (e) {
      return { pending: 0, highPriority: 0 };
    }
  }
}

module.exports = ExtractionGatekeeper;
