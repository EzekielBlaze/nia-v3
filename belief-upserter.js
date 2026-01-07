/**
 * BELIEF UPSERT - Smart merging and conflict detection
 * 
 * Handles:
 * - Similarity detection (same belief already exists?)
 * - Evidence accumulation
 * - Conviction score updates
 * - Conflict detection and resolution
 * - Temporal validity
 * - Qdrant embedding (if embedder available)
 */

const logger = require('./utils/logger');

class BeliefUpserter {
  constructor(db, embedder = null) {
    this.db = db;
    this.embedder = embedder; // BeliefEmbedder for Qdrant (optional)
    
    // Ensure schema has vector_id column
    this._ensureSchema();
  }
  
  /**
   * Ensure required columns exist
   */
  _ensureSchema() {
    // Add vector_id column if missing
    try {
      this.db.exec(`ALTER TABLE beliefs ADD COLUMN vector_id TEXT`);
      logger.info('BeliefUpserter: Added vector_id column');
    } catch (err) {
      // Column already exists - this is fine
      if (!err.message.includes('duplicate column')) {
        logger.debug(`vector_id column check: ${err.message}`);
      }
    }
    
    // Add embedding_model column if missing
    try {
      this.db.exec(`ALTER TABLE beliefs ADD COLUMN embedding_model TEXT`);
    } catch (err) {
      // Already exists
    }
    
    // Add poincare_norm column if missing
    try {
      this.db.exec(`ALTER TABLE beliefs ADD COLUMN poincare_norm REAL`);
    } catch (err) {
      // Already exists
    }
    
    // Add hierarchy_level column if missing
    try {
      this.db.exec(`ALTER TABLE beliefs ADD COLUMN hierarchy_level INTEGER`);
    } catch (err) {
      // Already exists
    }
  }
  
  /**
   * Set embedder (for late initialization)
   */
  setEmbedder(embedder) {
    this.embedder = embedder;
    logger.info('BeliefUpserter: Embedder attached');
  }
  
  /**
   * Upsert a validated candidate into beliefs table
   */
  async upsertBelief(candidate, thinkingLogId) {
    // 1. Check for similar existing belief
    const similar = this.findSimilarBelief(candidate.statement);
    
    if (similar) {
      // Update existing belief
      return this.updateExistingBelief(similar, candidate, thinkingLogId);
    } else {
      // Check for conflicts
      const conflicts = this.detectConflicts(candidate);
      
      if (conflicts.length > 0) {
        return await this.handleConflict(candidate, conflicts, thinkingLogId);
      } else {
        // Insert new belief
        return await this.insertNewBelief(candidate, thinkingLogId);
      }
    }
  }
  
  /**
   * Find similar existing belief using fuzzy matching
   */
  findSimilarBelief(statement) {
    // Get all active beliefs
    const beliefs = this.db.prepare(`
      SELECT id, belief_statement, conviction_score, evidence_count
      FROM beliefs
      WHERE valid_to IS NULL
    `).all();
    
    // Simple similarity: same key words + high overlap
    const stmtWords = this.extractKeyWords(statement);
    
    for (const belief of beliefs) {
      const beliefWords = this.extractKeyWords(belief.belief_statement);
      const similarity = this.calculateSimilarity(stmtWords, beliefWords);
      
      if (similarity > 0.7) { // 70% similarity threshold
        logger.debug(`Found similar belief (${(similarity * 100).toFixed(0)}% match): "${belief.belief_statement}"`);
        return { ...belief, similarity };
      }
    }
    
    return null;
  }
  
  /**
   * Extract key words from statement (simple version)
   */
  extractKeyWords(statement) {
    // Remove common words
    const stopWords = new Set(['i', 'am', 'is', 'are', 'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'for', 'in', 'on', 'at']);
    
    return statement.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
  }
  
  /**
   * Calculate Jaccard similarity between two word sets
   */
  calculateSimilarity(words1, words2) {
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    const intersection = new Set([...set1].filter(w => set2.has(w)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }
  
  /**
   * Update existing belief with new evidence
   */
  updateExistingBelief(existing, candidate, thinkingLogId) {
    // Calculate new conviction score (weighted average)
    const oldWeight = existing.evidence_count;
    const newWeight = 1;
    const totalWeight = oldWeight + newWeight;
    
    const newConviction = (
      (existing.conviction_score * oldWeight) +
      (candidate.validation_score * newWeight)
    ) / totalWeight;
    
    // Update belief
    this.db.prepare(`
      UPDATE beliefs
      SET 
        conviction_score = ?,
        evidence_count = evidence_count + 1,
        last_reinforced = ?,
        times_reinforced = times_reinforced + 1,
        confidence_trend = 'rising'
      WHERE id = ?
    `).run(newConviction, Date.now(), existing.id);
    
    // Record causality
    this.recordCausality(existing.id, thinkingLogId, 'reinforcement');
    
    // Log merge reasoning
    const matchPercent = existing.similarity ? (existing.similarity * 100).toFixed(0) : 'N/A';
    logger.info(`Merged beliefs (${matchPercent}% similarity): "${existing.belief_statement}" (${existing.conviction_score.toFixed(0)}% â†’ ${newConviction.toFixed(0)}%)`);
    
    return {
      action: 'updated',
      beliefId: existing.id,
      oldConviction: existing.conviction_score,
      newConviction: newConviction,
      similarity: existing.similarity
    };
  }
  
  /**
   * Insert new belief
   */
  async insertNewBelief(candidate, thinkingLogId) {
    const now = Date.now();
    
    // Map candidate type to belief_type
    const beliefType = this.mapType(candidate.type);
    
    const result = this.db.prepare(`
      INSERT INTO beliefs (
        belief_statement,
        belief_type,
        conviction_score,
        evidence_count,
        subject,
        valid_from,
        valid_to,
        formation_reasoning,
        created_at
      ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)
    `).run(
      candidate.statement,
      beliefType,
      candidate.validation_score,
      candidate.subject || 'user', // Default to 'user' if not specified
      candidate.validity?.valid_from || now,
      candidate.validity?.valid_to || null,
      candidate.formation_reasoning,
      now
    );
    
    const beliefId = result.lastInsertRowid;
    
    // Record causality
    this.recordCausality(beliefId, thinkingLogId, 'formation');
    
    // Embed to Qdrant if embedder available
    if (this.embedder) {
      try {
        // BeliefEmbedder.embed() now returns full data including poincare_norm
        const embedResult = await this.embedder.embed(beliefId, candidate.statement, beliefType);
        
        // Store to Qdrant
        await this.embedder.storeInQdrant(embedResult.vectorId, embedResult.embedding, {
          belief_id: beliefId,
          statement: candidate.statement.substring(0, 500),
          type: beliefType,
          conviction: candidate.validation_score,
          poincare_norm: embedResult.poincare_norm,
          hierarchy_level: embedResult.hierarchy_level
        });
        
        // Store vector_id AND poincare metrics in SQLite
        this.db.prepare(`
          UPDATE beliefs 
          SET vector_id = ?, 
              embedding_model = 'poincare-v1',
              poincare_norm = ?, 
              hierarchy_level = ?
          WHERE id = ?
        `).run(
          embedResult.vectorId, 
          embedResult.poincare_norm, 
          embedResult.hierarchy_level,
          beliefId
        );
        
        logger.debug(`Belief ${beliefId} embedded: norm=${embedResult.poincare_norm?.toFixed(3)}, level=${embedResult.hierarchy_level}`);
      } catch (embedErr) {
        logger.warn(`Failed to embed belief ${beliefId}: ${embedErr.message}`);
        // Continue - belief is still in SQLite, just not searchable via vectors
      }
    }
    
    // Create descriptive subject label
    let subjectLabel;
    if (candidate.subject === 'user') {
      subjectLabel = 'about Blaze';
    } else if (candidate.subject === 'self' || candidate.subject === 'assistant') {
      subjectLabel = 'about Nia';
    } else {
      subjectLabel = `about ${candidate.subject}`;
    }
    
    logger.info(`Created belief ${beliefId} (${subjectLabel}): "${candidate.statement}" (${candidate.validation_score.toFixed(0)}%)`);
    
    return {
      action: 'created',
      beliefId: beliefId,
      conviction: candidate.validation_score,
      subject: candidate.subject
    };
  }
  
  /**
   * Map candidate type to belief_type
   */
  mapType(candidateType) {
    const typeMap = {
      'belief': 'value',
      'ephemeral_fact': 'fact',
      'scar': 'principle',          // scars become high-conviction principles
      'experience': 'experience'    // learned from action→consequence
    };
    return typeMap[candidateType] || 'value';
  }
  
  /**
   * Detect conflicts with existing beliefs
   */
  detectConflicts(candidate) {
    const conflicts = [];
    
    // Get beliefs that might conflict
    const beliefs = this.db.prepare(`
      SELECT id, belief_statement, conviction_score
      FROM beliefs
      WHERE valid_to IS NULL
        AND conviction_score > 50
    `).all();
    
    // Check for negation patterns
    const stmt = candidate.statement.toLowerCase();
    
    for (const belief of beliefs) {
      const beliefStmt = belief.belief_statement.toLowerCase();
      
      // Simple conflict detection:
      // "I value X" vs "I don't value X"
      // "I avoid X" vs "I embrace X"
      
      const stmtCore = stmt.replace(/^i (don't|do not|never) /i, 'i ');
      const beliefCore = beliefStmt.replace(/^i (don't|do not|never) /i, 'i ');
      
      const similarity = this.calculateSimilarity(
        this.extractKeyWords(stmtCore),
        this.extractKeyWords(beliefCore)
      );
      
      if (similarity > 0.6) {
        const stmtNegated = /^i (don't|do not|never|avoid)/i.test(stmt);
        const beliefNegated = /^i (don't|do not|never|avoid)/i.test(beliefStmt);
        
        if (stmtNegated !== beliefNegated) {
          conflicts.push({
            id: belief.id,
            statement: belief.belief_statement,
            conviction: belief.conviction_score,
            conflictType: 'negation'
          });
        }
      }
    }
    
    return conflicts;
  }
  
  /**
   * Handle belief conflict
   */
  async handleConflict(candidate, conflicts, thinkingLogId) {
    const now = Date.now();
    
    logger.warn(`Conflict detected: "${candidate.statement}" vs ${conflicts.length} existing beliefs`);
    
    // Strategy: retire old conflicting beliefs, insert new one
    for (const conflict of conflicts) {
      if (candidate.validation_score > conflict.conviction) {
        // New belief is stronger - retire old one
        this.db.prepare(`
          UPDATE beliefs
          SET 
            valid_to = ?,
            formation_reasoning = formation_reasoning || ' | RETIRED: Superseded by stronger conflicting belief'
          WHERE id = ?
        `).run(now, conflict.id);
        
        logger.info(`Retired conflicting belief ${conflict.id}: "${conflict.statement}"`);
      } else {
        // Old belief is stronger - mark as tension
        logger.info(`Keeping stronger belief ${conflict.id}, not inserting weaker candidate`);
        return {
          action: 'rejected_conflict',
          conflictsWith: conflict.id,
          reason: 'Existing belief has higher conviction'
        };
      }
    }
    
    // Insert new belief
    return await this.insertNewBelief(candidate, thinkingLogId);
  }
  
  /**
   * Record causality between belief and thinking log
   */
  recordCausality(beliefId, thinkingLogId, causalityType) {
    // Create causality table if it doesn't exist
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS belief_causality (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        belief_id INTEGER NOT NULL,
        thinking_log_id INTEGER NOT NULL,
        causality_type TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (belief_id) REFERENCES beliefs(id),
        FOREIGN KEY (thinking_log_id) REFERENCES thinking_log(id)
      );
    `);
    
    this.db.prepare(`
      INSERT INTO belief_causality (belief_id, thinking_log_id, causality_type)
      VALUES (?, ?, ?)
    `).run(beliefId, thinkingLogId, causalityType);
  }
  
  /**
   * Batch upsert multiple candidates
   */
  async batchUpsert(validatedCandidates, thinkingLogId) {
    const results = {
      created: [],
      updated: [],
      conflicted: []
    };
    
    for (const candidate of validatedCandidates) {
      const result = await this.upsertBelief(candidate, thinkingLogId);
      
      if (result.action === 'created') {
        results.created.push(result);
      } else if (result.action === 'updated') {
        results.updated.push(result);
      } else if (result.action === 'rejected_conflict') {
        results.conflicted.push(result);
      }
    }
    
    logger.info(`Batch upsert: ${results.created.length} created, ${results.updated.length} updated, ${results.conflicted.length} conflicts`);
    
    return results;
  }
}

module.exports = BeliefUpserter;
