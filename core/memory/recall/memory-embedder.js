/**
 * MEMORY EMBEDDER
 * HTTP client for Python memory embedding service
 * FIXED: Added embed() method to store vectors in Qdrant
 * 
 * Location: core/memory/recall/memory-embedder.js
 */

const logger = require('../../../utils/logger');

class MemoryEmbedder {
  constructor(serviceUrl = 'http://localhost:5001', qdrantUrl = 'http://localhost:6333') {
    this.serviceUrl = serviceUrl;
    this.qdrantUrl = qdrantUrl;
    this.cache = new Map();
    this.maxCacheSize = 1000;
  }
  
  /**
   * Get embedding for text (from Python service)
   */
  async getEmbedding(text) {
    const cacheKey = text.substring(0, 100);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    try {
      const response = await fetch(`${this.serviceUrl}/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`Embedding service returned ${response.status}`);
      }
      
      const data = await response.json();
      const embedding = data.embedding;
      
      this._cacheEmbedding(cacheKey, embedding);
      
      return embedding;
      
    } catch (err) {
      logger.error(`Failed to get embedding: ${err.message}`);
      throw err;
    }
  }
  
  /**
   * Embed text and store in Qdrant
   * Called by memory-store.js
   */
  async embed(vectorId, text, metadata = {}) {
    try {
      // Step 1: Get embedding from Python service
      const embedding = await this.getEmbedding(text);
      
      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding returned');
      }
      
      // Step 2: Create numeric point ID for Qdrant
      const pointId = this._vectorIdToPointId(vectorId);
      
      // Step 3: Store in Qdrant
      const qdrantResponse = await fetch(`${this.qdrantUrl}/collections/memories/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: [{
            id: pointId,
            vector: embedding,
            payload: {
              vector_id: vectorId,
              text: text.substring(0, 500),
              topics: metadata.topics || [],
              subjects: metadata.subjects || [],
              created_at: Date.now()
            }
          }]
        }),
        signal: AbortSignal.timeout(5000)
      });
      
      if (!qdrantResponse.ok) {
        const errorText = await qdrantResponse.text();
        throw new Error(`Qdrant error: ${qdrantResponse.status} - ${errorText}`);
      }
      
      const result = await qdrantResponse.json();
      
      if (result.status !== 'ok' && !result.result) {
        throw new Error(`Qdrant returned: ${JSON.stringify(result)}`);
      }
      
      logger.info(`Memory embedded: ${vectorId} -> Qdrant point ${pointId}`);
      
      return {
        success: true,
        vectorId,
        pointId,
        dimensions: embedding.length
      };
      
    } catch (err) {
      logger.error(`Failed to embed memory: ${err.message}`);
      throw err;
    }
  }
  
  /**
   * Convert string vectorId to numeric point ID for Qdrant
   */
  _vectorIdToPointId(vectorId) {
    let hash = 0;
    for (let i = 0; i < vectorId.length; i++) {
      const char = vectorId.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash) + (Date.now() % 1000000);
  }
  
  /**
   * Search for similar memories in Qdrant
   */
  async search(queryText, limit = 10) {
    try {
      const queryEmbedding = await this.getEmbedding(queryText);
      
      const response = await fetch(`${this.qdrantUrl}/collections/memories/points/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector: queryEmbedding,
          limit: limit,
          with_payload: true
        }),
        signal: AbortSignal.timeout(5000)
      });
      
      if (!response.ok) {
        throw new Error(`Qdrant search failed: ${response.status}`);
      }
      
      const data = await response.json();
      return data.result || [];
      
    } catch (err) {
      logger.error(`Semantic search failed: ${err.message}`);
      return [];
    }
  }
  
  /**
   * Store embedding in cache
   */
  _cacheEmbedding(key, embedding) {
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, embedding);
  }
  
  /**
   * Check if embedding service is available
   */
  async checkHealth() {
    try {
      const response = await fetch(`${this.serviceUrl}/health`, {
        signal: AbortSignal.timeout(2000)
      });
      return response.ok;
    } catch (err) {
      logger.warn(`Embedding service not available: ${err.message}`);
      return false;
    }
  }
  
  /**
   * Clear embedding cache
   */
  clearCache() {
    this.cache.clear();
    logger.debug('Embedding cache cleared');
  }
  
  /**
   * Get cache stats
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize
    };
  }
}

module.exports = MemoryEmbedder;
