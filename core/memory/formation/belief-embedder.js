/**
 * BELIEF EMBEDDER
 * HTTP client for Poincaré embedding service
 * ~75 lines (Target: <80)
 */

const logger = require('../../../utils/logger');
const { v4: uuidv4 } = require('uuid');

class BeliefEmbedder {
  constructor(serviceUrl = 'http://localhost:5002') {
    this.serviceUrl = serviceUrl;
  }
  
  /**
   * Create Poincaré embedding for belief
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
      
      return vectorId;
      
    } catch (err) {
      logger.error(`Failed to create belief embedding: ${err.message}`);
      throw err;
    }
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
}

module.exports = BeliefEmbedder;
