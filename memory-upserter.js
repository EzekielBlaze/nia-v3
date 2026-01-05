/**
 * MEMORY UPSERTER
 * 
 * Smart database operations for memory storage:
 * - Duplicate detection
 * - Similarity matching  
 * - Strength reinforcement
 * - Conflict handling
 * - Auto-embedding to Qdrant
 */

const logger = require('./utils/logger');

class MemoryUpserter {
  constructor(db, embedder = null) {
    this.db = db;
    this.embedder = embedder; // MemoryEmbedder for Qdrant
    this.similarityThreshold = 0.70; // 70% = same memory
  }
  
  /**
   * Upsert a validated memory fact
   * Returns { action, id?, reason? }
   */
  async upsertMemory(fact, thinkingLogId = null) {
    // 1. Check for exact duplicate
    const exact = this._findExactMatch(fact.statement);
    if (exact) {
      return this._reinforceMemory(exact, fact);
    }
    
    // 2. Check for similar memory
    const similar = this._findSimilarMemory(fact.statement);
    if (similar) {
      // Very similar = reinforce, moderately similar = create related
      if (similar.similarity > 0.85) {
        return this._reinforceMemory(similar, fact);
      } else {
        return await this._insertNewMemory(fact, thinkingLogId, similar.id);
      }
    }
    
    // 3. Insert new memory
    return await this._insertNewMemory(fact, thinkingLogId);
  }
  
  /**
   * Find exact match by statement
   */
  _findExactMatch(statement) {
    try {
      return this.db.prepare(`
        SELECT id, memory_statement, strength, access_count
        FROM memory_commits
        WHERE LOWER(memory_statement) = LOWER(?)
        AND is_active = 1
      `).get(statement);
    } catch (err) {
      logger.debug(`Exact match query failed: ${err.message}`);
      return null;
    }
  }
  
  /**
   * Find similar memory using word overlap
   */
  _findSimilarMemory(statement) {
    try {
      const memories = this.db.prepare(`
        SELECT id, memory_statement, strength, access_count
        FROM memory_commits
        WHERE is_active = 1
        LIMIT 500
      `).all();
      
      const targetWords = this._extractKeyWords(statement);
      if (targetWords.length === 0) return null;
      
      let bestMatch = null;
      let bestSimilarity = 0;
      
      for (const mem of memories) {
        const memWords = this._extractKeyWords(mem.memory_statement);
        const similarity = this._jaccardSimilarity(targetWords, memWords);
        
        if (similarity > this.similarityThreshold && similarity > bestSimilarity) {
          bestMatch = mem;
          bestSimilarity = similarity;
        }
      }
      
      if (bestMatch) {
        return { ...bestMatch, similarity: bestSimilarity };
      }
      
      return null;
    } catch (err) {
      logger.debug(`Similar match query failed: ${err.message}`);
      return null;
    }
  }
  
  /**
   * Extract key words for comparison
   */
  _extractKeyWords(text) {
    const stopWords = new Set([
      'i', 'me', 'my', 'you', 'your', 'we', 'they', 'their', 'a', 'an', 'the',
      'and', 'or', 'but', 'is', 'am', 'are', 'was', 'were', 'be', 'been',
      'to', 'of', 'in', 'on', 'at', 'for', 'with', 'from', 'that', 'this'
    ]);
    
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));
  }
  
  /**
   * Jaccard similarity between word sets
   */
  _jaccardSimilarity(words1, words2) {
    if (words1.length === 0 || words2.length === 0) return 0;
    
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    let intersection = 0;
    for (const w of set1) {
      if (set2.has(w)) intersection++;
    }
    
    const union = set1.size + set2.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
  
  /**
   * Reinforce existing memory
   */
  _reinforceMemory(existing, fact) {
    try {
      const newStrength = Math.min(1.0, (existing.strength || 0.5) + 0.1);
      const newAccessCount = (existing.access_count || 0) + 1;
      
      this.db.prepare(`
        UPDATE memory_commits
        SET strength = ?,
            access_count = ?,
            last_accessed = ?
        WHERE id = ?
      `).run(newStrength, newAccessCount, Date.now(), existing.id);
      
      logger.debug(`Reinforced memory ${existing.id}: strength -> ${newStrength.toFixed(2)}`);
      
      return {
        action: 'reinforced',
        id: existing.id,
        statement: existing.memory_statement,
        previousStrength: existing.strength,
        newStrength,
        reason: 'Duplicate/similar fact'
      };
    } catch (err) {
      logger.error(`Failed to reinforce memory: ${err.message}`);
      return { action: 'error', reason: err.message };
    }
  }
  
  /**
   * Insert new memory
   */
  async _insertNewMemory(fact, thinkingLogId = null, relatedMemoryId = null) {
    const now = Date.now();
    const vectorId = `mem_${now}_${Math.random().toString(36).substr(2, 9)}`;
    const temporalBucket = new Date(now).toISOString().split('T')[0];
    
    // Map fact type to memory type
    const memoryType = this._mapFactType(fact.fact_type);
    
    // Calculate initial strength from importance
    const strength = Math.min(1.0, (fact.importance || 5) / 10);
    
    try {
      const result = this.db.prepare(`
        INSERT INTO memory_commits (
          memory_statement,
          memory_type,
          committed_at,
          temporal_bucket,
          commit_trigger,
          formation_context,
          topics_json,
          subjects_json,
          related_memory_ids,
          vector_id,
          strength,
          source_turn_id,
          source_thinking_log_id,
          is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        fact.statement,
        memoryType,
        now,
        temporalBucket,
        'auto_extract',
        JSON.stringify({
          source_quote: fact.source_quote,
          fact_type: fact.fact_type,
          temporal: fact.temporal,
          importance: fact.importance
        }),
        '[]', // topics_json
        JSON.stringify([fact.about || 'user']),
        relatedMemoryId ? JSON.stringify([relatedMemoryId]) : null,
        vectorId,
        strength,
        null, // source_turn_id
        thinkingLogId
      );
      
      const memoryId = result.lastInsertRowid;
      
      // Insert into FTS index
      this._insertFTS(memoryId, fact);
      
      // Embed to Qdrant for semantic search
      if (this.embedder) {
        try {
          await this.embedder.embed(vectorId, fact.statement, {
            topics: [],
            subjects: [fact.about || 'user']
          });
          logger.debug(`Memory ${memoryId} embedded to Qdrant`);
        } catch (embedErr) {
          logger.warn(`Failed to embed memory ${memoryId}: ${embedErr.message}`);
        }
      }
      
      logger.info(`Created memory ${memoryId}: "${fact.statement.substring(0, 50)}..." [${memoryType}]`);
      
      return {
        action: 'created',
        id: memoryId,
        statement: fact.statement,
        vectorId,
        strength,
        type: memoryType,
        relatedTo: relatedMemoryId
      };
      
    } catch (err) {
      logger.error(`Failed to insert memory: ${err.message}`);
      return { action: 'error', reason: err.message };
    }
  }
  
  /**
   * Insert into FTS index
   */
  _insertFTS(memoryId, fact) {
    try {
      this.db.prepare(`
        INSERT INTO memory_fts(rowid, memory_statement, topics, subjects)
        VALUES (?, ?, ?, ?)
      `).run(
        memoryId,
        fact.statement,
        '[]',
        JSON.stringify([fact.about || 'user'])
      );
    } catch (err) {
      // FTS might not exist - that's okay
      logger.debug(`FTS insert skipped: ${err.message}`);
    }
  }
  
  /**
   * Map extraction fact type to DB memory type
   */
  _mapFactType(factType) {
    // Valid DB types: 'fact', 'preference', 'event', 'realization', 'context', 'observation'
    const typeMap = {
      'attribute': 'observation',
      'preference': 'preference',
      'relationship': 'observation',
      'state': 'context',
      'event': 'event',
      'membership': 'observation'
    };
    return typeMap[factType] || 'observation';
  }
  
  /**
   * Batch upsert multiple facts
   */
  async batchUpsert(facts, thinkingLogId = null) {
    const results = {
      created: 0,
      reinforced: 0,
      errors: 0,
      details: []
    };
    
    for (const fact of facts) {
      const result = await this.upsertMemory(fact, thinkingLogId);
      
      switch (result.action) {
        case 'created':
          results.created++;
          break;
        case 'reinforced':
          results.reinforced++;
          break;
        case 'error':
          results.errors++;
          break;
      }
      
      results.details.push(result);
    }
    
    logger.info(`Batch upsert: ${results.created} created, ${results.reinforced} reinforced, ${results.errors} errors`);
    
    return results;
  }
}

module.exports = MemoryUpserter;
