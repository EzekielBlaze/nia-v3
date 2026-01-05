/**
 * SESSION TRACKER
 * Tracks daemon online/offline lifecycle
 * ~95 lines (Target: <100)
 */

const Database = require('better-sqlite3');
const logger = require('../../../utils/logger');

class SessionTracker {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.currentSessionId = null;
    this.sessionStart = null;
  }
  
  /**
   * Mark daemon as online (start new session)
   */
  startSession() {
    this.sessionStart = Date.now();
    
    const result = this.db.prepare(`
      INSERT INTO daemon_sessions (started_at, status)
      VALUES (?, 'online')
    `).run(this.sessionStart);
    
    this.currentSessionId = result.lastInsertRowid;
    
    logger.info(`Daemon session started: ${this.currentSessionId}`);
    
    return {
      sessionId: this.currentSessionId,
      startedAt: this.sessionStart
    };
  }
  
  /**
   * Mark daemon as offline (end session)
   */
  endSession() {
    if (!this.currentSessionId) {
      logger.warn('No active session to end');
      return null;
    }
    
    const uptime = Date.now() - this.sessionStart;
    
    this.db.prepare(`
      UPDATE daemon_sessions
      SET ended_at = ?, uptime_ms = ?, status = 'offline'
      WHERE id = ?
    `).run(Date.now(), uptime, this.currentSessionId);
    
    logger.info(`Session ${this.currentSessionId} ended. Uptime: ${this._formatMs(uptime)}`);
    
    const sessionId = this.currentSessionId;
    this.currentSessionId = null;
    this.sessionStart = null;
    
    return { sessionId, uptime };
  }
  
  /**
   * Mark daemon as crashed
   */
  markCrashed(reason) {
    if (!this.currentSessionId) return null;
    
    const uptime = Date.now() - this.sessionStart;
    
    this.db.prepare(`
      UPDATE daemon_sessions
      SET ended_at = ?, uptime_ms = ?, status = 'crashed', crash_reason = ?
      WHERE id = ?
    `).run(Date.now(), uptime, reason, this.currentSessionId);
    
    logger.error(`Session ${this.currentSessionId} crashed: ${reason}`);
    
    this.currentSessionId = null;
    this.sessionStart = null;
  }
  
  /**
   * Get current session info
   */
  getCurrentSession() {
    if (!this.currentSessionId) return null;
    
    return {
      sessionId: this.currentSessionId,
      startedAt: this.sessionStart,
      uptime: Date.now() - this.sessionStart
    };
  }
  
  /**
   * Format milliseconds to readable string
   */
  _formatMs(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }
}

module.exports = SessionTracker;
