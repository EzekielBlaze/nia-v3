/**
 * CORRECTION INTEGRATOR
 * Adds correction handling to NiaDaemon
 * ~110 lines (Target: <120)
 */

const {
  CorrectionDetector,
  CorrectionExemptions,
  CorrectionHandler,
  UncertaintyDetector,
  ClarificationAsker
} = require('../correction');

const logger = require('../../../utils/logger');

class CorrectionIntegrator {
  constructor(daemon) {
    this.daemon = daemon;
    this.correctionDetector = new CorrectionDetector();
    this.correctionExemptions = null;
    this.correctionHandler = null;
    this.uncertaintyDetector = new UncertaintyDetector();
    this.clarificationAsker = null;
  }
  
  /**
   * Initialize correction system
   */
  init() {
    try {
      this.correctionExemptions = new CorrectionExemptions(this.daemon.identityDbPath);
      this.correctionHandler = new CorrectionHandler(
        this.daemon.identityDbPath,
        this.correctionExemptions
      );
      this.clarificationAsker = new ClarificationAsker(this.daemon.identityDbPath);
      
      logger.info('Correction integrator initialized');
      return true;
      
    } catch (err) {
      logger.error(`Failed to initialize correction integrator: ${err.message}`);
      return false;
    }
  }
  
  /**
   * Handle correction in chat
   */
  async handleCorrection(correctionData, sessionId = null, turnId = null) {
    if (!this.correctionHandler) {
      logger.warn('Correction handler not initialized');
      return null;
    }
    
    try {
      const { type, parsed } = correctionData;
      
      // Find belief to correct (simplified - in practice, search by content)
      const beliefId = await this._findBeliefToCorrect(parsed);
      
      if (!beliefId) {
        logger.debug('No matching belief found for correction');
        return {
          corrected: false,
          reason: 'no_matching_belief',
          message: "I don't recall saying that - what specifically should I correct?"
        };
      }
      
      // Apply correction
      const result = this.correctionHandler.correctBelief(
        beliefId,
        {
          type,
          newStatement: parsed.newValue,
          reasoning: 'User correction'
        },
        sessionId,
        turnId
      );
      
      logger.info(`Correction applied to belief ${beliefId}: distress=${result.distressLevel}`);
      
      return {
        corrected: true,
        ...result
      };
      
    } catch (err) {
      logger.error(`Failed to handle correction: ${err.message}`);
      return {
        corrected: false,
        error: err.message
      };
    }
  }
  
  /**
   * Check if message needs clarification
   */
  checkUncertainty(message, recentBeliefs = []) {
    if (!this.uncertaintyDetector) return null;
    
    return this.uncertaintyDetector.detect(message, { recentBeliefs });
  }
  
  /**
   * Ask for clarification
   */
  askClarification(uncertainty, turnId = null) {
    if (!this.clarificationAsker) return null;
    
    return this.clarificationAsker.ask(uncertainty, turnId);
  }
  
  /**
   * Find belief to correct (helper)
   * In production, this would do semantic search
   */
  async _findBeliefToCorrect(parsed) {
    if (!this.daemon.identity) return null;
    
    try {
      // Get recent beliefs
      const recentBeliefs = this.daemon.identity.getActiveBeliefs(20);
      
      // Simple matching: find belief containing old value
      if (parsed.oldValue) {
        const match = recentBeliefs.find(b =>
          b.belief_statement.toLowerCase().includes(parsed.oldValue.toLowerCase())
        );
        
        return match ? match.id : null;
      }
      
      // If no old value, return most recent belief
      return recentBeliefs.length > 0 ? recentBeliefs[0].id : null;
      
    } catch (err) {
      logger.error(`Failed to find belief: ${err.message}`);
      return null;
    }
  }
  
  /**
   * Get correction statistics
   */
  getStats() {
    if (!this.correctionHandler) {
      return { total: 0, error: 'Not initialized' };
    }
    
    const recentCorrections = this.correctionHandler.getRecentCorrections(10);
    
    return {
      total: recentCorrections.length,
      recent: recentCorrections
    };
  }
}

module.exports = CorrectionIntegrator;
