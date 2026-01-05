/**
 * BELIEF MATURATION
 * Updates belief maturity states based on age and reinforcement
 * ~85 lines (Target: <90)
 */

const Database = require('better-sqlite3');
const logger = require('../../../utils/logger');

class BeliefMaturation {
  constructor(dbPath) {
    this.db = new Database(dbPath);
  }
  
  /**
   * Update maturity states for all beliefs
   */
  updateAllStates() {
    const now = Date.now();
    
    // Trigger will auto-update on reinforcement_count change
    // This forces a manual update for all beliefs
    const result = this.db.prepare(`
      UPDATE beliefs
      SET reinforcement_count = reinforcement_count
      WHERE id IN (
        SELECT id FROM beliefs
        WHERE maturity_state != 'locked'
          AND maturity_state != 'core'
      )
    `).run();
    
    logger.debug(`Updated maturity states for ${result.changes} beliefs`);
    
    return result.changes;
  }
  
  /**
   * Get maturity statistics
   */
  getStats() {
    const stats = this.db.prepare(`
      SELECT 
        maturity_state,
        COUNT(*) as count,
        AVG(conviction_score) as avg_conviction,
        AVG(reinforcement_count) as avg_reinforcements
      FROM beliefs
      GROUP BY maturity_state
      ORDER BY 
        CASE maturity_state
          WHEN 'locked' THEN 1
          WHEN 'core' THEN 2
          WHEN 'established' THEN 3
          WHEN 'establishing' THEN 4
          WHEN 'probation' THEN 5
        END
    `).all();
    
    return stats;
  }
  
  /**
   * Get beliefs eligible for promotion
   */
  getPromotionCandidates() {
    const now = Date.now();
    
    // Probation → Establishing (7+ days, 3+ reinforcements)
    const probationToEstablishing = this.db.prepare(`
      SELECT * FROM beliefs
      WHERE maturity_state = 'probation'
        AND (? - valid_from) >= 604800000
        AND reinforcement_count >= 3
    `).all(now);
    
    // Establishing → Established (30+ days, 10+ reinforcements)
    const establishingToEstablished = this.db.prepare(`
      SELECT * FROM beliefs
      WHERE maturity_state = 'establishing'
        AND (? - valid_from) >= 2592000000
        AND reinforcement_count >= 10
    `).all(now);
    
    return {
      probationToEstablishing,
      establishingToEstablished,
      total: probationToEstablishing.length + establishingToEstablished.length
    };
  }
  
  /**
   * Check if belief is in probation (guilt-free correction period)
   */
  isInProbation(beliefId) {
    const belief = this.db.prepare(`
      SELECT maturity_state, probation_until
      FROM beliefs
      WHERE id = ?
    `).get(beliefId);
    
    if (!belief) return false;
    
    return belief.maturity_state === 'probation' && 
           (!belief.probation_until || Date.now() < belief.probation_until);
  }
}

module.exports = BeliefMaturation;
