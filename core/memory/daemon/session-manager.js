/**
 * SESSION MANAGER INTEGRATOR
 * Adds SessionTracker to NiaDaemon
 * ~60 lines (Target: <70)
 * 
 * FIXED: Correct require path for temporal module
 */

// FIXED: Was '../memory/temporal', should be '../temporal'
const { SessionTracker, UptimeMonitor } = require('../temporal');
const logger = require('../../../utils/logger');

class SessionManagerIntegrator {
  constructor(daemon) {
    this.daemon = daemon;
    this.sessionTracker = null;
    this.uptimeMonitor = null;
    this.currentSessionId = null;
  }
  
  /**
   * Initialize session tracking
   */
  init() {
    try {
      this.sessionTracker = new SessionTracker(this.daemon.identityDbPath);
      this.uptimeMonitor = new UptimeMonitor(this.sessionTracker);
      
      logger.info('Session manager integrator initialized');
      return true;
      
    } catch (err) {
      logger.error(`Failed to initialize session manager: ${err.message}`);
      return false;
    }
  }
  
  /**
   * Start session (call from daemon.start())
   */
  startSession() {
    if (!this.sessionTracker) return null;
    
    const session = this.sessionTracker.startSession();
    this.currentSessionId = session.sessionId;
    
    logger.info(`Session ${this.currentSessionId} started`);
    
    return session;
  }
  
  /**
   * End session (call from daemon.stop())
   */
  endSession() {
    if (!this.sessionTracker) return null;
    
    const result = this.sessionTracker.endSession();
    
    logger.info(`Session ${this.currentSessionId} ended`);
    this.currentSessionId = null;
    
    return result;
  }
  
  /**
   * Get current session info
   */
  getCurrentSession() {
    if (!this.sessionTracker) return null;
    return this.sessionTracker.getCurrentSession();
  }
  
  /**
   * Get uptime string
   */
  getUptimeString() {
    if (!this.uptimeMonitor) return 'offline';
    return this.uptimeMonitor.getUptimeString();
  }
}

module.exports = SessionManagerIntegrator;
