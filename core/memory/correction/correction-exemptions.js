/**
 * CORRECTION EXEMPTIONS
 * Determines if correction should cause distress
 * ~80 lines (Target: <90)
 */

const Database = require('better-sqlite3');
const logger = require('../../../utils/logger');

class CorrectionExemptions {
  constructor(dbPath) {
    this.db = new Database(dbPath);
  }
  
  /**
   * Check if correction is exempt from causing distress
   */
  isExempt(beliefId, correctionType) {
    const belief = this.db.prepare(`
      SELECT * FROM beliefs WHERE id = ?
    `).get(beliefId);
    
    if (!belief) return false;
    
    const now = Date.now();
    
    // Rule 1: Probation period (0-7 days, <3 reinforcements)
    if (belief.maturity_state === 'probation') {
      logger.debug(`Belief ${beliefId} in probation - EXEMPT`);
      return {
        exempt: true,
        reason: 'probation_period',
        message: 'Got it, thanks for clarifying!'
      };
    }
    
    // Rule 2: Typo corrections always exempt
    if (correctionType === 'typo') {
      logger.debug(`Typo correction - EXEMPT`);
      return {
        exempt: true,
        reason: 'typo_detected',
        message: 'Fixed the typo!'
      };
    }
    
    // Rule 3: User error corrections always exempt
    if (correctionType === 'user_error') {
      logger.debug(`User error - EXEMPT`);
      return {
        exempt: true,
        reason: 'user_error',
        message: 'Understood, ignoring that.'
      };
    }
    
    // Rule 4: Rapid correction (<1 hour after formation)
    if ((now - belief.valid_from) < 3600000) {
      logger.debug(`Rapid correction (<1 hour) - EXEMPT`);
      return {
        exempt: true,
        reason: 'rapid_correction',
        message: 'Quick correction - no problem!'
      };
    }
    
    // Rule 5: First 2 corrections (learning phase)
    if (belief.correction_count < 2) {
      logger.debug(`Learning phase (correction ${belief.correction_count + 1}/2) - EXEMPT`);
      return {
        exempt: true,
        reason: 'learning_phase',
        message: 'Still learning - thanks for the correction!'
      };
    }
    
    // Not exempt - will cause distress based on maturity
    return {
      exempt: false,
      maturityState: belief.maturity_state,
      distressLevel: this._calculateDistress(belief)
    };
  }
  
  /**
   * Calculate distress level (0-1)
   */
  _calculateDistress(belief) {
    const stateDistress = {
      probation: 0,       // Already handled by exemption
      establishing: 0.3,
      established: 0.6,
      core: 0.9,
      locked: 1.0
    };
    
    const baseDistress = stateDistress[belief.maturity_state] || 0.5;
    
    // Increase with conviction
    const convictionBonus = (belief.conviction_score / 100) * 0.2;
    
    return Math.min(1, baseDistress + convictionBonus);
  }
}

module.exports = CorrectionExemptions;
