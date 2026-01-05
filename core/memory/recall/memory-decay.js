/**
 * MEMORY DECAY
 * Handles memory strength decay and reinforcement
 * ~95 lines (Target: <100)
 */

const Database = require('better-sqlite3');
const logger = require('../../../utils/logger');

class MemoryDecay {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.decayInterval = null;
  }
  
  /**
   * Start automatic decay scheduler (runs every hour)
   */
  start() {
    if (this.decayInterval) {
      logger.warn('Decay scheduler already running');
      return;
    }
    
    this.decayInterval = setInterval(() => {
      this.applyDecay();
    }, 3600000); // 1 hour
    
    logger.info('Memory decay scheduler started (runs every hour)');
  }
  
  /**
   * Stop decay scheduler
   */
  stop() {
    if (this.decayInterval) {
      clearInterval(this.decayInterval);
      this.decayInterval = null;
      logger.info('Memory decay scheduler stopped');
    }
  }
  
  /**
   * Apply decay to all memories
   */
  applyDecay() {
    const now = Date.now();
    const dayMs = 86400000;
    
    const result = this.db.prepare(`
      UPDATE memory_commits
      SET strength = MAX(0, strength - (
        decay_rate * (? - COALESCE(last_accessed, committed_at)) / ?
      ))
      WHERE is_active = 1
    `).run(now, dayMs);
    
    logger.debug(`Applied decay to ${result.changes} memories`);
    
    return result.changes;
  }
  
  /**
   * Strengthen a memory (called when accessed)
   */
  strengthen(memoryId, delta = 0.01) {
    const result = this.db.prepare(`
      UPDATE memory_commits
      SET strength = MIN(1.0, strength + ?)
      WHERE id = ?
    `).run(delta, memoryId);
    
    return result.changes > 0;
  }
  
  /**
   * Weaken a memory
   */
  weaken(memoryId, delta = 0.05) {
    const result = this.db.prepare(`
      UPDATE memory_commits
      SET strength = MAX(0, strength - ?)
      WHERE id = ?
    `).run(delta, memoryId);
    
    return result.changes > 0;
  }
  
  /**
   * Get decay statistics
   */
  getStats() {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        AVG(strength) as avg_strength,
        MIN(strength) as min_strength,
        MAX(strength) as max_strength,
        COUNT(CASE WHEN strength < 0.3 THEN 1 END) as weak_memories,
        COUNT(CASE WHEN strength >= 0.7 THEN 1 END) as strong_memories
      FROM memory_commits
      WHERE is_active = 1
    `).get();
    
    return stats;
  }
}

module.exports = MemoryDecay;
