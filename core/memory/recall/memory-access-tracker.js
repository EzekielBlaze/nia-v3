/**
 * MEMORY ACCESS TRACKER
 * Logs when memories are accessed and updates counters
 * ~75 lines (Target: <80)
 */

const Database = require('better-sqlite3');
const logger = require('../../../utils/logger');

class MemoryAccessTracker {
  constructor(dbPath, memoryDecay = null) {
    this.db = new Database(dbPath);
    this.decay = memoryDecay; // Optional MemoryDecay instance
  }
  
  /**
   * Track memory access
   */
  track(memoryId, context = 'conversation_recall', turnId = null) {
    const now = Date.now();
    
    // Log the access
    this.db.prepare(`
      INSERT INTO memory_access_log (
        memory_id, accessed_at, access_context, triggered_by_turn_id
      ) VALUES (?, ?, ?, ?)
    `).run(memoryId, now, context, turnId);
    
    // Update memory access count and timestamp
    this.db.prepare(`
      UPDATE memory_commits
      SET access_count = access_count + 1,
          last_accessed = ?
      WHERE id = ?
    `).run(now, memoryId);
    
    // Strengthen memory on access
    if (this.decay) {
      this.decay.strengthen(memoryId, 0.01);
    }
  }
  
  /**
   * Track multiple memory accesses
   */
  trackBatch(memoryIds, context = 'conversation_recall', turnId = null) {
    for (const memoryId of memoryIds) {
      this.track(memoryId, context, turnId);
    }
  }
  
  /**
   * Get access history for a memory
   */
  getHistory(memoryId, limit = 10) {
    return this.db.prepare(`
      SELECT * FROM memory_access_log
      WHERE memory_id = ?
      ORDER BY accessed_at DESC
      LIMIT ?
    `).all(memoryId, limit);
  }
  
  /**
   * Get most accessed memories
   */
  getMostAccessed(limit = 10, timeWindow = null) {
    let sql = `
      SELECT 
        mc.id,
        mc.memory_statement,
        mc.access_count,
        mc.last_accessed,
        mc.strength
      FROM memory_commits mc
      WHERE mc.is_active = 1
    `;
    
    const params = [];
    
    if (timeWindow) {
      sql += ` AND mc.last_accessed >= ?`;
      params.push(Date.now() - timeWindow);
    }
    
    sql += ` ORDER BY mc.access_count DESC LIMIT ?`;
    params.push(limit);
    
    return this.db.prepare(sql).all(...params);
  }
}

module.exports = MemoryAccessTracker;
