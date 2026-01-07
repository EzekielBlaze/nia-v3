/**
 * BELIEF EXTRACTION ENGINE - Two-Pass Pipeline
 * 
 * Pass A: Extract subjects/entities from conversation
 * Pass B: Extract beliefs about each subject
 * 
 * This architecture forces multi-subject extraction by making
 * the LLM acknowledge concepts before extracting beliefs.
 */

const Database = require('better-sqlite3');
const fetch = require('node-fetch');
const logger = require('./utils/logger');
const BeliefValidator = require('./belief-validator');
const BeliefUpserter = require('./belief-upserter');
const {
  PASS_A_SUBJECT_EXTRACTION,
  PASS_B_BELIEF_EXTRACTION,
  generatePassAPrompt,
  generatePassBPrompt
} = require('./belief-extraction-prompt-v2');

class TwoPassExtractionEngine {
  constructor(dbPath, options = {}) {
    this.db = new Database(dbPath);
    this.validator = new BeliefValidator();
    this.upserter = new BeliefUpserter(this.db, options.beliefEmbedder || null);
    this.dryRun = options.dryRun || false;
    
    this.llmEndpoint = options.llmEndpoint || 'http://localhost:1234/v1/chat/completions';
    this.llmModel = options.llmModel || 'local-model';
    
    this._ensureSchema();
    
    logger.info('TwoPassExtractionEngine initialized');
    if (options.beliefEmbedder) {
      logger.info('  - Belief embedder: attached');
    }
    if (this.dryRun) {
      logger.info('ðŸƒ DRY-RUN MODE: No database writes will occur');
    }
  }
  
  /**
   * Set embedder (for late initialization after beliefIntegrator.init())
   */
  setEmbedder(embedder) {
    this.upserter.setEmbedder(embedder);
    logger.info('TwoPassExtractionEngine: Embedder attached');
  }
  
  /**
   * Ensure database schema is ready
   */
  _ensureSchema() {
    // Add subject column if missing (with error handling)
    try {
      this.db.exec(`
        ALTER TABLE beliefs ADD COLUMN subject TEXT DEFAULT 'user';
      `);
      logger.info('Added subject column to beliefs table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        logger.error(`Error adding subject column: ${err.message}`);
      }
    }
    
    // Add belief_class column if missing
    try {
      this.db.exec(`
        ALTER TABLE beliefs ADD COLUMN belief_class TEXT;
      `);
      logger.info('Added belief_class column to beliefs table');
    } catch (err) {
      if (!err.message.includes('duplicate column')) {
        logger.error(`Error adding belief_class column: ${err.message}`);
      }
    }
    
    // Create index
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_beliefs_subject ON beliefs(subject);
    `);
    
    // Ensure audit table exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS belief_extraction_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thinking_log_id INTEGER,
        pass_a_output TEXT,
        pass_b_output TEXT,
        subjects_extracted INTEGER,
        candidates_extracted INTEGER,
        candidates_valid INTEGER,
        candidates_rejected INTEGER,
        beliefs_created INTEGER,
        beliefs_updated INTEGER,
        conflicts_detected INTEGER,
        processing_time_ms INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (thinking_log_id) REFERENCES thinking_log(id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_extraction_audit_thinking 
      ON belief_extraction_audit(thinking_log_id);
    `);
  }
  
  /**
   * Call LLM API
   */
  async callLLM(systemPrompt, userPrompt, temperature = 0.3) {
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
          max_tokens: 2000
        })
      });
      
      if (!response.ok) {
        throw new Error(`LLM API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.choices[0].message.content;
      
    } catch (err) {
      logger.error(`LLM call failed: ${err.message}`);
      throw err;
    }
  }
  
  /**
   * Parse JSON from LLM response (handles markdown fences, extra text)
   */
  parseJSON(text) {
    try {
      // Try direct parse first
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
   * PASS A: Extract subjects from conversation
   */
  async extractSubjects(conversation) {
    logger.info('Pass A: Extracting subjects...');
    
    const userPrompt = generatePassAPrompt(conversation);
    const rawOutput = await this.callLLM(PASS_A_SUBJECT_EXTRACTION, userPrompt);
    
    logger.debug(`Pass A raw output: ${rawOutput.substring(0, 200)}...`);
    
    const parsed = this.parseJSON(rawOutput);
    
    if (!parsed.subjects || !Array.isArray(parsed.subjects)) {
      throw new Error('Invalid Pass A output: missing subjects array');
    }
    
    logger.info(`Pass A: Extracted ${parsed.subjects.length} subjects: ${parsed.subjects.map(s => s.id).join(', ')}`);
    
    return {
      subjects: parsed.subjects,
      rawOutput
    };
  }
  
  /**
   * PASS B: Extract beliefs about subjects
   */
  async extractBeliefs(conversation, subjects) {
    logger.info('Pass B: Extracting beliefs...');
    
    const userPrompt = generatePassBPrompt(conversation, subjects);
    const rawOutput = await this.callLLM(PASS_B_BELIEF_EXTRACTION, userPrompt);
    
    logger.debug(`Pass B raw output: ${rawOutput.substring(0, 200)}...`);
    
    const parsed = this.parseJSON(rawOutput);
    
    if (!parsed.beliefs || !Array.isArray(parsed.beliefs)) {
      logger.warn('Invalid Pass B output: missing beliefs array, returning empty');
      return { beliefs: [], rawOutput };
    }
    
    logger.info(`Pass B: Extracted ${parsed.beliefs.length} belief candidates`);
    
    return {
      beliefs: parsed.beliefs,
      rawOutput
    };
  }
  
  /**
   * Convert Pass B belief format to our internal candidate format
   */
  convertToCandidate(belief) {
    return {
      type: 'belief',
      statement: belief.statement,
      polarity: belief.polarity || 'affirmed',
      subject: belief.about_id, // Use about_id as subject
      confidence: belief.confidence || 0.7,
      evidence: belief.evidence || [],
      time_scope: belief.time_scope || 'long_term',
      belief_class: belief.belief_class || 'factual',
      holder: belief.holder || 'user'
    };
  }
  
  /**
   * Process a single thinking log entry (two-pass)
   */
  async processEntry(entry) {
    const startTime = Date.now();
    
    const conversation = {
      userMessage: entry.user_message || '',
      assistantResponse: entry.response_summary || '',
      thinking: entry.thinking_content || ''
    };
    
    logger.info(`Processing thinking log entry ${entry.id}`);
    
    // PASS A: Extract subjects
    const passA = await this.extractSubjects(conversation);
    
    // PASS B: Extract beliefs about subjects
    const passB = await this.extractBeliefs(conversation, passA.subjects);
    
    // Convert to our candidate format
    const candidates = passB.beliefs.map(b => this.convertToCandidate(b));
    
    logger.info(`Converted ${candidates.length} beliefs to candidates`);
    
    // Validate candidates
    const validCandidates = [];
    const rejectedCandidates = [];
    
    for (const candidate of candidates) {
      const validation = this.validator.validate(candidate);
      
      if (validation.valid) {
        validCandidates.push({
          ...candidate,
          validation_score: validation.score
        });
      } else {
        rejectedCandidates.push({
          candidate,
          errors: validation.errors,
          warnings: validation.warnings
        });
        logger.debug(`Rejected candidate: ${candidate.statement} (${validation.errors.join(', ')})`);
      }
    }
    
    logger.info(`Validated ${candidates.length} candidates: ${validCandidates.length} valid, ${rejectedCandidates.length} rejected`);
    
    // Rate limiting: max 4 beliefs per turn
    if (validCandidates.length > 4) {
      logger.warn(`Rate limit: ${validCandidates.length} candidates, keeping top 4`);
      validCandidates.sort((a, b) => b.validation_score - a.validation_score);
      validCandidates.splice(4);
    }
    
    // Upsert beliefs (if not dry-run)
    let upsertResult = { created: [], updated: [], conflicted: [] };
    
    if (!this.dryRun && validCandidates.length > 0) {
      upsertResult = await this.upserter.batchUpsert(validCandidates, entry.id);
      logger.info(`Batch upsert: ${upsertResult.created.length} created, ${upsertResult.updated.length} updated, ${upsertResult.conflicted.length} conflicts`);
    } else if (this.dryRun) {
      logger.info(`[DRY-RUN] Would upsert ${validCandidates.length} beliefs`);
      validCandidates.forEach(c => {
        logger.info(`  - (${c.subject}) "${c.statement}" [${c.belief_class}]`);
      });
    }
    
    const processingTime = Date.now() - startTime;
    
    // Create audit record (if not dry-run)
    if (!this.dryRun) {
      this.db.prepare(`
        INSERT INTO belief_extraction_audit (
          thinking_log_id,
          pass_a_output,
          pass_b_output,
          subjects_extracted,
          candidates_extracted,
          candidates_valid,
          candidates_rejected,
          beliefs_created,
          beliefs_updated,
          conflicts_detected,
          processing_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entry.id,
        passA.rawOutput,
        passB.rawOutput,
        passA.subjects.length,
        candidates.length,
        validCandidates.length,
        rejectedCandidates.length,
        upsertResult.created.length,
        upsertResult.updated.length,
        upsertResult.conflicted.length,
        processingTime
      );
      
      // Mark as processed
      this.db.prepare(`
        UPDATE thinking_log 
        SET processed_for_beliefs = 1,
            processed_at = ?,
            beliefs_extracted = ?
        WHERE id = ?
      `).run(Date.now(), validCandidates.length, entry.id);
    }
    
    logger.info(`Processed entry ${entry.id}: ${upsertResult.created.length} created, ${upsertResult.updated.length} updated, ${rejectedCandidates.length} rejected`);
    
    return {
      subjects: passA.subjects,
      candidates: validCandidates,
      rejected: rejectedCandidates,
      created: upsertResult.created.length,
      updated: upsertResult.updated.length,
      conflicts: upsertResult.conflicted.length,
      processingTime
    };
  }
  
  /**
   * Process unprocessed thinking log entries
   */
  async processUnprocessedThinking(limit = 10) {
    const entries = this.db.prepare(`
      SELECT * FROM thinking_log
      WHERE processed_for_beliefs = 0
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit);
    
    if (entries.length === 0) {
      logger.info('No unprocessed thinking log entries found');
      return {
        processed: 0,
        created: 0,
        updated: 0,
        rejected: 0
      };
    }
    
    logger.info(`Processing up to ${limit} unprocessed thinking log entries...`);
    
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalRejected = 0;
    
    for (const entry of entries) {
      try {
        const result = await this.processEntry(entry);
        totalCreated += result.created;
        totalUpdated += result.updated;
        totalRejected += result.rejected.length;
      } catch (err) {
        logger.error(`Failed to process entry ${entry.id}: ${err.message}`);
      }
    }
    
    return {
      processed: entries.length,
      created: totalCreated,
      updated: totalUpdated,
      rejected: totalRejected
    };
  }
  
  /**
   * Get extraction statistics
   */
  getStats() {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_extractions,
        SUM(candidates_extracted) as total_candidates,
        SUM(candidates_valid) as valid_candidates,
        SUM(candidates_rejected) as rejected,
        SUM(beliefs_created) as beliefs_created,
        SUM(beliefs_updated) as beliefs_updated,
        AVG(processing_time_ms) as avg_processing_time
      FROM belief_extraction_audit
    `).get();
    
    return stats;
  }
}

module.exports = TwoPassExtractionEngine;
