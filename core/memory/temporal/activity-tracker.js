/**
 * ACTIVITY TRACKER v2
 * Tracks what Nia and Blaze are currently doing together
 * Now with: auto-detection, default states, and self-management
 * ~220 lines
 */

const Database = require('better-sqlite3');
const logger = require('../../../utils/logger');
const TimeFormatter = require('./time-formatter');

class ActivityTracker {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.currentActivity = null;
    this._ensureTable();
    this._loadCurrentActivity();
    
    // If no activity loaded, default to casual chat
    if (!this.currentActivity) {
      this._setDefaultState();
    }
  }
  
  /**
   * Ensure activity table exists
   */
  _ensureTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS current_activity (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        type TEXT,
        name TEXT,
        started_at INTEGER,
        context TEXT,
        updated_at INTEGER
      )
    `);
  }
  
  /**
   * Load any persisted activity on startup
   */
  _loadCurrentActivity() {
    const row = this.db.prepare('SELECT * FROM current_activity WHERE id = 1').get();
    
    if (row && row.type) {
      this.currentActivity = {
        type: row.type,
        name: row.name,
        startedAt: row.started_at,
        context: row.context ? JSON.parse(row.context) : {},
        updatedAt: row.updated_at
      };
      logger.info(`Resumed activity: ${row.type}${row.name ? ` - ${row.name}` : ''}`);
    }
  }
  
  /**
   * Set default "just chatting" state
   */
  _setDefaultState() {
    this.currentActivity = {
      type: 'casual_chat',
      name: null,
      startedAt: Date.now(),
      context: {},
      updatedAt: Date.now(),
      isDefault: true  // Flag so we know this is auto-set
    };
    // Don't persist default state - it's ephemeral
  }
  
  /**
   * Start a new activity
   */
  startActivity(type, name = null, context = {}) {
    const now = Date.now();
    
    this.currentActivity = {
      type,
      name,
      startedAt: now,
      context,
      updatedAt: now,
      isDefault: false
    };
    
    this.db.prepare(`
      INSERT OR REPLACE INTO current_activity (id, type, name, started_at, context, updated_at)
      VALUES (1, ?, ?, ?, ?, ?)
    `).run(type, name, now, JSON.stringify(context), now);
    
    logger.info(`Activity started: ${type}${name ? ` - ${name}` : ''}`);
    
    return this.currentActivity;
  }
  
  /**
   * Update context of current activity
   */
  updateContext(newContext) {
    if (!this.currentActivity || this.currentActivity.isDefault) {
      logger.warn('No active activity to update');
      return null;
    }
    
    this.currentActivity.context = { ...this.currentActivity.context, ...newContext };
    this.currentActivity.updatedAt = Date.now();
    
    this.db.prepare(`
      UPDATE current_activity 
      SET context = ?, updated_at = ?
      WHERE id = 1
    `).run(JSON.stringify(this.currentActivity.context), this.currentActivity.updatedAt);
    
    return this.currentActivity;
  }
  
  /**
   * End current activity (returns to casual chat)
   */
  endActivity() {
    if (!this.currentActivity || this.currentActivity.isDefault) {
      logger.warn('No active activity to end');
      return null;
    }
    
    const ended = { ...this.currentActivity };
    ended.duration = Date.now() - ended.startedAt;
    
    this.db.prepare('DELETE FROM current_activity WHERE id = 1').run();
    
    logger.info(`Activity ended: ${ended.type}${ended.name ? ` - ${ended.name}` : ''} (${TimeFormatter.formatDuration(ended.duration)})`);
    
    // Return to default state
    this._setDefaultState();
    
    return ended;
  }
  
  /**
   * Get current activity (always returns something)
   */
  getCurrentActivity() {
    return this.currentActivity;
  }
  
  /**
   * Check if there's a non-default activity
   */
  hasActivity() {
    return this.currentActivity && !this.currentActivity.isDefault;
  }
  
  /**
   * Analyze a message and detect if activity should change
   * Call this from chat handler to enable auto-detection
   * Returns: { shouldChange: bool, newType: string, newName: string, endCurrent: bool }
   */
  detectActivityChange(userMessage, niaResponse = '') {
    const msg = userMessage.toLowerCase();
    const nia = niaResponse.toLowerCase();
    
    // Patterns that START activities (check user message)
    const startPatterns = [
      { pattern: /let'?s?\s+play\s+(?:a\s+)?(?:game|text\s*game|adventure)/i, type: 'text_game', extractName: true },
      { pattern: /want\s+to\s+play\s+(?:a\s+)?(?:game|something)/i, type: 'text_game', extractName: false },
      { pattern: /let'?s?\s+(?:do\s+)?(?:some\s+)?brainstorm/i, type: 'brainstorming', extractName: true },
      { pattern: /help\s+me\s+(?:think|figure|plan|brainstorm)/i, type: 'brainstorming', extractName: true },
      { pattern: /let'?s?\s+(?:watch|react\s+to)/i, type: 'watching', extractName: true },
      { pattern: /working\s+on\s+(?:my|a|the)\s+(\w+)/i, type: 'working_on', extractName: true },
      { pattern: /i\s+need\s+to\s+vent/i, type: 'venting', extractName: false },
      { pattern: /can\s+i\s+vent/i, type: 'venting', extractName: false },
      { pattern: /let'?s?\s+(?:plan|figure\s+out)/i, type: 'planning', extractName: true },
      { pattern: /(?:write|create|make)\s+(?:a|some)\s+(?:story|poem|song)/i, type: 'creative', extractName: true },
      { pattern: /(?:teach|explain|learn\s+about)\s+/i, type: 'learning', extractName: true },
      { pattern: /roleplay|rp\s+as|let'?s?\s+pretend/i, type: 'roleplay', extractName: true },
    ];
    
    // Patterns that END activities
    const endPatterns = [
      /(?:okay|ok|alright)\s*,?\s*(?:let'?s?\s+)?stop/i,
      /(?:i'?m\s+)?done\s+(?:with\s+)?(?:this|that|the\s+game|playing)/i,
      /(?:let'?s?\s+)?(?:end|finish|quit)\s+(?:this|the\s+game|playing)/i,
      /(?:that'?s?\s+)?enough\s+(?:of\s+)?(?:that|this)/i,
      /(?:back\s+to\s+)?(?:normal|regular)\s+(?:chat|talking)/i,
      /thanks\s+for\s+(?:playing|the\s+game|brainstorming)/i,
    ];
    
    // Patterns where Nia suggests activity and user agrees
    const niaStartedPatterns = [
      { niaPattern: /(?:want\s+to|should\s+we|let'?s?)\s+play\s+(?:a\s+)?(?:game|text\s*game)/i, type: 'text_game' },
      { niaPattern: /(?:want\s+to|should\s+we|let'?s?)\s+brainstorm/i, type: 'brainstorming' },
      { niaPattern: /(?:want\s+to|should\s+we|let'?s?)\s+(?:write|create)\s+(?:a|something)/i, type: 'creative' },
      { niaPattern: /(?:i\s+could|i'?d\s+like\s+to)\s+(?:tell|run)\s+(?:you\s+)?(?:a\s+)?(?:story|adventure)/i, type: 'text_game' },
    ];
    
    const userAgreement = /^(?:yes|yeah|yep|sure|ok(?:ay)?|sounds?\s+good|let'?s?\s+do\s+it|i'?m?\s+(?:in|down)|go\s+(?:for\s+it|ahead))/i;
    
    // Check for end patterns first (user message)
    for (const pattern of endPatterns) {
      if (pattern.test(msg)) {
        return { shouldChange: true, endCurrent: true };
      }
    }
    
    // Check for start patterns (user message)
    for (const { pattern, type, extractName } of startPatterns) {
      const match = msg.match(pattern);
      if (match) {
        let name = null;
        if (extractName && match[1]) {
          name = match[1];
        }
        return { shouldChange: true, newType: type, newName: name, endCurrent: false };
      }
    }
    
    // Check if Nia suggested something and user agreed
    if (userAgreement.test(msg) && nia) {
      for (const { niaPattern, type } of niaStartedPatterns) {
        if (niaPattern.test(nia)) {
          return { shouldChange: true, newType: type, newName: null, endCurrent: false, niaSuggested: true };
        }
      }
    }
    
    return { shouldChange: false };
  }
  
  /**
   * Process a conversation turn and auto-manage activity state
   * Call this from chat handler after each exchange
   */
  processConversation(userMessage, niaResponse = '') {
    const detection = this.detectActivityChange(userMessage, niaResponse);
    
    if (detection.shouldChange) {
      if (detection.endCurrent) {
        // End current activity
        if (this.hasActivity()) {
          this.endActivity();
          return { action: 'ended', activity: this.currentActivity };
        }
      } else if (detection.newType) {
        // Start new activity
        this.startActivity(detection.newType, detection.newName);
        return { action: 'started', activity: this.currentActivity };
      }
    }
    
    return { action: 'none', activity: this.currentActivity };
  }
  
  /**
   * Build context string for system prompt injection
   * Now always returns something (even for casual chat)
   */
  buildPromptContext() {
    if (!this.currentActivity) {
      this._setDefaultState();
    }
    
    const { type, name, startedAt, context, isDefault } = this.currentActivity;
    const duration = TimeFormatter.formatDuration(Date.now() - startedAt);
    
    // For casual chat, keep it minimal
    if (isDefault) {
      return `═══════════════════════════════════════════════════════════
CURRENT MODE: Casual conversation
═══════════════════════════════════════════════════════════
You and Blaze are just chatting. No specific activity or game in progress.
Feel free to suggest something if the conversation inspires you.`;
    }
    
    // For active activities, give full context
    let contextStr = `═══════════════════════════════════════════════════════════
CURRENT ACTIVITY
═══════════════════════════════════════════════════════════
You and Blaze are currently: ${this._formatActivityType(type)}${name ? ` - "${name}"` : ''}
Started: ${duration} ago
`;
    
    // Add any relevant context details
    if (context && Object.keys(context).length > 0) {
      contextStr += `\nDetails:\n`;
      for (const [key, value] of Object.entries(context)) {
        contextStr += `- ${this._formatKey(key)}: ${value}\n`;
      }
    }
    
    contextStr += `\nStay in this context unless Blaze explicitly changes topics or ends the activity.`;
    
    return contextStr;
  }
  
  /**
   * Format activity type for display
   */
  _formatActivityType(type) {
    const typeMap = {
      'text_game': 'Playing a text game',
      'brainstorming': 'Brainstorming',
      'watching': 'Watching something together',
      'working_on': 'Working on a project',
      'casual_chat': 'Casual conversation',
      'planning': 'Planning',
      'venting': 'Listening & supporting',
      'creative': 'Creative collaboration',
      'learning': 'Learning together',
      'roleplay': 'Roleplaying'
    };
    return typeMap[type] || type;
  }
  
  /**
   * Format context key for display
   */
  _formatKey(key) {
    return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
}

module.exports = ActivityTracker;
