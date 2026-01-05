/**
 * CLARIFICATION ASKER
 * Generates clarification questions when uncertain
 * ~75 lines (Target: <80)
 */

const Database = require('better-sqlite3');
const logger = require('../../../utils/logger');

class ClarificationAsker {
  constructor(dbPath) {
    this.db = new Database(dbPath);
  }
  
  /**
   * Generate clarification question based on uncertainty
   */
  ask(uncertainty, turnId = null) {
    const question = this._generateQuestion(uncertainty);
    
    if (!question) return null;
    
    // Log the request
    const now = Date.now();
    const result = this.db.prepare(`
      INSERT INTO clarification_requests (
        requested_at,
        turn_id,
        trigger_type,
        uncertainty_score,
        question_asked
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      now,
      turnId,
      uncertainty.primaryType,
      uncertainty.score,
      question
    );
    
    logger.debug(`Clarification requested: ${question}`);
    
    return {
      requestId: result.lastInsertRowid,
      question,
      uncertaintyType: uncertainty.primaryType,
      score: uncertainty.score
    };
  }
  
  /**
   * Generate question based on uncertainty type
   */
  _generateQuestion(uncertainty) {
    switch (uncertainty.primaryType) {
      case 'ambiguous_reference':
        return this._askAboutReference(uncertainty);
      
      case 'potential_typo':
        return this._askAboutTypo(uncertainty);
      
      case 'contradiction':
        return this._askAboutContradiction(uncertainty);
      
      default:
        return "Could you clarify what you mean?";
    }
  }
  
  /**
   * Ask about ambiguous reference
   */
  _askAboutReference(uncertainty) {
    const examples = uncertainty.details.examples || [];
    if (examples.length > 0) {
      return `When you say "${examples[0]}", what specifically are you referring to?`;
    }
    return "I'm not sure what you're referring to - could you be more specific?";
  }
  
  /**
   * Ask about potential typo
   */
  _askAboutTypo(uncertainty) {
    const examples = uncertainty.details.examples || [];
    if (examples.length > 0) {
      return `Did you mean to write "${examples[0]}"? Just checking I understood correctly.`;
    }
    return "I want to make sure I understood correctly - could you rephrase that?";
  }
  
  /**
   * Ask about contradiction
   */
  _askAboutContradiction(uncertainty) {
    const conflicts = uncertainty.details.conflictingBeliefs || [];
    if (conflicts.length > 0) {
      const belief = conflicts[0];
      return `I thought ${belief.belief_statement} - did you change your mind, or did I misunderstand?`;
    }
    return "This seems different from what you said before - did I misunderstand?";
  }
  
  /**
   * Record user response to clarification
   */
  recordResponse(requestId, userResponse) {
    const now = Date.now();
    
    this.db.prepare(`
      UPDATE clarification_requests
      SET user_responded = 1,
          user_response = ?,
          response_timestamp = ?
      WHERE id = ?
    `).run(userResponse, now, requestId);
  }
}

module.exports = ClarificationAsker;
