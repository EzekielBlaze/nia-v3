/**
 * BELIEF FORMER
 * Creates beliefs from detected patterns
 * ~110 lines (Target: <120)
 */

const Database = require('better-sqlite3');
const logger = require('../../../utils/logger');

class BeliefFormer {
  constructor(dbPath, beliefEmbedder = null) {
    this.db = new Database(dbPath);
    this.embedder = beliefEmbedder; // BeliefEmbedder instance
  }
  
  /**
   * Form a belief from a candidate
   */
  async formBelief(candidate) {
    const {
      statement,
      type,
      confidence,
      supportingMemories,
      timeSpan,
      topics,
      rule
    } = candidate;
    
    const now = Date.now();
    
    // Create belief in probation state
    const result = this.db.prepare(`
      INSERT INTO beliefs (
        belief_statement,
        belief_type,
        conviction_score,
        formation_reasoning,
        valid_from,
        maturity_state,
        reinforcement_count
      ) VALUES (?, ?, ?, ?, ?, 'probation', 1)
    `).run(
      statement,
      type,
      confidence * 100,
      `Formed from ${supportingMemories.length} memories over ${timeSpan.toFixed(0)} days via ${rule}`,
      now
    );
    
    const beliefId = result.lastInsertRowid;
    
    // Link supporting memories
    for (const memoryId of supportingMemories) {
      this.db.prepare(`
        INSERT INTO memory_belief_evidence (
          memory_id,
          belief_id,
          evidence_type,
          weight,
          discovered_at,
          contributed_to_formation
        ) VALUES (?, ?, 'formed_from', 1.0, ?, 1)
      `).run(memoryId, beliefId, now);
    }
    
    // Create embedding if embedder available
    if (this.embedder) {
      try {
        const vectorId = await this.embedder.embed(beliefId, statement, type);
        
        this.db.prepare(`
          UPDATE beliefs
          SET vector_id = ?
          WHERE id = ?
        `).run(vectorId, beliefId);
        
      } catch (err) {
        logger.warn(`Failed to create belief embedding: ${err.message}`);
      }
    }
    
    logger.info(`Belief formed: ${beliefId} [${type}] "${statement}"`);
    
    return {
      id: beliefId,
      statement,
      type,
      convictionScore: confidence * 100,
      maturityState: 'probation',
      supportingMemoryCount: supportingMemories.length
    };
  }
  
  /**
   * Reinforce existing belief
   */
  reinforceBelief(beliefId, memoryId = null) {
    const now = Date.now();
    
    this.db.prepare(`
      UPDATE beliefs
      SET reinforcement_count = reinforcement_count + 1,
          last_reinforced = ?,
          conviction_score = MIN(100, conviction_score + 5)
      WHERE id = ?
    `).run(now, beliefId);
    
    // Link memory if provided
    if (memoryId) {
      this.db.prepare(`
        INSERT OR IGNORE INTO memory_belief_evidence (
          memory_id,
          belief_id,
          evidence_type,
          weight,
          discovered_at
        ) VALUES (?, ?, 'reinforces', 0.5, ?)
      `).run(memoryId, beliefId, now);
    }
    
    logger.debug(`Belief ${beliefId} reinforced`);
  }
  
  /**
   * Get belief by ID
   */
  getBelief(beliefId) {
    return this.db.prepare(`
      SELECT * FROM beliefs
      WHERE id = ?
    `).get(beliefId);
  }
}

module.exports = BeliefFormer;
