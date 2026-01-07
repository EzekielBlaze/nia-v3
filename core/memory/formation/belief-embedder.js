/**
 * BELIEF EMBEDDER
 * HTTP client for Poincaré embedding service
 * Returns full embedding data including poincare_norm for 3D visualization
 */

const logger = require('../../../utils/logger');
const { v4: uuidv4 } = require('uuid');

class BeliefEmbedder {
  constructor(serviceUrl = 'http://localhost:5002') {
    this.serviceUrl = serviceUrl;
  }
  
  /**
   * Create Poincaré embedding for belief
   * Returns: { vectorId, embedding, poincare_norm, hierarchy_level }
   */
  async embed(beliefId, statement, type) {
    const vectorId = `belief_${beliefId}_${uuidv4()}`;
    
    try {
      const response = await fetch(`${this.serviceUrl}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: vectorId,
          text: statement,
          type,
          belief_id: beliefId
        }),
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`Embedding service returned ${response.status}`);
      }
      
      const data = await response.json();
      
      // Return FULL data including Poincaré metrics
      return {
        vectorId,
        embedding: data.embedding,
        poincare_norm: data.poincare_norm,
        hierarchy_level: data.hierarchy_level,
        dimensions: data.dimensions
      };
      
    } catch (err) {
      logger.error(`Failed to create belief embedding: ${err.message}`);
      throw err;
    }
  }
  
  /**
   * Store embedding in Qdrant
   * Call this after embed() if you want to persist to vector DB
   */
  async storeInQdrant(vectorId, embedding, metadata = {}) {
    try {
      const response = await fetch('http://localhost:6333/collections/beliefs/points', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [{
            id: this._hashToInt(vectorId),
            vector: embedding,
            payload: {
              vector_id: vectorId,
              ...metadata
            }
          }]
        }),
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`Qdrant returned ${response.status}`);
      }
      
      return true;
    } catch (err) {
      logger.error(`Failed to store in Qdrant: ${err.message}`);
      return false;
    }
  }
  
  /**
   * Convenience method: embed and store in one call
   */
  async embedAndStore(beliefId, statement, type, metadata = {}) {
    const result = await this.embed(beliefId, statement, type);
    
    await this.storeInQdrant(result.vectorId, result.embedding, {
      belief_id: beliefId,
      statement: statement.substring(0, 500),
      type,
      poincare_norm: result.poincare_norm,
      hierarchy_level: result.hierarchy_level,
      ...metadata
    });
    
    return result;
  }
  
  /**
   * Calculate Poincaré distance between beliefs
   */
  async calculateDistance(beliefId1, beliefId2) {
    try {
      const response = await fetch(`${this.serviceUrl}/distance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          belief_id_1: beliefId1,
          belief_id_2: beliefId2
        }),
        signal: AbortSignal.timeout(3000)
      });
      
      if (!response.ok) {
        throw new Error(`Distance calculation failed: ${response.status}`);
      }
      
      const data = await response.json();
      return data.distance;
      
    } catch (err) {
      logger.error(`Failed to calculate distance: ${err.message}`);
      return null;
    }
  }
  
  /**
   * Check if service is available
   */
  async checkHealth() {
    try {
      const response = await fetch(`${this.serviceUrl}/health`, {
        signal: AbortSignal.timeout(2000)
      });
      return response.ok;
    } catch {
      return false;
    }
  }
  
  /**
   * Hash string to integer for Qdrant point ID
   */
  _hashToInt(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

module.exports = BeliefEmbedder;
