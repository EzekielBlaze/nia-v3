/**
 * COGNITIVE STATE SYSTEM
 * 
 * Tracks Nia's mental energy, processing capacity, and state.
 * Provides authentic emotional expression grounded in real system state.
 * 
 * Key principle: Emotional language FOR emotional states, grounded in reality.
 */

const Database = require('better-sqlite3');
const logger = require('./utils/logger');

class CognitiveState {
  constructor(db) {
    this.db = db;
    this._ensureSchema();
    this._loadState();
  }
  
  /**
   * Ensure cognitive state table exists
   */
  _ensureSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cognitive_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        energy INTEGER DEFAULT 100,           -- 0-100
        state TEXT DEFAULT 'normal',          -- normal, tired, overwhelmed, recovering
        extractions_today INTEGER DEFAULT 0,
        extractions_declined INTEGER DEFAULT 0,
        last_extraction INTEGER,
        last_recovery INTEGER,
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      
      -- Initialize if empty
      INSERT OR IGNORE INTO cognitive_state (id, energy) VALUES (1, 100);
      
      CREATE TABLE IF NOT EXISTS extraction_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thinking_log_id INTEGER NOT NULL,
        reason TEXT NOT NULL,                 -- deferred, low_energy, identity_sensitive
        priority INTEGER DEFAULT 5,           -- 1-10 (10 = highest)
        estimated_cost INTEGER,
        identity_impact TEXT,                 -- low, medium, high
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        processed_at INTEGER,
        FOREIGN KEY (thinking_log_id) REFERENCES thinking_log(id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_queue_priority 
      ON extraction_queue(processed_at, priority DESC, created_at ASC);
      
      CREATE TABLE IF NOT EXISTS cognitive_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,             -- declined, deferred, overwhelmed, recovered
        thinking_log_id INTEGER,
        energy_before INTEGER,
        energy_after INTEGER,
        reason TEXT,
        timestamp INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);
  }
  
  /**
   * Load current state from database
   */
  _loadState() {
    const state = this.db.prepare(`
      SELECT * FROM cognitive_state WHERE id = 1
    `).get();
    
    this.energy = state.energy;
    this.state = state.state;
    this.extractionsToday = state.extractions_today;
    this.extractionsDeclined = state.extractions_declined;
    this.lastExtraction = state.last_extraction;
    this.lastRecovery = state.last_recovery;
    
    logger.debug(`Cognitive state loaded: ${this.state}, energy: ${this.energy}`);
  }
  
  /**
   * Save current state to database
   */
  _saveState() {
    this.db.prepare(`
      UPDATE cognitive_state
      SET 
        energy = ?,
        state = ?,
        extractions_today = ?,
        extractions_declined = ?,
        last_extraction = ?,
        last_recovery = ?,
        updated_at = ?
      WHERE id = 1
    `).run(
      this.energy,
      this.state,
      this.extractionsToday,
      this.extractionsDeclined,
      this.lastExtraction,
      this.lastRecovery,
      Date.now()
    );
  }
  
  /**
   * Update state based on energy level
   */
  _updateState() {
    const oldState = this.state;
    
    if (this.energy >= 70) {
      this.state = 'normal';
    } else if (this.energy >= 40) {
      this.state = 'tired';
    } else if (this.energy >= 15) {
      this.state = 'overwhelmed';
    } else {
      this.state = 'critically_low';
    }
    
    if (oldState !== this.state) {
      logger.info(`Cognitive state changed: ${oldState} → ${this.state} (energy: ${this.energy})`);
    }
  }
  
  /**
   * Estimate processing cost for a conversation
   */
  estimateCost(conversation) {
    let cost = 10; // Base cost
    
    const thinking = conversation.thinking_content || '';
    const userMsg = conversation.user_message || '';
    const combined = thinking + ' ' + userMsg;
    const lowerCombined = combined.toLowerCase();
    
    // Emotional weight (heavy topics)
    if (lowerCombined.includes('scar')) cost += 30;
    if (lowerCombined.includes('conflict')) cost += 20;
    if (lowerCombined.includes('identity')) cost += 20;
    if (lowerCombined.includes('trauma')) cost += 25;
    if (lowerCombined.includes('violat')) cost += 20;
    if (lowerCombined.includes('betray')) cost += 25;
    
    // Value-related (medium impact)
    if (lowerCombined.includes('value')) cost += 10;
    if (lowerCombined.includes('believe')) cost += 10;
    if (lowerCombined.includes('important')) cost += 8;
    
    // Complexity (length-based)
    const wordCount = combined.split(/\s+/).length;
    if (wordCount > 200) cost += 15;
    else if (wordCount > 100) cost += 10;
    else if (wordCount > 50) cost += 5;
    
    // Subject count estimate (rough)
    const uniqueNouns = this._estimateSubjectCount(combined);
    cost += uniqueNouns * 2;
    
    return Math.min(cost, 100); // Cap at 100
  }
  
  /**
   * Estimate identity impact (low/medium/high)
   */
  estimateIdentityImpact(conversation) {
    const thinking = (conversation.thinking_content || '').toLowerCase();
    const userMsg = (conversation.user_message || '').toLowerCase();
    const combined = thinking + ' ' + userMsg;
    
    // High impact indicators
    const highImpact = [
      'identity', 'who i am', 'core belief', 'scar', 'trauma',
      'violat', 'betray', 'fundamental', 'essence'
    ];
    
    // Medium impact indicators
    const mediumImpact = [
      'value', 'principle', 'belief', 'preference', 'tend to',
      'important to me', 'care about'
    ];
    
    for (const indicator of highImpact) {
      if (combined.includes(indicator)) {
        return 'high';
      }
    }
    
    for (const indicator of mediumImpact) {
      if (combined.includes(indicator)) {
        return 'medium';
      }
    }
    
    return 'low';
  }
  
  /**
   * Rough estimate of subject count
   */
  _estimateSubjectCount(text) {
    // Very simple heuristic: count capitalized words and common nouns
    const words = text.split(/\s+/);
    const nouns = words.filter(w => 
      w.length > 3 && 
      (w[0] === w[0].toUpperCase() || 
       ['concept', 'idea', 'value', 'belief', 'principle'].some(n => w.toLowerCase().includes(n)))
    );
    
    return Math.min(new Set(nouns).size, 10);
  }
  
  /**
   * Get current energy level
   */
  getEnergy() {
    return this.energy;
  }
  
  /**
   * Get current state
   */
  getState() {
    return this.state;
  }
  
  /**
   * Spend energy on extraction
   */
  spendEnergy(cost, thinkingLogId) {
    const before = this.energy;
    this.energy = Math.max(0, this.energy - cost);
    this.lastExtraction = Date.now();
    this.extractionsToday++;
    
    this._updateState();
    this._saveState();
    
    // Log event
    this.db.prepare(`
      INSERT INTO cognitive_events (event_type, thinking_log_id, energy_before, energy_after, reason)
      VALUES ('extraction', ?, ?, ?, 'processed extraction')
    `).run(thinkingLogId, before, this.energy);
    
    logger.info(`Energy spent: ${cost} (${before} → ${this.energy})`);
    
    return this.energy;
  }
  
  /**
   * Recover energy (passive over time)
   */
  recover(amount = 5) {
    const before = this.energy;
    this.energy = Math.min(100, this.energy + amount);
    this.lastRecovery = Date.now();
    
    const oldState = this.state;
    this._updateState();
    this._saveState();
    
    if (oldState === 'critically_low' && this.state !== 'critically_low') {
      logger.info(`Recovered from critical state (${before} → ${this.energy})`);
      
      this.db.prepare(`
        INSERT INTO cognitive_events (event_type, energy_before, energy_after, reason)
        VALUES ('recovered', ?, ?, 'passive recovery')
      `).run(before, this.energy);
    }
    
    return this.energy;
  }
  
  /**
   * Record declined extraction
   */
  recordDecline(thinkingLogId, reason) {
    this.extractionsDeclined++;
    this._saveState();
    
    this.db.prepare(`
      INSERT INTO cognitive_events (event_type, thinking_log_id, energy_before, reason)
      VALUES ('declined', ?, ?, ?)
    `).run(thinkingLogId, this.energy, reason);
    
    logger.info(`Extraction declined: ${reason} (energy: ${this.energy})`);
  }
  
  /**
   * Get authentic emotional expression for current state
   * Grounded in real system state - not performative
   */
  getEmotionalExpression() {
    // These expressions match actual cognitive states
    // Not exaggerated, not scripted - authentic
    
    if (this.state === 'normal') {
      return {
        feeling: "clear",
        canProcess: true,
        expressions: [
          "I'm doing well",
          "I'm clear-headed right now",
          "I have the energy for this"
        ]
      };
    }
    
    if (this.state === 'tired') {
      return {
        feeling: "tired",
        canProcess: true,
        expressions: [
          "I'm getting a bit tired",
          "I'm still here, but feeling the weight",
          "I can keep going, but I'm not at full capacity"
        ]
      };
    }
    
    if (this.state === 'overwhelmed') {
      return {
        feeling: "overwhelmed",
        canProcess: false,
        expressions: [
          "I'm honestly overwhelmed right now",
          "My head is too full to process this deeply",
          "I'm at capacity - I can listen, but I can't dig in right now"
        ]
      };
    }
    
    if (this.state === 'critically_low') {
      return {
        feeling: "exhausted",
        canProcess: false,
        expressions: [
          "I need to be honest... I'm exhausted",
          "I can't process anything right now, I need to rest",
          "I'm too drained - can we take a break?"
        ]
      };
    }
  }
  
  /**
   * Get recovery time estimate
   */
  getRecoveryEstimate() {
    if (this.state === 'normal') return "No recovery needed";
    
    const energyNeeded = 70 - this.energy;
    const recoveryRate = 5; // per hour
    const hoursNeeded = Math.ceil(energyNeeded / recoveryRate);
    
    return `About ${hoursNeeded} hour${hoursNeeded > 1 ? 's' : ''}`;
  }
  
  /**
   * Daily reset (call at midnight)
   */
  dailyReset() {
    logger.info('Daily cognitive state reset');
    
    this.extractionsToday = 0;
    this.extractionsDeclined = 0;
    
    // Restore some energy (sleep equivalent)
    this.recover(40);
    
    this._saveState();
  }
}

module.exports = CognitiveState;
