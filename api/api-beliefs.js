/**
 * API - BELIEFS
 * Query belief formation system
 * ~80 lines (Target: <90)
 */

const logger = require('../utils/logger');

class BeliefsAPI {
  constructor(daemon) {
    this.daemon = daemon;
  }
  
  /**
   * Register IPC handlers
   */
  register(ipcServer) {
    ipcServer.registerHandler('belief_stats', async () => {
      return this.getBeliefStats();
    });
    
    ipcServer.registerHandler('form_beliefs', async () => {
      return await this.formBeliefs();
    });
    
    ipcServer.registerHandler('maturity_distribution', async () => {
      return this.getMaturityDistribution();
    });
  }
  
  /**
   * Get belief formation statistics
   */
  getBeliefStats() {
    try {
      const stats = this.daemon.beliefIntegrator.getStats();
      
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
   * Manually trigger belief formation
   */
  async formBeliefs() {
    try {
      const result = await this.daemon.beliefIntegrator.formBeliefsFromMemories();
      
      logger.info(`Belief formation triggered via API: ${result.formed} formed`);
      
      return {
        success: true,
        result: {
          formed: result.formed,
          relationships: result.relationships
        }
      };
      
    } catch (err) {
      logger.error(`Form beliefs error: ${err.message}`);
      return {
        success: false,
        error: err.message
      };
    }
  }
  
  /**
   * Get maturity state distribution
   */
  getMaturityDistribution() {
    try {
      const stats = this.daemon.beliefIntegrator.getStats();
      
      return {
        success: true,
        distribution: stats.maturity || []
      };
      
    } catch (err) {
      return {
        success: false,
        error: err.message
      };
    }
  }
}

module.exports = BeliefsAPI;
