/**
 * MEMORY EXTRACTION ENGINE - Two-Pass Pipeline
 * 
 * Pass A: Extract entities mentioned by user
 * Pass B: Extract facts about each entity
 * 
 * This architecture ensures we ONLY extract from user messages,
 * preventing LLM hallucinations from becoming "memories."
 */

const Database = require('better-sqlite3');
const logger = require('./utils/logger');
const MemoryValidator = require('./memory-validator');
const MemoryUpserter = require('./memory-upserter');
const {
  PASS_A_ENTITY_EXTRACTION,
  PASS_B_FACT_EXTRACTION,
  generatePassAPrompt,
  generatePassBPrompt,
  isTrivialMessage
} = require('./memory-extraction-prompts');

class MemoryExtractionEngine {
  constructor(dbPath, options = {}) {
    this.db = new Database(dbPath);
    this.validator = new MemoryValidator();
    this.embedder = options.embedder || null; // For Qdrant auto-embedding
    this.upserter = new MemoryUpserter(this.db, this.embedder);
    this.dryRun = options.dryRun || false;
    
    // LLM client (injected) or fallback to local
    this.llmClient = options.llmClient || null;
    this.llmEndpoint = options.llmEndpoint || 'http://localhost:1234/v1/chat/completions';
    this.llmModel = options.llmModel || 'local-model';
    
    // Rate limiting
    this.maxFactsPerTurn = 4;
    this.minMessageLength = 15;
    
    // Stats
    this.stats = {
      processed: 0,
      trivialSkipped: 0,
      entitiesExtracted: 0,
      factsExtracted: 0,
      factsValidated: 0,
      factsRejected: 0,
      memoriesCreated: 0,
      memoriesReinforced: 0
    };
    
    this._ensureSchema();
    
    logger.info('MemoryExtractionEngine initialized');
    if (this.dryRun) {
      logger.info('🏃 DRY-RUN MODE: No database writes');
    }
  }
  
  /**
   * Ensure database schema
   */
  _ensureSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_extraction_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turn_id INTEGER,
        user_message TEXT,
        pass_a_output TEXT,
        pass_b_output TEXT,
        entities_extracted INTEGER DEFAULT 0,
        facts_extracted INTEGER DEFAULT 0,
        facts_valid INTEGER DEFAULT 0,
        facts_rejected INTEGER DEFAULT 0,
        memories_created INTEGER DEFAULT 0,
        memories_reinforced INTEGER DEFAULT 0,
        processing_time_ms INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
      
      CREATE INDEX IF NOT EXISTS idx_mem_extract_audit_created 
      ON memory_extraction_audit(created_at DESC);
    `);
  }
  
  /**
   * Call LLM API (uses injected client if available)
   */
  async _callLLM(systemPrompt, userPrompt, temperature = 0.2) {
    // Use injected llmClient if available
    if (this.llmClient) {
      return this.llmClient.chat(systemPrompt, [
        { role: 'user', content: userPrompt }
      ], { temperature, maxTokens: 1000 });
    }
    
    // Fallback to local fetch
    try {
      const response = await fetch(this.llmEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.llmModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature,
          max_tokens: 1000
        })
      });
      
      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status}`);
      }
      
      const data = await response.json();
      return data.choices[0].message.content;
      
    } catch (err) {
      logger.error(`LLM call failed: ${err.message}`);
      throw err;
    }
  }
  
  /**
   * Parse JSON from LLM response
   */
  _parseJSON(text) {
    try {
      return JSON.parse(text);
    } catch (err) {
      // Handle markdown fences
      let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '');
      
      // Extract JSON object
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]);
      }
      
      throw new Error('Could not parse JSON from LLM output');
    }
  }
  
  /**
   * PASS A: Extract entities from user message
   */
  async _extractEntities(userMessage) {
    logger.debug('Pass A: Extracting entities...');
    
    const userPrompt = generatePassAPrompt(userMessage);
    const rawOutput = await this._callLLM(PASS_A_ENTITY_EXTRACTION, userPrompt);
    
    logger.debug(`Pass A raw: ${rawOutput.substring(0, 150)}...`);
    
    const parsed = this._parseJSON(rawOutput);
    
    if (!parsed.entities || !Array.isArray(parsed.entities)) {
      logger.warn('Invalid Pass A output, using default');
      return {
        entities: [{ id: 'user', type: 'self', name: 'the user' }],
        rawOutput
      };
    }
    
    // Ensure user is always present
    if (!parsed.entities.some(e => e.id === 'user')) {
      parsed.entities.unshift({ id: 'user', type: 'self', name: 'the user' });
    }
    
    logger.debug(`Pass A: Found ${parsed.entities.length} entities: ${parsed.entities.map(e => e.id).join(', ')}`);
    
    return {
      entities: parsed.entities,
      rawOutput
    };
  }
  
  /**
   * PASS B: Extract facts about entities
   */
  async _extractFacts(userMessage, entities) {
    logger.debug('Pass B: Extracting facts...');
    
    const userPrompt = generatePassBPrompt(userMessage, entities);
    const rawOutput = await this._callLLM(PASS_B_FACT_EXTRACTION, userPrompt);
    
    logger.debug(`Pass B raw: ${rawOutput.substring(0, 150)}...`);
    
    const parsed = this._parseJSON(rawOutput);
    
    if (!parsed.facts || !Array.isArray(parsed.facts)) {
      logger.debug('No facts extracted');
      return { facts: [], rawOutput };
    }
    
    logger.debug(`Pass B: Extracted ${parsed.facts.length} fact candidates`);
    
    return {
      facts: parsed.facts,
      rawOutput
    };
  }
  
  /**
   * Main extraction pipeline
   * 
   * @param userMessage - User's message (ONLY source of truth)
   * @param assistantResponse - Not used for extraction, only for context
   * @param metadata - Optional { turnId, sessionId }
   */
  async extractFromTurn(userMessage, assistantResponse = '', metadata = {}) {
    const startTime = Date.now();
    this.stats.processed++;
    
    // 1. Pre-filter trivial messages
    if (isTrivialMessage(userMessage)) {
      this.stats.trivialSkipped++;
      logger.debug(`Skipping trivial: "${userMessage.substring(0, 30)}..."`);
      return {
        success: true,
        skipped: true,
        reason: 'trivial_message',
        processingTime: Date.now() - startTime
      };
    }
    
    // 2. Length check
    if (userMessage.length < this.minMessageLength) {
      return {
        success: true,
        skipped: true,
        reason: 'message_too_short',
        processingTime: Date.now() - startTime
      };
    }
    
    try {
      // 3. PASS A: Extract entities
      const passA = await this._extractEntities(userMessage);
      this.stats.entitiesExtracted += passA.entities.length;
      
      // If only "user" entity, might still have self-facts
      // Continue to Pass B
      
      // 4. PASS B: Extract facts
      const passB = await this._extractFacts(userMessage, passA.entities);
      this.stats.factsExtracted += passB.facts.length;
      
      if (passB.facts.length === 0) {
        this._recordAudit(metadata.turnId, userMessage, passA, passB, 0, 0, 0, 0, Date.now() - startTime);
        return {
          success: true,
          entities: passA.entities.length,
          facts: 0,
          reason: 'no_facts_extracted',
          processingTime: Date.now() - startTime
        };
      }
      
      // 5. Validate facts against user message
      const validationResults = this.validator.validateBatch(passB.facts, userMessage);
      const validFacts = validationResults.filter(r => r.valid);
      const rejectedFacts = validationResults.filter(r => !r.valid);
      
      this.stats.factsValidated += validFacts.length;
      this.stats.factsRejected += rejectedFacts.length;
      
      // Log rejections
      rejectedFacts.forEach(r => {
        logger.debug(`Rejected: "${r.fact.statement?.substring(0, 40)}..." - ${r.errors.join(', ')}`);
      });
      
      if (validFacts.length === 0) {
        this._recordAudit(metadata.turnId, userMessage, passA, passB, passB.facts.length, 0, 0, 0, Date.now() - startTime);
        return {
          success: true,
          entities: passA.entities.length,
          facts: passB.facts.length,
          validated: 0,
          rejected: rejectedFacts.length,
          reason: 'all_facts_rejected',
          rejections: rejectedFacts.map(r => ({
            statement: r.fact.statement,
            errors: r.errors
          })),
          processingTime: Date.now() - startTime
        };
      }
      
      // 6. Rate limit - keep top N by score
      const toStore = validFacts
        .slice(0, this.maxFactsPerTurn)
        .map(r => r.fact);
      
      // 7. Upsert to database (unless dry-run)
      let upsertResult = { created: 0, reinforced: 0, errors: 0, details: [] };
      
      if (!this.dryRun) {
        upsertResult = this.upserter.batchUpsert(toStore, metadata.thinkingLogId);
        this.stats.memoriesCreated += upsertResult.created;
        this.stats.memoriesReinforced += upsertResult.reinforced;
      } else {
        logger.info(`[DRY-RUN] Would store ${toStore.length} facts:`);
        toStore.forEach(f => logger.info(`  - (${f.about}) "${f.statement}"`));
      }
      
      // 8. Record audit
      this._recordAudit(
        metadata.turnId,
        userMessage,
        passA,
        passB,
        passB.facts.length,
        validFacts.length,
        upsertResult.created,
        upsertResult.reinforced,
        Date.now() - startTime
      );
      
      logger.info(`Memory extraction: ${passB.facts.length} extracted, ${validFacts.length} valid, ${upsertResult.created} created, ${upsertResult.reinforced} reinforced`);
      
      return {
        success: true,
        entities: passA.entities.length,
        facts: passB.facts.length,
        validated: validFacts.length,
        rejected: rejectedFacts.length,
        created: upsertResult.created,
        reinforced: upsertResult.reinforced,
        memories: upsertResult.details.filter(d => d.action !== 'error'),
        processingTime: Date.now() - startTime
      };
      
    } catch (err) {
      logger.error(`Memory extraction failed: ${err.message}`);
      return {
        success: false,
        error: err.message,
        processingTime: Date.now() - startTime
      };
    }
  }
  
  /**
   * Record audit entry
   */
  _recordAudit(turnId, userMessage, passA, passB, extracted, valid, created, reinforced, processingTime) {
    if (this.dryRun) return;
    
    try {
      this.db.prepare(`
        INSERT INTO memory_extraction_audit (
          turn_id, user_message, pass_a_output, pass_b_output,
          entities_extracted, facts_extracted, facts_valid, facts_rejected,
          memories_created, memories_reinforced, processing_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        turnId || null,
        userMessage.substring(0, 500),
        passA?.rawOutput?.substring(0, 1000) || null,
        passB?.rawOutput?.substring(0, 1000) || null,
        passA?.entities?.length || 0,
        extracted,
        valid,
        extracted - valid,
        created,
        reinforced,
        processingTime
      );
    } catch (err) {
      logger.debug(`Audit record failed: ${err.message}`);
    }
  }
  
  /**
   * Get extraction statistics
   */
  getStats() {
    return {
      ...this.stats,
      validationRate: this.stats.factsExtracted > 0
        ? ((this.stats.factsValidated / this.stats.factsExtracted) * 100).toFixed(1) + '%'
        : 'N/A'
    };
  }
  
  /**
   * Get recent extractions from audit
   */
  getRecentExtractions(limit = 10) {
    try {
      return this.db.prepare(`
        SELECT * FROM memory_extraction_audit
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit);
    } catch (err) {
      return [];
    }
  }
  
  /**
   * Shutdown
   */
  shutdown() {
    if (this.db) {
      this.db.close();
      logger.info('MemoryExtractionEngine shut down');
    }
  }
}

module.exports = MemoryExtractionEngine;
