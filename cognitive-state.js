/**
 * COGNITIVE STATE SYSTEM (FORGIVING VERSION)
 * 
 * Tracks Nia's mental energy, processing capacity, and state.
 * 
 * CHANGES FROM ORIGINAL:
 * - Base extraction cost: 10 → 2
 * - Only heavy topics (scar, trauma, identity) cost significant energy
 * - Conversation engagement ADDS energy (+1 per message)
 * - Recovery: every 5 min instead of 10 min
 * - Trivial conversations cost 0 energy
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
        reason TEXT NOT NULL,
        priority INTEGER DEFAULT 5,
        estimated_cost INTEGER,
        identity_impact TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        processed_at INTEGER,
        FOREIGN KEY (thinking_log_id) REFERENCES thinking_log(id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_queue_priority 
      ON extraction_queue(processed_at, priority DESC, created_at ASC);
      
      CREATE TABLE IF NOT EXISTS cognitive_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
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
   * MORE FORGIVING THRESHOLDS
   */
  _updateState() {
    const oldState = this.state;
    
    if (this.energy >= 50) {
      this.state = 'normal';      // Was 70
    } else if (this.energy >= 25) {
      this.state = 'tired';       // Was 40
    } else if (this.energy >= 10) {
      this.state = 'overwhelmed'; // Was 15
    } else {
      this.state = 'critically_low';
    }
    
    if (oldState !== this.state) {
      logger.info(`Cognitive state changed: ${oldState} → ${this.state} (energy: ${this.energy})`);
    }
  }
  
  /**
   * Estimate processing cost for a conversation
   * MUCH MORE FORGIVING - only heavy topics cost significant energy
   */
  estimateCost(conversation) {
    const thinking = conversation.thinking_content || '';
    const userMsg = conversation.user_message || '';
    const combined = thinking + ' ' + userMsg;
    const lowerCombined = combined.toLowerCase();
    
    // Check for trivial conversation - NO COST
    if (this._isTrivialConversation(userMsg)) {
      return 0;
    }
    
    let cost = 2; // Base cost (was 10)
    
    // ONLY heavy topics add significant cost
    // Scar-related (HIGH cost)
    if (lowerCombined.includes('scar')) cost += 20;
    if (lowerCombined.includes('trauma')) cost += 20;
    if (lowerCombined.includes('betray')) cost += 15;
    if (lowerCombined.includes('violat')) cost += 15;
    
    // Identity conflict (MEDIUM cost)
    if (lowerCombined.includes('identity') && lowerCombined.includes('conflict')) cost += 10;
    if (lowerCombined.includes('who i am') && lowerCombined.includes('question')) cost += 10;
    
    // Everything else - minimal cost
    // Removed: value, believe, important (these are normal conversation)
    // Removed: length-based cost (normal conversations shouldn't drain)
    // Removed: subject count cost (learning about new things is good)
    
    return Math.min(cost, 50); // Cap at 50 (was 100)
  }
  
  /**
   * Check if conversation is trivial (no extraction cost)
   */
  _isTrivialConversation(userMsg) {
    if (!userMsg || userMsg.length < 20) return true;
    
    const lower = userMsg.toLowerCase().trim();
    
    // Greetings
    if (/^(hey|hi|hello|yo|sup|hiya|howdy|what's up|how are you)/i.test(lower)) return true;
    
    // Simple responses
    if (/^(ok|okay|sure|yes|no|yeah|nah|yep|nope|cool|nice|great|thanks|thx|ty|lol|haha)/i.test(lower)) return true;
    
    // Questions about NIA's state (meta, not content)
    if (/^(how are you|what's your|do you remember|can you recall)/i.test(lower)) return true;
    
    return false;
  }
  
  /**
   * Estimate identity impact (low/medium/high)
   */
  estimateIdentityImpact(conversation) {
    const thinking = (conversation.thinking_content || '').toLowerCase();
    const userMsg = (conversation.user_message || '').toLowerCase();
    const combined = thinking + ' ' + userMsg;
    
    // High impact - ONLY truly heavy stuff
    const highImpact = ['scar', 'trauma', 'violat', 'betray'];
    if (highImpact.some(term => combined.includes(term))) {
      return 'high';
    }
    
    // Medium impact - identity questioning
    const mediumImpact = ['identity conflict', 'who i am', 'fundamental'];
    if (mediumImpact.some(term => combined.includes(term))) {
      return 'medium';
    }
    
    // Everything else is low impact
    return 'low';
  }
  
  /**
   * Rough estimate of subject count
   */
  _estimateSubjectCount(text) {
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
    // Skip if trivial (cost = 0)
    if (cost === 0) {
      logger.debug('Trivial conversation - no energy spent');
      return this.energy;
    }
    
    const before = this.energy;
    this.energy = Math.max(0, this.energy - cost);
    this.lastExtraction = Date.now();
    this.extractionsToday++;
    
    this._updateState();
    this._saveState();
    
    // Log event
    try {
      this.db.prepare(`
        INSERT INTO cognitive_events (event_type, thinking_log_id, energy_before, energy_after, reason)
        VALUES ('extraction', ?, ?, ?, 'processed extraction')
      `).run(thinkingLogId, before, this.energy);
    } catch (e) {
      // Ignore FK errors
    }
    
    logger.info(`Energy spent: ${cost} (${before} → ${this.energy})`);
    
    return this.energy;
  }
  
  /**
   * Gain energy from conversation engagement
   * Talking is healthy! It should add energy, not drain it.
   */
  gainFromEngagement(amount = 1) {
    const before = this.energy;
    this.energy = Math.min(100, this.energy + amount);
    
    this._updateState();
    this._saveState();
    
    if (this.energy !== before) {
      logger.debug(`Engagement energy: +${amount} (${before} → ${this.energy})`);
    }
    
    return this.energy;
  }
  
  /**
   * Recover energy (passive over time)
   * FASTER RECOVERY: +5 energy per call
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
      
      try {
        this.db.prepare(`
          INSERT INTO cognitive_events (event_type, energy_before, energy_after, reason)
          VALUES ('recovered', ?, ?, 'passive recovery')
        `).run(before, this.energy);
      } catch (e) {
        // Ignore
      }
    }
    
    return this.energy;
  }
  
  /**
   * Record declined extraction
   */
  recordDecline(thinkingLogId, reason) {
    this.extractionsDeclined++;
    this._saveState();
    
    try {
      this.db.prepare(`
        INSERT INTO cognitive_events (event_type, thinking_log_id, energy_before, energy_after, reason)
        VALUES ('declined', ?, ?, ?, ?)
      `).run(thinkingLogId, this.energy, this.energy, reason);
    } catch (e) {
      // Ignore
    }
  }
  
  /**
   * Get emotional expression based on current state
   */
  getEmotionalExpression() {
    const stateExpressions = {
      normal: {
        feeling: 'good',
        canProcess: true,
        message: null
      },
      tired: {
        feeling: 'tired',
        canProcess: true,
        message: 'Getting a bit tired, but still here'
      },
      overwhelmed: {
        feeling: 'overwhelmed',
        canProcess: true, // Changed: can still process when overwhelmed
        message: 'Feeling a bit scattered, but managing'
      },
      critically_low: {
        feeling: 'exhausted',
        canProcess: false,
        message: 'Need to rest - can chat but not process deeply'
      }
    };
    
    return stateExpressions[this.state] || stateExpressions.normal;
  }
  
  /**
   * Get recovery time estimate
   * FASTER: 5 min intervals, +5 energy each
   */
  getRecoveryEstimate() {
    if (this.energy >= 80) {
      return 'Fully rested';
    }
    
    const needed = 80 - this.energy;
    const intervalsNeeded = Math.ceil(needed / 5);
    const minutesNeeded = intervalsNeeded * 5; // 5 min per interval
    
    if (minutesNeeded < 60) {
      return `About ${minutesNeeded} minutes`;
    }
    
    const hours = Math.ceil(minutesNeeded / 60);
    return `About ${hours} hour${hours > 1 ? 's' : ''}`;
  }
  
  /**
   * Daily reset
   */
  dailyReset() {
    this.energy = 100;
    this.extractionsToday = 0;
    this.extractionsDeclined = 0;
    this.state = 'normal';
    
    this._saveState();
    
    try {
      this.db.prepare(`
        INSERT INTO cognitive_events (event_type, energy_before, energy_after, reason)
        VALUES ('daily_reset', ?, 100, 'daily reset')
      `).run(this.energy);
    } catch (e) {
      // Ignore
    }
    
    logger.info('Daily cognitive reset completed');
  }
  
  /**
   * Force reset to full energy (for debugging)
   */
  forceReset() {
    this.energy = 100;
    this.state = 'normal';
    this._saveState();
    logger.info('Cognitive state force reset to 100 energy');
    return this.energy;
  }
}

module.exports = CognitiveState;
