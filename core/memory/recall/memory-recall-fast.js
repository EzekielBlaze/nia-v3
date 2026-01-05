/**
 * MEMORY RECALL - FAST (Keyword Search)
 * Uses SQLite FTS5 for fast keyword matching
 * Falls back to LIKE search if FTS unavailable
 */

const Database = require('better-sqlite3');
const TimeFormatter = require('../temporal/time-formatter');

// Logger with fallback if not found
let logger;
try {
  logger = require('../../utils/logger');
} catch (e) {
  logger = {
    debug: () => {},
    info: console.log,
    warn: console.warn,
    error: console.error
  };
}

class MemoryRecallFast {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.ftsAvailable = this._checkFTS();
  }
  
  /**
   * Check if FTS table is available
   */
  _checkFTS() {
    try {
      const result = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='memory_fts'").get();
      return !!result;
    } catch (err) {
      return false;
    }
  }
  
  /**
   * Fast keyword search - FTS with LIKE fallback
   */
  search(query, options = {}) {
    const {
      limit = 10,
      minStrength = 0.2,
      timeWindow = null,
      topics = [],
      subjects = []
    } = options;
    
    // Extract keywords from query
    const keywords = this._extractKeywords(query);
    
    if (keywords.length === 0) {
      return [];
    }
    
    // Try FTS first if available
    if (this.ftsAvailable) {
      try {
        return this._searchFTS(keywords, { limit, minStrength, timeWindow, topics, subjects });
      } catch (ftsErr) {
        logger.debug(`FTS query failed (${ftsErr.message}), using LIKE fallback`);
        this.ftsAvailable = false; // Don't try FTS again
      }
    }
    
    // Fallback to LIKE search
    return this._searchLIKE(keywords, { limit, minStrength, timeWindow, topics, subjects });
  }
  
  /**
   * FTS-based search
   */
  _searchFTS(keywords, options) {
    const { limit, minStrength, timeWindow, topics, subjects } = options;
    
    // Build FTS query
    const ftsQuery = keywords.map(k => `"${k}"`).join(' OR ');
    
    let sql = `
      SELECT 
        mc.id,
        mc.memory_statement,
        mc.memory_type,
        mc.committed_at,
        mc.topics_json,
        mc.subjects_json,
        mc.strength,
        mc.access_count,
        mc.vector_id,
        mc.formation_context
      FROM memory_fts
      JOIN memory_commits mc ON memory_fts.rowid = mc.id
      WHERE memory_fts MATCH ?
        AND mc.is_active = 1
        AND mc.strength >= ?
    `;
    
    const params = [ftsQuery, minStrength];
    
    if (timeWindow) {
      const cutoff = this._getTimeWindowCutoff(timeWindow);
      sql += ` AND mc.committed_at >= ?`;
      params.push(cutoff);
    }
    
    if (topics.length > 0) {
      const topicConditions = topics.map(() => `mc.topics_json LIKE ?`).join(' OR ');
      sql += ` AND (${topicConditions})`;
      topics.forEach(topic => params.push(`%"${topic}"%`));
    }
    
    if (subjects.length > 0) {
      const subjectConditions = subjects.map(() => `mc.subjects_json LIKE ?`).join(' OR ');
      sql += ` AND (${subjectConditions})`;
      subjects.forEach(subject => params.push(`%"${subject}"%`));
    }
    
    sql += ` ORDER BY rank, mc.strength DESC LIMIT ?`;
    params.push(limit);
    
    const results = this.db.prepare(sql).all(...params);
    return results.map(r => this._hydrate(r, 'fast_fts'));
  }
  
  /**
   * LIKE-based fallback search (slower but always works)
   */
  _searchLIKE(keywords, options) {
    const { limit, minStrength, timeWindow, topics, subjects } = options;
    
    // Build LIKE conditions - match any keyword
    const likeConditions = keywords.map(() => `LOWER(mc.memory_statement) LIKE ?`).join(' OR ');
    const likeParams = keywords.map(k => `%${k.toLowerCase()}%`);
    
    let sql = `
      SELECT 
        mc.id,
        mc.memory_statement,
        mc.memory_type,
        mc.committed_at,
        mc.topics_json,
        mc.subjects_json,
        mc.strength,
        mc.access_count,
        mc.vector_id,
        mc.formation_context
      FROM memory_commits mc
      WHERE (${likeConditions})
        AND mc.is_active = 1
        AND mc.strength >= ?
    `;
    
    const params = [...likeParams, minStrength];
    
    if (timeWindow) {
      const cutoff = this._getTimeWindowCutoff(timeWindow);
      sql += ` AND mc.committed_at >= ?`;
      params.push(cutoff);
    }
    
    if (topics.length > 0) {
      const topicConditions = topics.map(() => `mc.topics_json LIKE ?`).join(' OR ');
      sql += ` AND (${topicConditions})`;
      topics.forEach(topic => params.push(`%"${topic}"%`));
    }
    
    if (subjects.length > 0) {
      const subjectConditions = subjects.map(() => `mc.subjects_json LIKE ?`).join(' OR ');
      sql += ` AND (${subjectConditions})`;
      subjects.forEach(subject => params.push(`%"${subject}"%`));
    }
    
    sql += ` ORDER BY mc.strength DESC, mc.committed_at DESC LIMIT ?`;
    params.push(limit);
    
    const results = this.db.prepare(sql).all(...params);
    return results.map(r => this._hydrate(r, 'fast_like'));
  }
  
  /**
   * Extract keywords from text
   */
  _extractKeywords(text) {
    const stopwords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 
      'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are',
      'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'can',
      'what', 'who', 'how', 'when', 'where', 'why', 'which',
      'you', 'your', 'also', 'about', 'just', 'know', 'like',
      'recall', 'remember', 'tell', 'me', 'please'
    ]);
    
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopwords.has(w));
  }
  
  /**
   * Get time window cutoff timestamp
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
   * Hydrate database row to memory object
   */
  _hydrate(row, source = 'fast_keyword') {
    return {
      id: row.id,
      memory_statement: row.memory_statement,  // Include raw field
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
      source: source
    };
  }
  
  /**
   * Get total memory count
   */
  count(filters = {}) {
    let sql = 'SELECT COUNT(*) as count FROM memory_commits WHERE is_active = 1';
    const params = [];
    
    if (filters.minStrength) {
      sql += ' AND strength >= ?';
      params.push(filters.minStrength);
    }
    
    const result = this.db.prepare(sql).get(...params);
    return result.count;
  }
}

module.exports = MemoryRecallFast;
