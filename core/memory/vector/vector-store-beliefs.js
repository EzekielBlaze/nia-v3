/**
 * VECTOR STORE - BELIEFS (Poincaré/Hyperbolic Space)
 * Stores belief embeddings in Qdrant
 * ~100 lines (Target: <110)
 */

const logger = require('../../../utils/logger');

class VectorStoreBeliefs {
  constructor(vectorClient) {
    this.client = vectorClient;
    this.collectionName = 'beliefs';
    this.vectorSize = 100; // Poincaré embedding dimension
    this.initialized = false;
  }
  
  /**
   * Initialize collection
   */
  async init() {
    if (this.initialized) return true;
    
    const success = await this.client.ensureCollection(
      this.collectionName,
      this.vectorSize,
      'Cosine' // Will use Poincaré distance in queries
    );
    
    this.initialized = success;
    return success;
  }
  
  /**
   * Store belief embedding
   */
  async store(vectorId, embedding, metadata = {}) {
    await this.init();
    
    try {
      const response = await fetch(
        `${this.client.baseUrl}/collections/${this.collectionName}/points`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: [{
              id: vectorId,
              vector: embedding,
              payload: {
                belief_id: metadata.beliefId,
                belief_type: metadata.beliefType,
                maturity_state: metadata.maturityState || 'probation',
                conviction_score: metadata.convictionScore || 50,
                poincare_norm: metadata.poincareNorm || 0,
                hierarchy_level: metadata.hierarchyLevel || 0
              }
            }]
          }),
          signal: AbortSignal.timeout(this.client.timeout)
        }
      );
      
      if (!response.ok) {
        throw new Error(`Qdrant returned ${response.status}`);
      }
      
      logger.debug(`Stored belief vector: ${vectorId}`);
      return true;
      
    } catch (err) {
      logger.error(`Failed to store belief vector: ${err.message}`);
      return false;
    }
  }
  
  /**
   * Search for similar beliefs (hierarchical)
   */
  async search(queryVector, options = {}) {
    await this.init();
    
    const {
      limit = 10,
      filter = null,
      scoreThreshold = 0.3,
      maturityFilter = null
    } = options;
    
    // Build filter for maturity states
    let finalFilter = filter;
    if (maturityFilter) {
      finalFilter = {
        must: [
          ...(filter?.must || []),
          {
            key: 'maturity_state',
            match: { value: maturityFilter }
          }
        ]
      };
    }
    
    try {
      const response = await fetch(
        `${this.client.baseUrl}/collections/${this.collectionName}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: queryVector,
            limit,
            score_threshold: scoreThreshold,
            with_payload: true,
            ...(finalFilter && { filter: finalFilter })
          }),
          signal: AbortSignal.timeout(this.client.timeout)
        }
      );
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      return data.result.map(r => ({
        beliefId: r.payload.belief_id,
        score: r.score,
        beliefType: r.payload.belief_type,
        maturityState: r.payload.maturity_state,
        hierarchyLevel: r.payload.hierarchy_level,
        poincareNorm: r.payload.poincare_norm
      }));
      
    } catch (err) {
      logger.error(`Belief vector search failed: ${err.message}`);
      return [];
    }
  }
}

module.exports = VectorStoreBeliefs;
