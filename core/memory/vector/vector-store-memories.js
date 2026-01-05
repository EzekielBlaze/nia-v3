/**
 * VECTOR STORE - MEMORIES (Euclidean Space)
 * Stores memory embeddings in Qdrant
 * ~95 lines (Target: <100)
 */

const logger = require('../../../utils/logger');

class VectorStoreMemories {
  constructor(vectorClient) {
    this.client = vectorClient;
    this.collectionName = 'memories';
    this.vectorSize = 384; // sentence-transformers/all-MiniLM-L6-v2
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
      'Cosine' // Euclidean space uses cosine similarity
    );
    
    this.initialized = success;
    return success;
  }
  
  /**
   * Store memory embedding
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
                memory_id: metadata.memoryId,
                topics: metadata.topics || [],
                subjects: metadata.subjects || [],
                committed_at: metadata.committedAt || Date.now()
              }
            }]
          }),
          signal: AbortSignal.timeout(this.client.timeout)
        }
      );
      
      if (!response.ok) {
        throw new Error(`Qdrant returned ${response.status}`);
      }
      
      logger.debug(`Stored memory vector: ${vectorId}`);
      return true;
      
    } catch (err) {
      logger.error(`Failed to store memory vector: ${err.message}`);
      return false;
    }
  }
  
  /**
   * Search for similar memories
   */
  async search(queryVector, options = {}) {
    await this.init();
    
    const {
      limit = 10,
      filter = null,
      scoreThreshold = 0.5
    } = options;
    
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
            ...(filter && { filter })
          }),
          signal: AbortSignal.timeout(this.client.timeout)
        }
      );
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      return data.result.map(r => ({
        memoryId: r.payload.memory_id,
        score: r.score,
        topics: r.payload.topics,
        subjects: r.payload.subjects
      }));
      
    } catch (err) {
      logger.error(`Memory vector search failed: ${err.message}`);
      return [];
    }
  }
}

module.exports = VectorStoreMemories;
