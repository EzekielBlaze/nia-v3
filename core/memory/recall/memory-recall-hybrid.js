/**
 * MEMORY RECALL - HYBRID (Smart Combined Search)
 * Combines fast keyword search with semantic vector search
 * ~145 lines (Target: <150)
 */

const logger = require('../../../utils/logger');

class MemoryRecallHybrid {
  constructor(fastRecall, semanticRecall) {
    this.fast = fastRecall;
    this.semantic = semanticRecall;
  }
  
  /**
   * Hybrid search: fast first, semantic if needed
   */
  async recall(query, options = {}) {
    const {
      limit = 10,
      semanticThreshold = 0.7,
      includeRelated = false
    } = options;
    
    const startTime = Date.now();
    
    // Stage 1: Fast keyword search (skip if not available)
    let keywordResults = [];
    if (this.fast) {
      try {
        keywordResults = this.fast.search(query, { 
          limit: limit * 2,
          ...options 
        });
      } catch (err) {
        logger.warn(`Fast recall failed: ${err.message}`);
      }
    }
    
    // Assess keyword confidence
    const keywordConfidence = this._assessConfidence(keywordResults, query);
    
    let semanticResults = [];
    let usedSemantic = false;
    
    // Stage 2: Semantic search if keyword confidence low
    if (keywordConfidence < semanticThreshold && this.semantic) {
      logger.debug(`Keyword confidence ${keywordConfidence.toFixed(2)} < ${semanticThreshold}, triggering semantic search`);
      
      try {
        semanticResults = await this.semantic.search(query, {
          limit: limit * 2,
          ...options
        });
        usedSemantic = true;
      } catch (err) {
        logger.warn(`Semantic recall failed: ${err.message}`);
      }
    }
    
    // Merge results
    const merged = this._mergeResults(keywordResults, semanticResults, limit);
    
    const elapsed = Date.now() - startTime;
    
    logger.info(`Hybrid recall: ${merged.length} memories in ${elapsed}ms (keyword: ${keywordResults.length}, semantic: ${semanticResults.length})`);
    
    return {
      memories: merged,
      stats: {
        total: merged.length,
        keywordMatches: keywordResults.length,
        semanticMatches: semanticResults.length,
        usedSemantic,
        keywordConfidence,
        responseTime: elapsed
      }
    };
  }
  
  /**
   * Assess keyword search confidence
   */
  _assessConfidence(results, query) {
    if (results.length === 0) return 0;
    
    // Check top result strengths
    const topResults = results.slice(0, 3);
    const avgStrength = topResults.reduce((sum, r) => sum + r.strength, 0) / topResults.length;
    
    // Check keyword coverage
    const queryWords = new Set(
      query.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2)
    );
    
    const resultWords = new Set();
    results.forEach(r => {
      r.topics.forEach(t => resultWords.add(t.toLowerCase()));
      r.statement.toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2)
        .forEach(w => resultWords.add(w));
    });
    
    const coverage = [...queryWords].filter(w => resultWords.has(w)).length / queryWords.size;
    
    // Combine signals
    return (avgStrength * 0.6) + (coverage * 0.4);
  }
  
  /**
   * Merge keyword and semantic results
   */
  _mergeResults(keywordResults, semanticResults, limit) {
    const seen = new Set();
    const combined = [];
    
    // Add keyword results (higher priority for exact matches)
    for (const mem of keywordResults) {
      if (!seen.has(mem.id)) {
        seen.add(mem.id);
        combined.push(mem);
      }
    }
    
    // Add semantic results
    for (const mem of semanticResults) {
      if (!seen.has(mem.id)) {
        seen.add(mem.id);
        combined.push(mem);
      }
    }
    
    // Calculate composite score
    combined.forEach(m => {
      m.recallScore = this._calculateRecallScore(m);
    });
    
    // Sort by recall score
    combined.sort((a, b) => b.recallScore - a.recallScore);
    
    return combined.slice(0, limit);
  }
  
  /**
   * Calculate composite recall score
   */
  _calculateRecallScore(memory) {
    let score = 0;
    
    // Base: memory strength (0-1) Ã— 40 points
    score += memory.strength * 40;
    
    // Recency bonus (newer = better)
    const ageMs = Date.now() - memory.committedAt;
    const ageDays = ageMs / 86400000;
    const recencyBonus = Math.max(0, 20 - (ageDays * 0.5));
    score += recencyBonus;
    
    // Access frequency bonus
    const accessBonus = Math.min(20, memory.accessCount * 2);
    score += accessBonus;
    
    // Semantic score (if available)
    if (memory.semanticScore) {
      score += memory.semanticScore * 20;
    }
    
    return score;
  }
}

module.exports = MemoryRecallHybrid;
