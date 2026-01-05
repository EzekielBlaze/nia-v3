/**
 * VECTOR CLIENT
 * Shared Qdrant client with connection pooling
 * ~65 lines (Target: <70)
 */

const logger = require('../../../utils/logger');

class VectorClient {
  constructor(config = {}) {
    this.host = config.host || 'localhost';
    this.port = config.port || 6333;
    this.baseUrl = `http://${this.host}:${this.port}`;
    this.timeout = config.timeout || 5000;
  }
  
  /**
   * Create collection if it doesn't exist
   */
  async ensureCollection(collectionName, vectorSize, distance = 'Cosine') {
    try {
      // Check if collection exists
      const exists = await this._collectionExists(collectionName);
      
      if (!exists) {
        logger.info(`Creating Qdrant collection: ${collectionName}`);
        
        await fetch(`${this.baseUrl}/collections/${collectionName}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vectors: {
              size: vectorSize,
              distance
            }
          }),
          signal: AbortSignal.timeout(this.timeout)
        });
      }
      
      return true;
      
    } catch (err) {
      logger.error(`Failed to ensure collection ${collectionName}: ${err.message}`);
      return false;
    }
  }
  
  /**
   * Check if collection exists
   */
  async _collectionExists(collectionName) {
    try {
      const response = await fetch(`${this.baseUrl}/collections/${collectionName}`, {
        signal: AbortSignal.timeout(this.timeout)
      });
      
      return response.ok;
      
    } catch {
      return false;
    }
  }
  
  /**
   * Check if Qdrant is available
   */
  async checkHealth() {
    try {
      const response = await fetch(`${this.baseUrl}/`, {
        signal: AbortSignal.timeout(2000)
      });
      
      return response.ok;
      
    } catch {
      return false;
    }
  }
}

module.exports = VectorClient;
