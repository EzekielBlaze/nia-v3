/**
 * API - CORRECTIONS
 * Handle corrections and view correction history
 * ~70 lines (Target: <80)
 */

const logger = require('../utils/logger');

class CorrectionsAPI {
  constructor(daemon) {
    this.daemon = daemon;
  }
  
  /**
   * Register IPC handlers
   */
  register(ipcServer) {
    ipcServer.registerHandler('correction_stats', async () => {
      return this.getCorrectionStats();
    });
    
    ipcServer.registerHandler('check_exemption', async (data) => {
      return this.checkExemption(data);
    });
  }
  
  /**
   * Get correction statistics
   */
  getCorrectionStats() {
    try {
      const stats = this.daemon.correctionIntegrator.getStats();
      
      return {
        success: true,
        stats
      };
      
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }
  
  /**
   * Check if correction would be exempt (for UI preview)
   */
  checkExemption(data) {
    try {
      const { beliefId, correctionType } = data;
      
      if (!beliefId || !correctionType) {
        return {
          success: false,
          error: 'Missing beliefId or correctionType'
        };
      }
      
      const exemption = this.daemon.correctionIntegrator.correctionExemptions.isExempt(
        beliefId,
        correctionType
      );
      
      return {
        success: true,
        exemption: {
          exempt: exemption.exempt,
          reason: exemption.reason || null,
          distressLevel: exemption.distressLevel || 0,
          message: exemption.message || null
        }
      };
      
    } catch (err) {
      logger.error(`Check exemption error: ${err.message}`);
      return {
        success: false,
        error: err.message
      };
    }
  }
}

module.exports = CorrectionsAPI;
