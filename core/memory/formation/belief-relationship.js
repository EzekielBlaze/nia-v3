/**
 * BELIEF RELATIONSHIP
 * Links beliefs together hierarchically
 * ~95 lines (Target: <100)
 */

const Database = require('better-sqlite3');
const logger = require('../../../utils/logger');

class BeliefRelationship {
  constructor(dbPath, beliefEmbedder = null) {
    this.db = new Database(dbPath);
    this.embedder = beliefEmbedder;
  }
  
  /**
   * Create relationship between beliefs
   */
  async createRelationship(beliefAId, beliefBId, type, strength = 0.5) {
    const now = Date.now();
    
    // Calculate Poincaré distance if embedder available
    let distance = null;
    if (this.embedder) {
      distance = await this.embedder.calculateDistance(beliefAId, beliefBId);
    }
    
    try {
      this.db.prepare(`
        INSERT INTO belief_relationships (
          belief_a_id,
          belief_b_id,
          relationship_type,
          strength,
          discovered_at,
          poincare_distance
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(beliefAId, beliefBId, type, strength, now, distance);
      
      logger.debug(`Relationship created: ${beliefAId} --[${type}]--> ${beliefBId}`);
      
      return { beliefAId, beliefBId, type, strength, distance };
      
    } catch (err) {
      // Might be duplicate - that's okay
      if (!err.message.includes('UNIQUE constraint')) {
        logger.error(`Failed to create relationship: ${err.message}`);
      }
      return null;
    }
  }
  
  /**
   * Find related beliefs
   */
  findRelated(beliefId, relationshipType = null, limit = 10) {
    let sql = `
      SELECT 
        br.*,
        b.belief_statement,
        b.belief_type,
        b.conviction_score
      FROM belief_relationships br
      JOIN beliefs b ON (
        b.id = CASE 
          WHEN br.belief_a_id = ? THEN br.belief_b_id
          ELSE br.belief_a_id
        END
      )
      WHERE (br.belief_a_id = ? OR br.belief_b_id = ?)
    `;
    
    const params = [beliefId, beliefId, beliefId];
    
    if (relationshipType) {
      sql += ` AND br.relationship_type = ?`;
      params.push(relationshipType);
    }
    
    sql += ` ORDER BY br.strength DESC LIMIT ?`;
    params.push(limit);
    
    return this.db.prepare(sql).all(...params);
  }
  
  /**
   * Detect implicit relationships between beliefs
   */
  detectImplicitRelationships(beliefId) {
    const belief = this.db.prepare(`
      SELECT * FROM beliefs WHERE id = ?
    `).get(beliefId);
    
    if (!belief) return [];
    
    const relationships = [];
    
    // Find beliefs with shared evidence
    const sharedEvidence = this.db.prepare(`
      SELECT DISTINCT b.id, b.belief_statement, COUNT(*) as shared_count
      FROM memory_belief_evidence mbe1
      JOIN memory_belief_evidence mbe2 ON mbe1.memory_id = mbe2.memory_id
      JOIN beliefs b ON mbe2.belief_id = b.id
      WHERE mbe1.belief_id = ?
        AND mbe2.belief_id != ?
      GROUP BY b.id
      HAVING shared_count >= 2
    `).all(beliefId, beliefId);
    
    for (const related of sharedEvidence) {
      relationships.push({
        relatedBeliefId: related.id,
        type: 'supports',
        strength: Math.min(1, related.shared_count / 5)
      });
    }
    
    return relationships;
  }
}

module.exports = BeliefRelationship;
