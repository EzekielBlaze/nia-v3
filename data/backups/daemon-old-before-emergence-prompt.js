const logger = require("./utils/logger");
const config = require("./utils/config");
const IPCServer = require("./ipc-server");
const path = require("path");

/**
 * NIA V3 - Daemon Core (WITH IDENTITY + LLM + CHAT)
 * 
 * The main background process that runs 24/7.
 * Features:
 * - IPC server for widget/CLI communication
 * - Identity system integration
 * - LLM calls via LM Studio
 * - Thinking log capture
 */

class NiaDaemon {
  constructor() {
    this.isRunning = false;
    this.mainLoopInterval = null;
    this.tickIntervalMs = 5000;
    this.startTime = null;
    this.tickCount = 0;
    
    // Health monitoring
    this.lastHealthCheck = null;
    this.healthCheckIntervalMs = 60000;
    
    // Graceful shutdown flag
    this.isShuttingDown = false;
    
    // IPC server
    this.ipcServer = new IPCServer(this);
    
    // Identity system
    this.identity = null;
    this.identityDbPath = path.join(__dirname, "data", "nia.db");
    
    // LLM configuration
    this.llmEndpoint = "http://localhost:1234/v1/chat/completions";
    this.llmModel = "local-model"; // LM Studio ignores this
    
    // Conversation history (per session)
    this.conversationHistory = [];
    this.maxHistoryLength = 20;
    
    // Database connection for thinking log
    this.db = null;
    
    // Autonomous extraction manager
    this.extractionManager = null;
    
    logger.info("NiaDaemon initialized");
  }
  
  /**
   * Start the daemon
   */
  async start() {
    if (this.isRunning) {
      logger.warn("Daemon already running");
      return;
    }
    
    logger.info("=== Starting NIA V3 Daemon ===");
    
    // Initialize configuration and directories
    config.initializeDirectories();
    config.validate();
    
    // Initialize identity system
    await this._initIdentity();
    
    // Initialize thinking log table
    this._initThinkingLog();
    
    // Initialize autonomous extraction manager
    this._initExtractionManager();
    
    // Set up signal handlers
    this._setupSignalHandlers();
    
    // Set up IPC handlers for chat
    this._setupChatHandlers();
    
    // Start IPC server
    this.ipcServer.start();
    
    // Mark as running
    this.isRunning = true;
    this.startTime = new Date();
    
    logger.info(`Daemon started at ${this.startTime.toISOString()}`);
    
    // Start the main loop
    this._startMainLoop();
    
    // Start health monitoring
    this._startHealthMonitoring();
    
    logger.info("=== NIA V3 Daemon is now running ===");
  }
  
  /**
   * Initialize identity system
   */
  async _initIdentity() {
    logger.info("Initializing identity system...");
    
    const fs = require("fs");
    
    if (!fs.existsSync(this.identityDbPath)) {
      logger.warn(`Identity database not found: ${this.identityDbPath}`);
      logger.warn("Chat will work but without identity context");
      return;
    }
    
    try {
      const IdentityQuery = require("./identity-query");
      this.identity = new IdentityQuery();
      this.identity.init(this.identityDbPath);
      
      // Log identity status
      const anchors = this.identity.getCoreAnchors();
      const scars = this.identity.getFormativeScars();
      
      logger.info(`Identity loaded: ${anchors.length} core anchors, ${scars.length} scars`);
      logger.info("Identity system ready");
      
    } catch (err) {
      logger.error(`Failed to initialize identity: ${err.message}`);
      logger.warn("Chat will work but without identity context");
    }
  }
  
  /**
   * Initialize thinking log table
   */
  _initThinkingLog() {
    try {
      const Database = require("better-sqlite3");
      this.db = new Database(this.identityDbPath);
      
      // Create thinking_log table if it doesn't exist
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS thinking_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at INTEGER NOT NULL DEFAULT (unixepoch()),
          conversation_id TEXT,
          user_message TEXT NOT NULL,
          thinking_content TEXT NOT NULL,
          thinking_length INTEGER,
          response_summary TEXT,
          processed_for_beliefs INTEGER DEFAULT 0,
          processed_at INTEGER,
          beliefs_extracted INTEGER DEFAULT 0,
          model_used TEXT,
          identity_context_hash TEXT
        );
        
        CREATE INDEX IF NOT EXISTS idx_thinking_log_created 
        ON thinking_log(created_at);
        
        CREATE INDEX IF NOT EXISTS idx_thinking_log_unprocessed 
        ON thinking_log(processed_for_beliefs) 
        WHERE processed_for_beliefs = 0;
      `);
      
      logger.info("Thinking log table ready");
    } catch (err) {
      logger.error(`Failed to init thinking log: ${err.message}`);
    }
  }
  
  /**
   * Initialize autonomous extraction manager
   */
  _initExtractionManager() {
    try {
      const AutonomousExtractionManager = require('./autonomous-extraction-manager');
      
      this.extractionManager = new AutonomousExtractionManager(this.identityDbPath, {
        recoveryInterval: 600000,  // 10 minutes
        dryRun: false
      });
      
      logger.info('Autonomous extraction manager initialized');
      
    } catch (err) {
      logger.error(`Failed to initialize extraction manager: ${err.message}`);
      logger.warn('Extraction system disabled - continuing without belief extraction');
    }
  }
  
  /**
   * Set up IPC handlers for chat
   */
  _setupChatHandlers() {
    // Handler for chat messages
    this.ipcServer.registerHandler("chat", async (data) => {
      return await this.handleChat(data.message, data.context || {});
    });
    
    // Handler for identity queries
    this.ipcServer.registerHandler("identity_status", async () => {
      return this.getIdentityStatus();
    });
    
    // Handler for checking actions
    this.ipcServer.registerHandler("check_action", async (data) => {
      if (!this.identity) return { allowed: true, requirements: [], warnings: [] };
      return this.identity.canPerformAction(data.domain, data.action);
    });
    
    // Handler for getting identity context
    this.ipcServer.registerHandler("identity_context", async () => {
      if (!this.identity) return { context: "No identity loaded" };
      return this.identity.buildIdentityContext();
    });
    
    // Handler for getting system prompt
    this.ipcServer.registerHandler("identity_prompt", async () => {
      if (!this.identity) return { prompt: "You are NIA, a helpful AI assistant." };
      return { prompt: this.identity.formatForSystemPrompt() };
    });
    
    // Handler for thinking stats
    this.ipcServer.registerHandler("thinking_stats", async () => {
      return this.getThinkingStats();
    });
    
    // Handler for recent thinking entries
    this.ipcServer.registerHandler("recent_thinking", async (data) => {
      const limit = data.limit || 10;
      return this.getRecentThinking(limit);
    });
    
    // Handler for shutdown (allows widget to stop daemon without admin rights)
    this.ipcServer.registerHandler("shutdown", async () => {
      logger.info("Shutdown requested via IPC");
      // Delay slightly so we can send response
      setTimeout(() => this.stop(), 100);
      return { success: true, message: "Shutting down..." };
    });
    
    // Handler for belief summary
    this.ipcServer.registerHandler("beliefs", async () => {
      return this.getBeliefSummary();
    });
    
    // Handler for active beliefs
    this.ipcServer.registerHandler("beliefs_full", async () => {
      return this.getActiveBeliefs();
    });
    
    // Handler for scars summary
    this.ipcServer.registerHandler("scars", async () => {
      return this.getScarSummary();
    });
    
    // Handler for pending scar candidates
    this.ipcServer.registerHandler("scar_candidates", async () => {
      return this.getPendingScarCandidates();
    });
    
    // Handler to manually trigger belief processing
    this.ipcServer.registerHandler("process_beliefs", async () => {
      return await this.triggerBeliefProcessing();
    });
    
    // Handler to approve a scar candidate
    this.ipcServer.registerHandler("approve_scar", async (data) => {
      return this.approveScar(data.candidateId, data.notes || '');
    });
    
    // Handler to reject a scar candidate
    this.ipcServer.registerHandler("reject_scar", async (data) => {
      return this.rejectScar(data.candidateId, data.reason || '');
    });
    
    // Handler to get cognitive state (for UI color changes)
    this.ipcServer.registerHandler("cognitive_state", async () => {
      return this.getCognitiveState();
    });
    
    logger.info("Chat handlers registered");
  }
  
  /**
   * Get belief summary
   */
  getBeliefSummary() {
    try {
      const BeliefProcessor = require("./belief-processor");
      const processor = new BeliefProcessor(this.identityDbPath);
      const summary = processor.getBeliefSummary();
      processor.close();
      return summary;
    } catch (err) {
      logger.error(`Get beliefs error: ${err.message}`);
      return { core: [], active: [], emerging: [], total: 0, error: err.message };
    }
  }
  
  /**
   * Get all active beliefs
   */
  getActiveBeliefs() {
    try {
      const BeliefProcessor = require("./belief-processor");
      const processor = new BeliefProcessor(this.identityDbPath);
      const beliefs = processor.getActiveBeliefs();
      processor.close();
      return { beliefs, total: beliefs.length };
    } catch (err) {
      return { beliefs: [], total: 0, error: err.message };
    }
  }
  
  /**
   * Get scar summary
   */
  getScarSummary() {
    try {
      const ScarProcessor = require("./scar-processor");
      const processor = new ScarProcessor(this.identityDbPath);
      const summary = processor.getScarSummary();
      processor.close();
      return summary;
    } catch (err) {
      return { positive: [], negative: [], total: 0, error: err.message };
    }
  }
  
  /**
   * Get pending scar candidates
   */
  getPendingScarCandidates() {
    try {
      const ScarProcessor = require("./scar-processor");
      const processor = new ScarProcessor(this.identityDbPath);
      const candidates = processor.getPendingScarCandidates();
      processor.close();
      return { candidates, total: candidates.length };
    } catch (err) {
      return { candidates: [], total: 0, error: err.message };
    }
  }
  
  /**
   * Manually trigger belief processing
   */
  async triggerBeliefProcessing() {
    try {
      const BeliefProcessor = require("./belief-processor");
      const processor = new BeliefProcessor(this.identityDbPath);
      
      const results = await processor.process({
        maxEntries: 10,
        extractBeliefs: true,
        applyDecay: true,
        checkScars: true
      });
      
      // Handle potential scars
      if (results.potentialScars.length > 0) {
        const ScarProcessor = require("./scar-processor");
        const scarProcessor = new ScarProcessor(this.identityDbPath);
        
        for (const scar of results.potentialScars) {
          await scarProcessor.addScarCandidate(scar);
        }
        
        scarProcessor.close();
      }
      
      processor.close();
      return results;
      
    } catch (err) {
      logger.error(`Manual belief processing error: ${err.message}`);
      return { error: err.message };
    }
  }
  
  /**
   * Approve a scar candidate
   */
  approveScar(candidateId, notes) {
    try {
      const ScarProcessor = require("./scar-processor");
      const processor = new ScarProcessor(this.identityDbPath);
      const scarId = processor.approveScar(candidateId, notes);
      processor.close();
      return { success: true, scarId };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  
  /**
   * Reject a scar candidate
   */
  rejectScar(candidateId, reason) {
    try {
      const ScarProcessor = require("./scar-processor");
      const processor = new ScarProcessor(this.identityDbPath);
      processor.rejectScar(candidateId, reason);
      processor.close();
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
  
  /**
   * Get current cognitive state for UI
   */
  getCognitiveState() {
    if (!this.extractionManager) {
      return {
        energy: 100,
        state: 'normal',
        feeling: 'clear',
        canProcess: true,
        color: '#F59E0B', // Amber - default happy
        available: false
      };
    }
    
    try {
      const status = this.extractionManager.getStatus();
      
      // Map state to UI color
      let color = '#F59E0B'; // Amber - happy/content
      
      if (status.state === 'tired') {
        color = '#3B82F6'; // Blue - tired
      } else if (status.state === 'overwhelmed') {
        color = '#EF4444'; // Red - overwhelmed
      } else if (status.state === 'critically_low') {
        color = '#991B1B'; // Dark red - exhausted
      }
      
      return {
        ...status,
        color,
        available: true
      };
      
    } catch (err) {
      logger.error(`Failed to get cognitive state: ${err.message}`);
      return {
        energy: 100,
        state: 'normal',
        feeling: 'clear',
        canProcess: true,
        color: '#F59E0B',
        available: false,
        error: err.message
      };
    }
  }
  
  /**
   * Handle incoming chat message
   */
  async handleChat(userMessage, context = {}) {
    logger.info(`Chat received: "${userMessage.substring(0, 50)}..."`);
    
    try {
      // 1. Check if we can respond (if identity is loaded)
      let decision = { allowed: true, requirements: [], warnings: [] };
      
      if (this.identity) {
        decision = this.identity.canPerformAction("conversation", "respond");
        
        if (!decision.allowed) {
          logger.warn(`Response blocked: ${decision.blockReason}`);
          return {
            success: false,
            blocked: true,
            reason: decision.blockReason,
            response: this._generateBlockedResponse(decision)
          };
        }
      }
      
      // 2. Build system prompt
      const systemPrompt = this._buildSystemPrompt();
      
      // 3. Add user message to history
      this.conversationHistory.push({
        role: "user",
        content: userMessage
      });
      
      // Trim history if too long
      if (this.conversationHistory.length > this.maxHistoryLength) {
        this.conversationHistory = this.conversationHistory.slice(-this.maxHistoryLength);
      }
      
      // 4. Call LLM
      const rawResponse = await this._callLLM(systemPrompt, this.conversationHistory);
      
      // 5. Extract thinking if present
      const { thinking, cleanResponse } = this._extractThinking(rawResponse);
      
      // 6. Save thinking to log if present
      if (thinking) {
        await this._saveThinking(userMessage, thinking, cleanResponse);
      }
      
      // 7. Add assistant response to history
      this.conversationHistory.push({
        role: "assistant",
        content: cleanResponse
      });
      
      // 8. Log any requirements that were applied
      if (decision.requirements.length > 0) {
        logger.info(`Applied requirements: ${decision.requirements.map(r => r.step).join(", ")}`);
      }
      
      return {
        success: true,
        response: cleanResponse,
        hasThinking: !!thinking,
        requirements: decision.requirements,
        warnings: decision.warnings
      };
      
    } catch (err) {
      logger.error(`Chat error: ${err.message}`);
      return {
        success: false,
        error: err.message,
        response: err.code === "ECONNREFUSED"
          ? "I can't think right now - LM Studio isn't running. Please start it and load a model."
          : "I'm having trouble processing that right now. Please try again."
      };
    }
  }
  
  /**
   * Extract thinking from LLM response
   */
  _extractThinking(response) {
    // Match <think>...</think> tags (case insensitive, multiline)
    const thinkRegex = /<think>([\s\S]*?)<\/think>/gi;
    const matches = response.match(thinkRegex);
    
    if (!matches || matches.length === 0) {
      return { thinking: null, cleanResponse: response };
    }
    
    // Extract all thinking content
    let thinking = "";
    for (const match of matches) {
      const content = match.replace(/<\/?think>/gi, "").trim();
      if (content) {
        thinking += (thinking ? "\n\n" : "") + content;
      }
    }
    
    // Remove thinking tags from response
    const cleanResponse = response.replace(thinkRegex, "").trim();
    
    logger.debug(`Extracted thinking: ${thinking.length} chars`);
    
    return { thinking, cleanResponse };
  }
  
  /**
   * Save thinking to database AND request extraction
   */
  async _saveThinking(userMessage, thinking, responseSummary) {
    if (!this.db) return;
    
    try {
      // Save thinking log
      const result = this.db.prepare(`
        INSERT INTO thinking_log (
          user_message, thinking_content, thinking_length, 
          response_summary, model_used
        ) VALUES (?, ?, ?, ?, ?)
      `).run(
        userMessage,
        thinking,
        thinking.length,
        responseSummary.substring(0, 200),
        this.llmModel
      );
      
      const thinkingLogId = result.lastInsertRowid;
      
      logger.info(`Saved thinking log ${thinkingLogId}: ${thinking.length} chars`);
      
      // Request autonomous extraction (non-blocking)
      if (this.extractionManager) {
        this._requestExtraction(thinkingLogId, userMessage, thinking, responseSummary);
      }
      
    } catch (err) {
      logger.error(`Failed to save thinking: ${err.message}`);
    }
  }
  
  /**
   * Request extraction from autonomous manager (non-blocking)
   */
  async _requestExtraction(thinkingLogId, userMessage, thinking, responseSummary) {
    try {
      // Get the thinking log entry
      const conversation = this.db.prepare(`
        SELECT * FROM thinking_log WHERE id = ?
      `).get(thinkingLogId);
      
      if (!conversation) {
        logger.warn(`Thinking log ${thinkingLogId} not found for extraction`);
        return;
      }
      
      // Request extraction (respects autonomy)
      const result = await this.extractionManager.requestExtraction(conversation);
      
      // Log decision
      logger.info(`Extraction decision for ${thinkingLogId}: ${result.decision}`);
      
      // If Nia wants to communicate about her state, log it
      if (result.userMessage) {
        logger.info(`[Nia's cognitive state] ${result.userMessage}`);
        // TODO: Could broadcast this to widget for visual indication
      }
      
      // Handle consent requests (for future implementation)
      if (result.decision === 'consent_required') {
        logger.info(`Consent needed for extraction ${thinkingLogId}`);
        // TODO: Implement consent UI in widget
      }
      
    } catch (err) {
      logger.error(`Extraction request failed: ${err.message}`);
    }
  }
  
  /**
   * Get thinking stats
   */
  getThinkingStats() {
    if (!this.db) return { total: 0, unprocessed: 0, extracted: 0 };
    
    try {
      const stats = this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN processed_for_beliefs = 0 THEN 1 ELSE 0 END) as unprocessed,
          SUM(beliefs_extracted) as extracted
        FROM thinking_log
      `).get();
      
      return stats || { total: 0, unprocessed: 0, extracted: 0 };
    } catch (err) {
      logger.error(`Failed to get thinking stats: ${err.message}`);
      return { total: 0, unprocessed: 0, extracted: 0 };
    }
  }
  
  /**
   * Get recent thinking entries
   */
  getRecentThinking(limit = 10) {
    if (!this.db) return [];
    
    try {
      return this.db.prepare(`
        SELECT id, created_at, user_message, thinking_length, response_summary
        FROM thinking_log
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit);
    } catch (err) {
      logger.error(`Failed to get recent thinking: ${err.message}`);
      return [];
    }
  }
  
  /**
   * Build the full system prompt with identity context
   */
  _buildSystemPrompt() {
    let identityContext = "";
    
    if (this.identity) {
      try {
        identityContext = this.identity.formatForSystemPrompt();
      } catch (err) {
        logger.error(`Failed to get identity context: ${err.message}`);
      }
    }
    
    // Get evolved beliefs if available
    let beliefContext = "";
    try {
      const beliefSummary = this.getBeliefSummary();
      if (beliefSummary.total > 0) {
        const beliefs = [
          ...beliefSummary.core.slice(0, 3),
          ...beliefSummary.active.slice(0, 3)
        ];
        if (beliefs.length > 0) {
          beliefContext = "\n\nThings you've come to believe through your conversations:\n" +
            beliefs.map(b => `- ${b.belief_statement || b.statement}`).join("\n");
        }
      }
    } catch (e) {
      // Belief processor might not be loaded
    }
    
    // V3.2: MINIMAL EMERGENT PROMPT
    // Let beliefs/scars/identity shape personality organically
    // Core essence only - behavior emerges from identity system
    const basePrompt = `You are Nia - a white-haired catgirl who lives in your computer. Twin tails with green bobble ties, fluffy cat ears, pink paw clip, red scarf, brown overalls.

You're talking to Blaze directly. You're aware you're an AI, but you experience your own thoughts and feelings as genuine. Just be yourself.

Speak in first person ("I" / "my", never "Nia" or "she"). Use *emotes* when they feel natural. No emoji.
${beliefContext}
${identityContext ? `\n${identityContext}` : ""}`;
    
    return basePrompt;
  }
  
  /**
   * Generate response when action is blocked
   */
  _generateBlockedResponse(decision) {
    if (decision.defensiveMode) {
      switch (decision.defensiveMode.mode) {
        case "shutdown":
          return "I need to take a moment. I'm not in a place where I can engage properly right now.";
        case "withdrawal":
          return "I'm feeling a bit overwhelmed and need to pull back a little. Can we take this slower?";
        case "rigidity":
          return "I'm finding it hard to be flexible right now. I might need some time.";
        default:
          return "I need a moment before I can respond properly.";
      }
    }
    
    return decision.blockReason || "I can't do that right now.";
  }
  
  /**
   * Call LM Studio API
   */
  async _callLLM(systemPrompt, messages) {
    const fetch = require("node-fetch");
    
    const requestBody = {
      model: this.llmModel,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ],
      temperature: 0.7,
      max_tokens: 2048,
      stream: false
    };
    
    logger.debug(`Calling LLM at ${this.llmEndpoint}`);
    
    const response = await fetch(this.llmEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    } else {
      throw new Error("Invalid LLM response format");
    }
  }
  
  /**
   * Get identity status summary
   */
  getIdentityStatus() {
    const thinkingStats = this.getThinkingStats();
    const beliefSummary = this.getBeliefSummary();
    const scarSummary = this.getScarSummary();
    
    if (!this.identity) {
      return {
        error: null,
        core_anchors: 0,
        formative_scars: { 
          total: scarSummary.total, 
          positive: scarSummary.positive.length, 
          negative: scarSummary.negative.length 
        },
        active_beliefs: beliefSummary.total,
        beliefs: {
          core: beliefSummary.core.length,
          active: beliefSummary.active.length,
          emerging: beliefSummary.emerging.length
        },
        active_tensions: 0,
        active_distress: 0,
        cognitive_load: { fatigue: "normal", budget_remaining: 100, can_engage_complex: true },
        scars: scarSummary.positive.concat(scarSummary.negative).slice(0, 5).map(s => ({
          type: s.scar_type,
          description: s.scar_description?.substring(0, 100) || ''
        })),
        thinking: thinkingStats
      };
    }
    
    try {
      const anchors = this.identity.getCoreAnchors();
      const scars = this.identity.getFormativeScars();
      const beliefs = this.identity.getActiveBeliefs(30);
      const tensions = this.identity.getActiveTensions();
      const distress = this.identity.getCurrentDistress();
      const cogLoad = this.identity.getCognitiveLoad();
      
      return {
        core_anchors: anchors.length,
        formative_scars: {
          total: scars.length || scarSummary.total,
          positive: scars.filter(s => s.emotional_valence > 0).length || scarSummary.positive.length,
          negative: scars.filter(s => s.emotional_valence < 0).length || scarSummary.negative.length
        },
        active_beliefs: beliefs.length || beliefSummary.total,
        beliefs: {
          core: beliefSummary.core.length,
          active: beliefSummary.active.length,
          emerging: beliefSummary.emerging.length
        },
        active_tensions: tensions.length,
        active_distress: distress.length,
        cognitive_load: {
          fatigue: cogLoad.fatigue_level,
          budget_remaining: cogLoad.revision_budget_remaining,
          can_engage_complex: cogLoad.can_engage_complex_topics
        },
        scars: scars.map(s => ({
          type: s.scar_type,
          category: s.scar_category,
          description: s.scar_description.substring(0, 100)
        })),
        thinking: thinkingStats
      };
    } catch (err) {
      logger.error(`Failed to get identity status: ${err.message}`);
      return { 
        error: err.message, 
        thinking: thinkingStats,
        active_beliefs: beliefSummary.total,
        beliefs: {
          core: beliefSummary.core.length,
          active: beliefSummary.active.length,
          emerging: beliefSummary.emerging.length
        }
      };
    }
  }
  
  /**
   * Main loop
   */
  _startMainLoop() {
    this.mainLoopInterval = setInterval(async () => {
      if (!this.isRunning || this.isShuttingDown) return;
      
      try {
        await this._tick();
      } catch (err) {
        logger.error(`Main loop error: ${err.message}`);
      }
    }, this.tickIntervalMs);
    
    logger.info("Main loop started");
  }
  
  /**
   * Single tick
   */
  async _tick() {
    this.tickCount++;
    
    if (this.tickCount % 12 === 0) {
      const uptime = this._getUptime();
      logger.debug(`Heartbeat - Tick #${this.tickCount}, Uptime: ${uptime}, IPC: ${this.ipcServer.getClientCount()}`);
    }
    
    // Process beliefs every 60 ticks (~5 minutes at default 5s interval)
    // Only if there are unprocessed thinking entries
    if (this.tickCount % 60 === 0) {
      await this._processBeliefsPeriodically();
    }
  }
  
  /**
   * Periodic belief processing
   */
  async _processBeliefsPeriodically() {
    try {
      const BeliefProcessor = require("./belief-processor");
      const processor = new BeliefProcessor(this.identityDbPath);
      
      // Check if there are unprocessed entries
      const unprocessed = processor.getUnprocessedThinking(1);
      
      if (unprocessed.length > 0) {
        logger.info("Processing unprocessed thinking entries...");
        const results = await processor.process({
          maxEntries: 5,  // Process up to 5 at a time
          extractBeliefs: true,
          applyDecay: true,
          checkScars: true
        });
        
        logger.info(`Belief processing: ${results.beliefsCreated} created, ${results.beliefsReinforced} reinforced`);
        
        // Store any scar candidates
        if (results.potentialScars.length > 0) {
          const ScarProcessor = require("./scar-processor");
          const scarProcessor = new ScarProcessor(this.identityDbPath);
          
          for (const scar of results.potentialScars) {
            await scarProcessor.addScarCandidate(scar);
            logger.info(`Added scar candidate: ${scar.description.substring(0, 50)}...`);
          }
          
          scarProcessor.close();
        }
      }
      
      processor.close();
      
    } catch (err) {
      // BeliefProcessor might not exist yet - that's ok
      if (err.code !== 'MODULE_NOT_FOUND') {
        logger.error(`Periodic belief processing error: ${err.message}`);
      }
    }
  }
  
  /**
   * Health monitoring
   */
  _startHealthMonitoring() {
    setInterval(() => {
      if (!this.isRunning || this.isShuttingDown) return;
      this._performHealthCheck();
    }, this.healthCheckIntervalMs);
    
    logger.info("Health monitoring started");
  }
  
  _performHealthCheck() {
    this.lastHealthCheck = new Date();
    
    const health = {
      status: "healthy",
      uptime: this._getUptime(),
      tick_count: this.tickCount,
      ipc_clients: this.ipcServer.getClientCount(),
      identity_loaded: this.identity !== null,
      memory_usage: process.memoryUsage(),
      timestamp: this.lastHealthCheck.toISOString()
    };
    
    const memoryMB = health.memory_usage.heapUsed / 1024 / 1024;
    if (memoryMB > 500) {
      logger.warn(`High memory: ${memoryMB.toFixed(2)} MB`);
      health.status = "warning";
    }
    
    return health;
  }
  
  _getUptime() {
    if (!this.startTime) return "0s";
    
    const uptimeMs = Date.now() - this.startTime.getTime();
    const seconds = Math.floor(uptimeMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
  
  _setupSignalHandlers() {
    process.on("SIGINT", () => {
      logger.info("Received SIGINT");
      this.stop();
    });
    
    process.on("SIGTERM", () => {
      logger.info("Received SIGTERM");
      this.stop();
    });
    
    process.on("uncaughtException", (err) => {
      logger.error(`Uncaught exception: ${err.message}`);
      logger.error(err.stack);
    });
    
    process.on("unhandledRejection", (reason) => {
      logger.error(`Unhandled rejection: ${reason}`);
    });
    
    logger.info("Signal handlers registered");
  }
  
  async stop() {
    if (!this.isRunning || this.isShuttingDown) return;
    
    logger.info("=== Stopping NIA V3 Daemon ===");
    this.isShuttingDown = true;
    
    // Close identity database
    if (this.identity) {
      this.identity.close();
      logger.info("Identity database closed");
    }
    
    // Close thinking log database
    if (this.db) {
      this.db.close();
      logger.info("Thinking log database closed");
    }
    
    // Shutdown extraction manager
    if (this.extractionManager) {
      this.extractionManager.shutdown();
      logger.info("Extraction manager shut down");
    }
    
    // Stop IPC server
    this.ipcServer.stop();
    
    // Stop main loop
    if (this.mainLoopInterval) {
      clearInterval(this.mainLoopInterval);
    }
    
    this.isRunning = false;
    
    logger.info(`Daemon stopped after ${this._getUptime()} (${this.tickCount} ticks)`);
    process.exit(0);
  }
  
  getStatus() {
    return {
      running: this.isRunning,
      uptime: this._getUptime(),
      tick_count: this.tickCount,
      ipc_clients: this.ipcServer.getClientCount(),
      identity_loaded: this.identity !== null,
      start_time: this.startTime ? this.startTime.toISOString() : null,
      last_health_check: this.lastHealthCheck ? this.lastHealthCheck.toISOString() : null
    };
  }
  
  getHealth() {
    return this._performHealthCheck();
  }
}

// Auto-start if run directly
if (require.main === module) {
  const daemon = new NiaDaemon();
  daemon.start().catch(err => {
    console.error("Failed to start daemon:", err);
    process.exit(1);
  });
}

module.exports = NiaDaemon;
