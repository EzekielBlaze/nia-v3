/**
 * SESSION CONTEXT MANAGER
 * 
 * Three-tier conversation context:
 * - IMMEDIATE: Last 2-3 turns (raw, no processing)
 * - SHORT-TERM: Last 5-10 minutes (topic tracking, keywords)
 * - LONG-TERM: Whole session (LLM summarization, async)
 * 
 * NEW: SQLite persistence for summaries
 * - Survives restarts
 * - Queryable history
 * - Multi-user ready (user_id field)
 * 
 * Debug output written to session-context.txt for monitoring.
 */

const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

class SessionContextManager {
  constructor(options = {}) {
    // Config
    this.debugFilePath = options.debugFilePath || path.join(process.cwd(), 'session-context.txt');
    this.llmEndpoint = options.llmEndpoint || 'http://localhost:1234/v1/chat/completions';
    this.longTermUpdateInterval = options.longTermUpdateInterval || 5; // Every N turns
    this.userId = options.userId || 'blaze';  // For multi-user support
    
    // Database connection (optional but recommended)
    this.db = options.db || null;
    
    // Session state
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.sessionStart = Date.now();
    this.turnCount = 0;
    this.turns = [];  // All turns this session [{role, content, timestamp, topics}]
    
    // Three tiers
    this.immediate = {
      turns: [],      // Last 2-3 raw turns
      maxTurns: 3
    };
    
    this.shortTerm = {
      topics: [],          // [{topic, firstMentioned, lastMentioned, count}]
      boundaries: [],      // [{reason, timestamp, context}]
      mood: 'neutral',     // Current detected mood
      topicFlow: [],       // Topic order
      windowMinutes: 10    // Look back window
    };
    
    this.longTerm = {
      summary: null,       // LLM-generated summary
      themes: [],          // Extracted themes
      lastUpdated: null,
      updating: false      // Lock for async update
    };
    
    // Topic patterns (keyword-based, fast)
    this.topicPatterns = {
      work: /\b(work|working|job|office|meeting|deadline|project|boss|coworker)\b/i,
      coding: /\b(code|coding|programming|bug|debug|function|api|github|daemon|nia)\b/i,
      gaming: /\b(game|gaming|play|playing|steam|xbox|playstation|raid|level|star citizen)\b/i,
      social: /\b(friend|friends|hang out|party|people|someone|gloomie)\b/i,
      food: /\b(food|eat|eating|lunch|dinner|breakfast|hungry|pizza|coffee)\b/i,
      stress: /\b(stress|stressed|anxious|anxiety|overwhelmed|worried)\b/i,
      tired: /\b(tired|exhausted|sleepy|sleep|rest)\b/i,
      happy: /\b(happy|excited|great|awesome|good|nice)\b/i,
      sad: /\b(sad|upset|down|depressed|lonely)\b/i,
      bored: /\b(bored|boring|nothing to do)\b/i,
      nia_meta: /\b(memory|memories|remember|belief|beliefs|yourself)\b/i,
    };
    
    // Boundary patterns
    this.boundaryPatterns = [
      { pattern: /\b(can't|cannot)\b.*\b(right now|now|atm)\b/i, reason: 'timing' },
      { pattern: /\b(busy|at work|in a meeting)\b/i, reason: 'occupied' },
      { pattern: /\b(not now|maybe later|later)\b/i, reason: 'deferred' },
      { pattern: /\b(don't want to|rather not)\b/i, reason: 'preference' },
      { pattern: /\b(stop|enough|drop it|move on)\b/i, reason: 'closed' },
    ];
    
    // Mood patterns
    this.moodPatterns = {
      positive: /\b(happy|excited|great|awesome|love|amazing|good|nice|fun)\b/i,
      negative: /\b(sad|angry|frustrated|annoyed|upset|stressed|anxious|tired|bored)\b/i,
      neutral: /\b(okay|fine|alright|meh|whatever)\b/i
    };
    
    // Initialize database schema and load previous context
    if (this.db) {
      this._ensureSchema();
      this._loadPreviousContext();
    }
    
    // Write initial debug file
    this._writeDebugFile();
  }
  
  /**
   * Set database connection (for late initialization)
   */
  setDb(db) {
    this.db = db;
    if (this.db) {
      this._ensureSchema();
      this._loadPreviousContext();
      logger.info('SessionContextManager: Database connected');
    }
  }
  
  // ==========================================
  // DATABASE PERSISTENCE
  // ==========================================
  
  /**
   * Ensure SQLite tables exist
   */
  _ensureSchema() {
    try {
      // Session summaries table
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS session_summaries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL DEFAULT 'blaze',
          session_id TEXT,
          summary_type TEXT CHECK(summary_type IN ('turn', 'hourly', 'daily', 'weekly', 'session')) DEFAULT 'turn',
          summary_text TEXT NOT NULL,
          topics_json TEXT,
          mood TEXT,
          turn_count INTEGER,
          turn_range_start INTEGER,
          turn_range_end INTEGER,
          period_start INTEGER,
          period_end INTEGER,
          created_at INTEGER DEFAULT (unixepoch() * 1000)
        )
      `);
      
      // Index for fast queries
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_session_summaries_user_time 
        ON session_summaries(user_id, created_at DESC)
      `);
      
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_session_summaries_type 
        ON session_summaries(user_id, summary_type, created_at DESC)
      `);
      
      logger.debug('SessionContextManager: Schema ready');
    } catch (err) {
      logger.warn(`SessionContextManager: Schema init failed: ${err.message}`);
    }
  }
  
  /**
   * Load previous context on startup
   */
  _loadPreviousContext() {
    try {
      // Load most recent session summary from last 24 hours
      const recent = this.db.prepare(`
        SELECT * FROM session_summaries 
        WHERE user_id = ? AND created_at > ?
        ORDER BY created_at DESC LIMIT 1
      `).get(this.userId, Date.now() - 86400000);
      
      if (recent) {
        this.longTerm.summary = `[Previous session] ${recent.summary_text}`;
        this.longTerm.lastUpdated = recent.created_at;
        
        // Load topics if available
        if (recent.topics_json) {
          try {
            const topics = JSON.parse(recent.topics_json);
            if (Array.isArray(topics) && topics.length > 0) {
              this.shortTerm.topicFlow = topics.slice(-5);  // Last 5 topics
            }
          } catch (e) {}
        }
        
        logger.info(`SessionContextManager: Loaded previous context from ${new Date(recent.created_at).toLocaleString()}`);
      } else {
        logger.debug('SessionContextManager: No recent context found');
      }
      
      // Also load summary stats
      const stats = this.db.prepare(`
        SELECT 
          COUNT(*) as total_summaries,
          MIN(created_at) as first_summary,
          MAX(created_at) as last_summary
        FROM session_summaries 
        WHERE user_id = ?
      `).get(this.userId);
      
      if (stats?.total_summaries > 0) {
        logger.info(`SessionContextManager: ${stats.total_summaries} total summaries in history`);
      }
      
    } catch (err) {
      logger.warn(`SessionContextManager: Load previous context failed: ${err.message}`);
    }
  }
  
  /**
   * Persist summary to SQLite
   */
  _persistSummary(summaryText, summaryType = 'turn') {
    if (!this.db) return;
    
    try {
      this.db.prepare(`
        INSERT INTO session_summaries 
        (user_id, session_id, summary_type, summary_text, topics_json, mood, turn_count, period_start, period_end, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        this.userId,
        this.sessionId,
        summaryType,
        summaryText,
        JSON.stringify(this.shortTerm.topicFlow),
        this.shortTerm.mood,
        this.turnCount,
        this.sessionStart,
        Date.now(),
        Date.now()
      );
      
      logger.debug(`SessionContextManager: Persisted ${summaryType} summary`);
    } catch (err) {
      logger.warn(`SessionContextManager: Persist failed: ${err.message}`);
    }
  }
  
  // ==========================================
  // QUERY METHODS
  // ==========================================
  
  /**
   * Get summaries from the last N hours
   */
  getSummariesSince(hoursAgo = 24) {
    if (!this.db) return [];
    
    try {
      const since = Date.now() - (hoursAgo * 60 * 60 * 1000);
      return this.db.prepare(`
        SELECT * FROM session_summaries 
        WHERE user_id = ? AND created_at > ?
        ORDER BY created_at DESC
      `).all(this.userId, since);
    } catch (err) {
      logger.warn(`getSummariesSince error: ${err.message}`);
      return [];
    }
  }
  
  /**
   * Get summaries by type
   */
  getSummariesByType(summaryType, limit = 10) {
    if (!this.db) return [];
    
    try {
      return this.db.prepare(`
        SELECT * FROM session_summaries 
        WHERE user_id = ? AND summary_type = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(this.userId, summaryType, limit);
    } catch (err) {
      logger.warn(`getSummariesByType error: ${err.message}`);
      return [];
    }
  }
  
  /**
   * Search summaries by keyword
   */
  searchSummaries(keyword, limit = 20) {
    if (!this.db) return [];
    
    try {
      return this.db.prepare(`
        SELECT * FROM session_summaries 
        WHERE user_id = ? AND summary_text LIKE ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(this.userId, `%${keyword}%`, limit);
    } catch (err) {
      logger.warn(`searchSummaries error: ${err.message}`);
      return [];
    }
  }
  
  /**
   * Get conversation timeline (for UI display)
   */
  getTimeline(days = 7) {
    if (!this.db) return [];
    
    try {
      const since = Date.now() - (days * 24 * 60 * 60 * 1000);
      const rows = this.db.prepare(`
        SELECT 
          DATE(created_at / 1000, 'unixepoch', 'localtime') as date,
          COUNT(*) as summary_count,
          SUM(turn_count) as total_turns,
          GROUP_CONCAT(DISTINCT mood) as moods
        FROM session_summaries 
        WHERE user_id = ? AND created_at > ?
        GROUP BY DATE(created_at / 1000, 'unixepoch', 'localtime')
        ORDER BY date DESC
      `).all(this.userId, since);
      
      return rows;
    } catch (err) {
      logger.warn(`getTimeline error: ${err.message}`);
      return [];
    }
  }
  
  /**
   * Get summaries for a specific date
   */
  getSummariesForDate(dateStr) {
    if (!this.db) return [];
    
    try {
      return this.db.prepare(`
        SELECT * FROM session_summaries 
        WHERE user_id = ? AND DATE(created_at / 1000, 'unixepoch', 'localtime') = ?
        ORDER BY created_at ASC
      `).all(this.userId, dateStr);
    } catch (err) {
      logger.warn(`getSummariesForDate error: ${err.message}`);
      return [];
    }
  }
  
  /**
   * Get total stats
   */
  getStats() {
    if (!this.db) return null;
    
    try {
      return this.db.prepare(`
        SELECT 
          COUNT(*) as total_summaries,
          SUM(turn_count) as total_turns,
          MIN(created_at) as first_summary,
          MAX(created_at) as last_summary,
          COUNT(DISTINCT session_id) as total_sessions,
          COUNT(DISTINCT DATE(created_at / 1000, 'unixepoch', 'localtime')) as active_days
        FROM session_summaries 
        WHERE user_id = ?
      `).get(this.userId);
    } catch (err) {
      logger.warn(`getStats error: ${err.message}`);
      return null;
    }
  }
  
  // ==========================================
  // TURN PROCESSING
  // ==========================================
  
  /**
   * Process a new turn
   */
  async processTurn(userMessage, niaResponse = '') {
    this.turnCount++;
    const timestamp = Date.now();
    
    // Extract metadata
    const topics = this._extractTopics(userMessage);
    const boundary = this._detectBoundary(userMessage);
    const mood = this._detectMood(userMessage);
    
    // Store turn
    const turn = {
      role: 'user',
      content: userMessage,
      timestamp,
      topics: topics.map(t => t.topic),
      boundary,
      mood
    };
    this.turns.push(turn);
    
    if (niaResponse) {
      this.turns.push({
        role: 'assistant',
        content: niaResponse,
        timestamp: Date.now()
      });
    }
    
    // Update IMMEDIATE tier
    this._updateImmediate(turn);
    
    // Update SHORT-TERM tier
    this._updateShortTerm(topics, boundary, mood);
    
    // Update LONG-TERM tier (async, every N turns)
    if (this.turnCount % this.longTermUpdateInterval === 0) {
      this._updateLongTermAsync();
    }
    
    // Write debug file
    this._writeDebugFile();
    
    return {
      topics,
      boundary,
      mood,
      turnCount: this.turnCount
    };
  }
  
  /**
   * Update immediate tier
   */
  _updateImmediate(turn) {
    this.immediate.turns.push(turn);
    while (this.immediate.turns.length > this.immediate.maxTurns) {
      this.immediate.turns.shift();
    }
  }
  
  /**
   * Update short-term tier
   */
  _updateShortTerm(topics, boundary, mood) {
    const now = Date.now();
    const cutoff = now - (this.shortTerm.windowMinutes * 60 * 1000);
    
    // Update topics
    for (const { topic } of topics) {
      const existing = this.shortTerm.topics.find(t => t.topic === topic);
      if (existing) {
        existing.lastMentioned = now;
        existing.count++;
      } else {
        this.shortTerm.topics.push({
          topic,
          firstMentioned: now,
          lastMentioned: now,
          count: 1
        });
      }
      
      // Track topic flow
      if (this.shortTerm.topicFlow[this.shortTerm.topicFlow.length - 1] !== topic) {
        this.shortTerm.topicFlow.push(topic);
        if (this.shortTerm.topicFlow.length > 20) {
          this.shortTerm.topicFlow.shift();
        }
      }
    }
    
    // Prune stale topics
    this.shortTerm.topics = this.shortTerm.topics.filter(t => t.lastMentioned > cutoff);
    
    // Update mood
    if (mood !== 'neutral') {
      this.shortTerm.mood = mood;
    }
    
    // Track boundaries
    if (boundary) {
      this.shortTerm.boundaries.push({
        ...boundary,
        timestamp: now,
        topics: topics.map(t => t.topic)
      });
    }
    
    // Prune old boundaries
    this.shortTerm.boundaries = this.shortTerm.boundaries.filter(b => b.timestamp > cutoff);
  }
  
  /**
   * Update long-term summary (async LLM call)
   */
  async _updateLongTermAsync() {
    if (this.longTerm.updating) return; // Already updating
    if (this.turns.length < 4) return;  // Not enough content
    
    this.longTerm.updating = true;
    
    try {
      // Build conversation for summarization
      const recentTurns = this.turns.slice(-20); // Last 20 turns max
      const conversationText = recentTurns
        .map(t => `${t.role === 'user' ? 'Blaze' : 'Nia'}: ${t.content.substring(0, 300)}`)
        .join('\n');
      
      const prompt = `Summarize this conversation in 2-3 sentences. Focus on:
- Main topics discussed
- Blaze's mood/state
- Any important things Nia should remember

Conversation:
${conversationText}

Summary (2-3 sentences):`;

      const response = await fetch(this.llmEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'local-model',
          messages: [
            { role: 'system', content: 'You are summarizing a conversation. Be concise.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 150
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        this.longTerm.summary = data.choices[0].message.content.trim();
        this.longTerm.lastUpdated = Date.now();
        logger.debug(`Long-term summary updated: ${this.longTerm.summary.substring(0, 50)}...`);
        
        // NEW: Persist to SQLite
        this._persistSummary(this.longTerm.summary, 'turn');
      }
    } catch (err) {
      logger.debug(`Long-term summary failed: ${err.message}`);
    } finally {
      this.longTerm.updating = false;
    }
    
    // Update debug file after async update
    this._writeDebugFile();
  }
  
  /**
   * Extract topics from message
   */
  _extractTopics(message) {
    const found = [];
    for (const [topic, pattern] of Object.entries(this.topicPatterns)) {
      if (pattern.test(message)) {
        found.push({ topic, confidence: 0.8 });
      }
    }
    return found;
  }
  
  /**
   * Detect boundaries
   */
  _detectBoundary(message) {
    for (const { pattern, reason } of this.boundaryPatterns) {
      if (pattern.test(message)) {
        return { reason, quote: message.substring(0, 80) };
      }
    }
    return null;
  }
  
  /**
   * Detect mood
   */
  _detectMood(message) {
    if (this.moodPatterns.positive.test(message)) return 'positive';
    if (this.moodPatterns.negative.test(message)) return 'negative';
    return 'neutral';
  }
  
  // ==========================================
  // OUTPUT METHODS
  // ==========================================
  
  /**
   * Get immediate context (last few turns, raw)
   */
  getImmediateContext() {
    if (this.immediate.turns.length === 0) return null;
    
    return this.immediate.turns
      .map(t => {
        const role = t.role === 'user' ? 'Blaze' : 'You';
        const content = t.content
          .replace(/<think>[\s\S]*?<\/think>/g, '')
          .replace(/\*[^*]+\*/g, '')
          .trim()
          .substring(0, 150);
        return `${role}: ${content}${t.content.length > 150 ? '...' : ''}`;
      })
      .join('\n');
  }
  
  /**
   * Get short-term context (topics, flow, mood)
   */
  getShortTermContext() {
    const parts = [];
    
    // Topic flow
    if (this.shortTerm.topicFlow.length > 0) {
      const uniqueFlow = [...new Set(this.shortTerm.topicFlow)].slice(-5);
      parts.push(`Topics: ${uniqueFlow.join(' → ')}`);
    }
    
    // Current mood
    if (this.shortTerm.mood !== 'neutral') {
      parts.push(`Mood: ${this.shortTerm.mood}`);
    }
    
    // Active boundaries
    if (this.shortTerm.boundaries.length > 0) {
      const reasons = [...new Set(this.shortTerm.boundaries.map(b => b.reason))];
      parts.push(`⚠️ Boundaries: ${reasons.join(', ')}`);
    }
    
    // Hot topics (mentioned multiple times)
    const hotTopics = this.shortTerm.topics
      .filter(t => t.count >= 2)
      .map(t => `${t.topic}(${t.count})`);
    if (hotTopics.length > 0) {
      parts.push(`Focus: ${hotTopics.join(', ')}`);
    }
    
    return parts.length > 0 ? parts.join(' | ') : null;
  }
  
  /**
   * Get long-term context (LLM summary)
   */
  getLongTermContext() {
    if (!this.longTerm.summary) return null;
    
    const age = this.longTerm.lastUpdated 
      ? Math.round((Date.now() - this.longTerm.lastUpdated) / 60000)
      : null;
    
    return {
      summary: this.longTerm.summary,
      ageMinutes: age
    };
  }
  
  /**
   * Build full context for prompt injection
   */
  buildFullContext() {
    const sections = [];
    
    // Session info
    const durationMin = Math.round((Date.now() - this.sessionStart) / 60000);
    sections.push(`Session: ${durationMin} min, ${this.turnCount} turns`);
    
    // Long-term (if available)
    const longTerm = this.getLongTermContext();
    if (longTerm) {
      sections.push(`\n📋 SESSION SUMMARY:\n${longTerm.summary}`);
    }
    
    // Short-term
    const shortTerm = this.getShortTermContext();
    if (shortTerm) {
      sections.push(`\n📍 RECENT CONTEXT:\n${shortTerm}`);
    }
    
    // Immediate
    const immediate = this.getImmediateContext();
    if (immediate) {
      sections.push(`\n💬 LAST FEW TURNS:\n${immediate}`);
    }
    
    return sections.join('\n');
  }
  
  /**
   * Get current topic
   */
  getCurrentTopic() {
    if (this.shortTerm.topicFlow.length === 0) return null;
    return this.shortTerm.topicFlow[this.shortTerm.topicFlow.length - 1];
  }
  
  // ==========================================
  // DEBUG OUTPUT
  // ==========================================
  
  /**
   * Write debug file to disk
   */
  _writeDebugFile() {
    try {
      const content = this._buildDebugContent();
      fs.writeFileSync(this.debugFilePath, content);
    } catch (err) {
      // Silently ignore write errors
    }
  }
  
  /**
   * Build debug content
   */
  _buildDebugContent() {
    const now = new Date().toLocaleString();
    const durationMin = Math.round((Date.now() - this.sessionStart) / 60000);
    
    let content = `╔══════════════════════════════════════════════════════════════╗
║           NIA SESSION CONTEXT - LIVE DEBUG                   ║
╚══════════════════════════════════════════════════════════════╝
Last Updated: ${now}
Session ID: ${this.sessionId}
Session Duration: ${durationMin} minutes | Turns: ${this.turnCount}
User: ${this.userId}
DB Connected: ${this.db ? 'Yes' : 'No'}

`;

    // IMMEDIATE TIER
    content += `┌─────────────────────────────────────────────────────────────┐
│ IMMEDIATE (Last ${this.immediate.maxTurns} turns)                                      │
└─────────────────────────────────────────────────────────────┘
`;
    const immediate = this.getImmediateContext();
    content += immediate || '(no turns yet)';
    content += '\n\n';
    
    // SHORT-TERM TIER
    content += `┌─────────────────────────────────────────────────────────────┐
│ SHORT-TERM (Last ${this.shortTerm.windowMinutes} minutes)                                     │
└─────────────────────────────────────────────────────────────┘
`;
    content += `Topic Flow: ${this.shortTerm.topicFlow.join(' → ') || '(none)'}\n`;
    content += `Current Mood: ${this.shortTerm.mood}\n`;
    content += `Active Topics: ${this.shortTerm.topics.map(t => `${t.topic}(${t.count})`).join(', ') || '(none)'}\n`;
    content += `Boundaries: ${this.shortTerm.boundaries.map(b => `${b.reason}`).join(', ') || '(none)'}\n\n`;
    
    // LONG-TERM TIER
    content += `┌─────────────────────────────────────────────────────────────┐
│ LONG-TERM (LLM Summary)                                     │
└─────────────────────────────────────────────────────────────┘
`;
    if (this.longTerm.summary) {
      const age = this.longTerm.lastUpdated 
        ? Math.round((Date.now() - this.longTerm.lastUpdated) / 60000)
        : '?';
      content += `Last Updated: ${age} min ago\n`;
      content += `Summary: ${this.longTerm.summary}\n`;
    } else {
      content += `(Not yet generated - updates every ${this.longTermUpdateInterval} turns)\n`;
    }
    content += '\n';
    
    // PERSISTENCE STATS
    if (this.db) {
      const stats = this.getStats();
      if (stats) {
        content += `┌─────────────────────────────────────────────────────────────┐
│ PERSISTENCE (SQLite)                                        │
└─────────────────────────────────────────────────────────────┘
`;
        content += `Total Summaries: ${stats.total_summaries}\n`;
        content += `Total Turns: ${stats.total_turns || 0}\n`;
        content += `Active Days: ${stats.active_days || 0}\n`;
        content += `Sessions: ${stats.total_sessions || 0}\n`;
        if (stats.first_summary) {
          content += `History Since: ${new Date(stats.first_summary).toLocaleDateString()}\n`;
        }
        content += '\n';
      }
    }
    
    // WHAT GETS INJECTED
    content += `┌─────────────────────────────────────────────────────────────┐
│ INJECTED INTO PROMPT                                        │
└─────────────────────────────────────────────────────────────┘
`;
    content += this.buildFullContext();
    content += '\n';
    
    return content;
  }
  
  /**
   * Reset session (starts fresh but keeps DB history)
   */
  resetSession() {
    // Save final summary before reset
    if (this.longTerm.summary && this.db) {
      this._persistSummary(this.longTerm.summary, 'session');
    }
    
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.sessionStart = Date.now();
    this.turnCount = 0;
    this.turns = [];
    this.immediate.turns = [];
    this.shortTerm.topics = [];
    this.shortTerm.boundaries = [];
    this.shortTerm.topicFlow = [];
    this.shortTerm.mood = 'neutral';
    this.longTerm.summary = null;
    this.longTerm.themes = [];
    this.longTerm.lastUpdated = null;
    this._writeDebugFile();
    logger.info('Session context manager reset');
  }
  
  /**
   * Get full state (for IPC/debugging)
   */
  getState() {
    return {
      sessionId: this.sessionId,
      sessionStart: this.sessionStart,
      durationMs: Date.now() - this.sessionStart,
      turnCount: this.turnCount,
      userId: this.userId,
      immediate: this.immediate,
      shortTerm: this.shortTerm,
      longTerm: this.longTerm,
      injectedContext: this.buildFullContext(),
      dbConnected: !!this.db,
      persistenceStats: this.db ? this.getStats() : null
    };
  }
}

module.exports = SessionContextManager;
