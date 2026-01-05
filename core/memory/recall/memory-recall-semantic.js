/**
 * MEMORY RECALL - SEMANTIC (Vector Search)
 * Uses vector embeddings for semantic similarity search
 * ~125 lines (Target: <150)
 */

const Database = require('better-sqlite3');
const TimeFormatter = require('../temporal/time-formatter');
const logger = require('../../../utils/logger');

class MemoryRecallSemantic {
  constructor(dbPath, vectorStore, embedder) {
    this.db = new Database(dbPath);
    this.vectorStore = vectorStore; // VectorStoreMemories instance
    this.embedder = embedder;        // MemoryEmbedder instance
  }
  
  /**
   * Semantic search using vector similarity
   */
  async search(query, options = {}) {
    const {
      limit = 10,
      minStrength = 0.2,
      minScore = 0.5,
      timeWindow = null
    } = options;
    
    if (!this.vectorStore || !this.embedder) {
      logger.warn('Vector store or embedder not available');
      return [];
    }
    
    try {
      // Get query embedding
      const queryVector = await this.embedder.getEmbedding(query);
      
      // Build filter for Qdrant
      const filter = this._buildVectorFilter(options);
      
      // Search vector store
      const vectorResults = await this.vectorStore.search(queryVector, {
        limit: limit * 2, // Get more, filter by strength later
        filter,
        scoreThreshold: minScore
      });
      
      if (vectorResults.length === 0) {
        return [];
      }
      
      // Get memory IDs from vector results
      const memoryIds = vectorResults.map(r => r.memoryId);
      
      // Hydrate from database
      const placeholders = memoryIds.map(() => '?').join(',');
      let sql = `
        SELECT * FROM memory_commits
        WHERE id IN (${placeholders})
          AND is_active = 1
          AND strength >= ?
      `;
      
      const params = [...memoryIds, minStrength];
      
      // Time window filter
      if (timeWindow) {
        const cutoff = this._getTimeWindowCutoff(timeWindow);
        sql += ` AND committed_at >= ?`;
        params.push(cutoff);
      }
      
      const memories = this.db.prepare(sql).all(...params);
      
      // Merge with vector scores
      return memories.map(m => {
        const vectorResult = vectorResults.find(v => v.memoryId === m.id);
        return this._hydrate(m, vectorResult?.score || 0);
      }).sort((a, b) => b.semanticScore - a.semanticScore)
        .slice(0, limit);
      
    } catch (err) {
      logger.error(`Semantic search failed: ${err.message}`);
      return [];
    }
  }
  
  /**
   * Build Qdrant filter from options
   */
  _buildVectorFilter(options) {
    const filter = { must: [] };
    
    if (options.topics && options.topics.length > 0) {
      filter.must.push({
        key: 'topics',
        match: { any: options.topics }
      });
    }
    
    if (options.subjects && options.subjects.length > 0) {
      filter.must.push({
        key: 'subjects',
        match: { any: options.subjects }
      });
    }
    
    return filter.must.length > 0 ? filter : undefined;
  }
  
  /**
   * Get time window cutoff
   */
  _getTimeWindowCutoff(window) {
    const now = Date.now();
    const day = 86400000;
    
    switch (window) {
      case 'today': return now - day;
      case 'last_week': return now - (7 * day);
      case 'last_month': return now - (30 * day);
      case 'last_year': return now - (365 * day);
      default: return 0;
    }
  }
  
  /**
   * Hydrate memory with semantic score
   */
  _hydrate(row, semanticScore) {
    return {
      id: row.id,
      statement: row.memory_statement,
      type: row.memory_type,
      committedAt: row.committed_at,
      when: TimeFormatter.relativeTime(row.committed_at),
      topics: JSON.parse(row.topics_json || '[]'),
      subjects: JSON.parse(row.subjects_json || '[]'),
      strength: row.strength,
      accessCount: row.access_count,
      vectorId: row.vector_id,
      formationContext: row.formation_context,
      semanticScore,
      source: 'semantic_vector'
    };
  }
}

module.exports = MemoryRecallSemantic;
