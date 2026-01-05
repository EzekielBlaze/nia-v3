/**
 * UPTIME MONITOR
 * Tracks and reports daemon uptime
 * ~55 lines (Target: <60)
 */

const TimeFormatter = require('./time-formatter');

class UptimeMonitor {
  constructor(sessionTracker) {
    this.sessionTracker = sessionTracker;
  }
  
  /**
   * Get current uptime in milliseconds
   */
  getUptime() {
    const session = this.sessionTracker.getCurrentSession();
    if (!session) return 0;
    return session.uptime;
  }
  
  /**
   * Get uptime as readable string
   */
  getUptimeString() {
    const uptime = this.getUptime();
    if (uptime === 0) return 'offline';
    return TimeFormatter.formatDuration(uptime);
  }
  
  /**
   * Check if daemon has been online for duration
   */
  hasBeenOnlineFor(durationMs) {
    return this.getUptime() >= durationMs;
  }
  
  /**
   * Get uptime stats
   */
  getStats() {
    const session = this.sessionTracker.getCurrentSession();
    
    if (!session) {
      return {
        online: false,
        uptime: 0,
        uptimeString: 'offline'
      };
    }
    
    return {
      online: true,
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      uptime: session.uptime,
      uptimeString: this.getUptimeString()
    };
  }
}

module.exports = UptimeMonitor;
