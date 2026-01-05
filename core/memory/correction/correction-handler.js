/**
 * CORRECTION HANDLER
 * Executes corrections and manages distress
 * ~115 lines (Target: <120)
 */

const Database = require('better-sqlite3');
const logger = require('../../../utils/logger');

class CorrectionHandler {
  constructor(dbPath, exemptionChecker) {
    this.db = new Database(dbPath);
    this.exemptions = exemptionChecker; // CorrectionExemptions instance
  }
  
  /**
   * Execute correction on belief
   */
  correctBelief(beliefId, correction, sessionId = null, turnId = null) {
    const belief = this.db.prepare(`
      SELECT * FROM beliefs WHERE id = ?
    `).get(beliefId);
    
    if (!belief) {
      logger.error(`Belief ${beliefId} not found`);
      return null;
    }
    
    // Check exemptions
    const exemption = this.exemptions.isExempt(beliefId, correction.type);
    
    const now = Date.now();
    
    // Log correction
    const logResult = this.db.prepare(`
      INSERT INTO belief_corrections (
        belief_id,
        correction_date,
        correction_type,
        old_statement,
        new_statement,
        correction_reasoning,
        caused_distress,
        distress_level,
        was_exempt,
        exemption_reason,
        user_explanation,
        session_id,
        turn_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      beliefId,
      now,
      correction.type,
      belief.belief_statement,
      correction.newStatement,
      correction.reasoning || null,
      exemption.exempt ? 0 : 1,
      exemption.distressLevel || 0,
      exemption.exempt ? 1 : 0,
      exemption.reason || null,
      correction.explanation || null,
      sessionId,
      turnId
    );
    
    // Update belief
    if (correction.newStatement) {
      this.db.prepare(`
        UPDATE beliefs
        SET belief_statement = ?,
            correction_count = correction_count + 1,
            last_correction = ?,
            revision_reasoning = ?
        WHERE id = ?
      `).run(
        correction.newStatement,
        now,
        correction.reasoning || 'User correction',
        beliefId
      );
    } else if (correction.shouldDelete) {
      // Mark as superseded/inactive
      this.db.prepare(`
        UPDATE beliefs
        SET valid_to = ?,
            correction_count = correction_count + 1,
            last_correction = ?
        WHERE id = ?
      `).run(now, now, beliefId);
    }
    
    logger.info(
      `Correction applied to belief ${beliefId} [${correction.type}] ` +
      `Exempt: ${exemption.exempt}, Distress: ${(exemption.distressLevel || 0).toFixed(2)}`
    );
    
    return {
      correctionId: logResult.lastInsertRowid,
      beliefId,
      exempt: exemption.exempt,
      distressLevel: exemption.distressLevel || 0,
      message: exemption.message || this._generateDistressMessage(exemption.distressLevel),
      oldStatement: belief.belief_statement,
      newStatement: correction.newStatement
    };
  }
  
  /**
   * Generate distress message
   */
  _generateDistressMessage(distressLevel) {
    if (distressLevel < 0.3) {
      return "Okay, I'll update that.";
    } else if (distressLevel < 0.6) {
      return "Hmm, okay... updating my understanding.";
    } else if (distressLevel < 0.9) {
      return "Wait, really? That's important to me... but okay, I'll adjust.";
    } else {
      return "This is really significant to me... I need time to process this change.";
    }
  }
  
  /**
   * Get correction history for belief
   */
  getHistory(beliefId, limit = 10) {
    return this.db.prepare(`
      SELECT * FROM belief_corrections
      WHERE belief_id = ?
      ORDER BY correction_date DESC
      LIMIT ?
    `).all(beliefId, limit);
  }
  
  /**
   * Get recent corrections (for analysis)
   */
  getRecentCorrections(limit = 20) {
    return this.db.prepare(`
      SELECT 
        bc.*,
        b.belief_statement,
        b.maturity_state
      FROM belief_corrections bc
      JOIN beliefs b ON bc.belief_id = b.id
      ORDER BY bc.correction_date DESC
      LIMIT ?
    `).all(limit);
  }
}

module.exports = CorrectionHandler;
