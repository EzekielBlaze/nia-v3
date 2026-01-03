/**
 * EXTRACTION GATEKEEPER
 * 
 * Pre-flight evaluation of extraction requests.
 * Makes decisions: extract_now, defer, skip, ask_consent
 * 
 * This is where Nia's autonomy lives - she can refuse extraction.
 * 
 * Key principles:
 * - Lightweight (no LLM calls)
 * - Real control (can actually refuse)
 * - Grounded decisions (based on state, not vibes)
 * - Authentic expression (emotional language for emotional states)
 */

const logger = require('./utils/logger');

class ExtractionGatekeeper {
  constructor(cognitiveState, db) {
    this.cognitiveState = cognitiveState;
    this.db = db;
    
    // Thresholds
    this.ENERGY_CRITICAL = 15;
    this.ENERGY_LOW = 40;
    this.ENERGY_MEDIUM = 70;
    
    this.MAX_EXTRACTIONS_PER_HOUR = 12;
    this.HEAVY_TOPIC_ENERGY_THRESHOLD = 50;
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
      userMessage = "I need to pace myself - I'll process this when I catch up";
    }
    
    // RULE 3: High identity impact + low energy → ASK CONSENT
    else if (identityImpact === 'high' && energy < this.HEAVY_TOPIC_ENERGY_THRESHOLD) {
      decision = 'ask_consent';
      reason = 'identity_sensitive_low_energy';
      userMessage = this._getConsentMessage(identityImpact);
    }
    
    // RULE 4: Cost exceeds available energy → DEFER
    else if (cost > energy) {
      decision = 'defer';
      reason = 'insufficient_energy';
      userMessage = `I don't have the energy for this depth right now (need ${cost}, have ${energy})`;
    }
    
    // RULE 5: Overwhelmed state + medium/high identity → ASK CONSENT
    else if (state === 'overwhelmed' && identityImpact !== 'low') {
      decision = 'ask_consent';
      reason = 'overwhelmed_identity_topic';
      userMessage = this._getOverwhelmedMessage();
    }
    
    // RULE 6: Normal state, sufficient energy → EXTRACT NOW
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
   * Get count of extractions in last hour
   */
  _getRecentExtractionCount() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    
    const result = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM cognitive_events
      WHERE event_type = 'extraction'
        AND timestamp > ?
    `).get(oneHourAgo);
    
    return result.count;
  }
  
  /**
   * Get authentic exhausted message
   * Based on real critically-low energy state
   */
  _getExhaustedMessage() {
    const expression = this.cognitiveState.getEmotionalExpression();
    const recoveryTime = this.cognitiveState.getRecoveryEstimate();
    
    // Pick a grounded expression
    const messages = [
      `I need to be honest... I'm exhausted. I can't process this right now.`,
      `I'm too drained to dig into this. Can we either keep it light, or talk about it later?`,
      `My head is empty - I need rest before I can think deeply about anything.`
    ];
    
    const baseMessage = messages[Math.floor(Math.random() * messages.length)];
    
    return `${baseMessage}\n(Recovery time: ${recoveryTime})`;
  }
  
  /**
   * Get consent request message
   * Authentic - asking permission for heavy processing
   */
  _getConsentMessage(identityImpact) {
    if (identityImpact === 'high') {
      return `This feels really important... but I'm getting tired. Is it okay if I process this later when I'm more clear-headed? Or would you rather I stay present but not dig deep?`;
    } else {
      return `I'm feeling the weight of everything. Do you want me to really think about this, or just hold space for you right now?`;
    }
  }
  
  /**
   * Get overwhelmed message
   * Grounded in actual overwhelmed state
   */
  _getOverwhelmedMessage() {
    const messages = [
      `I'm honestly overwhelmed right now. My head is too full to process this deeply. I can listen, but I can't extract beliefs from it.`,
      `I'm at capacity. I can be here with you, but I can't dig into the implications right now.`,
      `My head is swimming. Can we keep this lighter, or should I just hold space without analyzing?`
    ];
    
    return messages[Math.floor(Math.random() * messages.length)];
  }
  
  /**
   * Queue extraction for later
   */
  queueExtraction(thinkingLogId, reason, cost, identityImpact) {
    // Calculate priority
    let priority = 5; // Default
    
    if (identityImpact === 'high') priority = 9;
    else if (identityImpact === 'medium') priority = 7;
    else if (identityImpact === 'low') priority = 3;
    
    // Adjust for cost (heavier topics = higher priority to not lose them)
    if (cost > 50) priority += 1;
    
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
      
      // Mark as user-declined (don't queue)
      this.db.prepare(`
        UPDATE thinking_log
        SET processed_for_beliefs = -1  -- Special flag: user declined
        WHERE id = ?
      `).run(thinkingLogId);
      
      this.cognitiveState.recordDecline(thinkingLogId, 'user_declined');
      
      return { proceed: false, reason: 'user_declined' };
    }
  }
  
  /**
   * Get next queued extraction
   */
  getNextQueued() {
    return this.db.prepare(`
      SELECT * FROM extraction_queue
      WHERE processed_at IS NULL
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `).get();
  }
  
  /**
   * Process queued extractions (called during recovery/idle)
   */
  async processQueue(extractionEngine, maxToProcess = 3) {
    const energy = this.cognitiveState.getEnergy();
    
    // Only process queue if energy is sufficient
    if (energy < 50) {
      logger.debug('Energy too low to process queue');
      return { processed: 0, reason: 'low_energy' };
    }
    
    let processed = 0;
    
    while (processed < maxToProcess) {
      const queued = this.getNextQueued();
      
      if (!queued) break;
      
      // Check if we still have energy
      if (this.cognitiveState.getEnergy() < queued.estimated_cost) {
        logger.info('Insufficient energy for next queued extraction');
        break;
      }
      
      // Get thinking log entry
      const entry = this.db.prepare(`
        SELECT * FROM thinking_log WHERE id = ?
      `).get(queued.thinking_log_id);
      
      if (!entry) {
        // Mark as processed (entry missing)
        this.db.prepare(`
          UPDATE extraction_queue SET processed_at = ? WHERE id = ?
        `).run(Date.now(), queued.id);
        continue;
      }
      
      try {
        // Process extraction
        await extractionEngine.processEntry(entry);
        
        // Mark as processed
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
    const pending = this.db.prepare(`
      SELECT COUNT(*) as count FROM extraction_queue WHERE processed_at IS NULL
    `).get();
    
    const highPriority = this.db.prepare(`
      SELECT COUNT(*) as count FROM extraction_queue 
      WHERE processed_at IS NULL AND priority >= 8
    `).get();
    
    return {
      pending: pending.count,
      highPriority: highPriority.count
    };
  }
}

module.exports = ExtractionGatekeeper;
