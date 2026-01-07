/**
 * CONVERSATION ARCHIVER
 * 
 * Stores full conversation turns in Qdrant for semantic search.
 * Enables queries like "what did we talk about yesterday?" or
 * "that thing we discussed about spaceships".
 * 
 * Unlike memory_commits (extracted facts), this stores the RAW conversation
 * for semantic retrieval of past discussions.
 */

// Logger with fallback
let logger;
try {
  logger = require('./utils/logger');
} catch (e) {
  try {
    logger = require('../../utils/logger');
  } catch (e2) {
    logger = {
      debug: () => {},
      info: console.log,
      warn: console.warn,
      error: console.error
    };
  }
}

class ConversationArchiver {
  constructor(options = {}) {
    this.vectorClient = options.vectorClient;
    this.embedder = options.embedder;
    this.collectionName = 'conversation_archive';
    this.vectorSize = 384; // all-MiniLM-L6-v2
    this.initialized = false;
    this.enabled = options.enabled !== false;
    
    // Batch for efficiency
    this.batch = [];
    this.batchSize = options.batchSize || 5;
    this.flushInterval = options.flushInterval || 30000; // 30 seconds
    this._startFlushTimer();
  }
  
  /**
   * Initialize collection in Qdrant
   */
  async init() {
    if (this.initialized) return true;
    if (!this.vectorClient) {
      logger.warn('ConversationArchiver: No vector client provided');
      return false;
    }
    
    try {
      // Check if Qdrant is available
      const healthy = await this.vectorClient.checkHealth();
      if (!healthy) {
        logger.warn('ConversationArchiver: Qdrant not available');
        return false;
      }
      
      // Ensure collection exists
      const success = await this.vectorClient.ensureCollection(
        this.collectionName,
        this.vectorSize,
        'Cosine'
      );
      
      if (success) {
        // Create payload index on timestamp for efficient ordering
        try {
          await fetch(
            `${this.vectorClient.baseUrl}/collections/${this.collectionName}/index`,
            {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                field_name: 'timestamp',
                field_schema: 'integer'
              }),
              signal: AbortSignal.timeout(5000)
            }
          );
          logger.debug('ConversationArchiver: timestamp index ready');
        } catch (indexErr) {
          // Index might already exist, that's fine
          logger.debug(`Timestamp index: ${indexErr.message}`);
        }
        
        this.initialized = true;
        logger.info('ConversationArchiver initialized');
      }
      
      return success;
      
    } catch (err) {
      logger.error(`ConversationArchiver init failed: ${err.message}`);
      return false;
    }
  }
  
  /**
   * Archive a conversation turn
   * 
   * @param userMessage - What the user said
   * @param niaResponse - What NIA said
   * @param metadata - { turnId, sessionId, thinking, topics }
   */
  async archiveTurn(userMessage, niaResponse, metadata = {}) {
    if (!this.enabled) return { queued: false, reason: 'disabled' };
    
    // Ensure initialized
    if (!this.initialized) {
      const ok = await this.init();
      if (!ok) return { queued: false, reason: 'not_initialized' };
    }
    
    // Archive ALL conversations - no trivial filtering
    // The user wants to see their complete chat history
    
    // Queue for batch processing
    // Ensure ID is a valid integer for Qdrant
    let pointId = metadata.turnId;
    if (typeof pointId === 'bigint') {
      pointId = Number(pointId);
    } else if (typeof pointId === 'string') {
      // Try to parse as int, or generate a numeric hash
      const parsed = parseInt(pointId, 10);
      if (!isNaN(parsed)) {
        pointId = parsed;
      } else {
        // Generate numeric ID from string hash
        pointId = Math.abs(pointId.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0));
      }
    } else if (!pointId) {
      pointId = Date.now();
    }
    
    this.batch.push({
      id: pointId,
      userMessage,
      niaResponse,
      thinking: metadata.thinking || null,
      sessionId: metadata.sessionId || null,
      topics: metadata.topics || [],
      timestamp: Date.now()
    });
    
    logger.debug(`ConversationArchiver: Queued turn ${pointId} (original: ${metadata.turnId}, type: ${typeof metadata.turnId})`);
    
    // Flush if batch full
    if (this.batch.length >= this.batchSize) {
      this._flush();
    }
    
    return { queued: true, batchSize: this.batch.length };
  }
  
  /**
   * Search conversation archive
   * 
   * @param query - Semantic search query
   * @param options - { limit, since, sessionId }
   */
  async search(query, options = {}) {
    if (!this.initialized) {
      await this.init();
    }
    
    if (!this.embedder) {
      logger.warn('ConversationArchiver: No embedder for search');
      return [];
    }
    
    const {
      limit = 5,
      since = null,
      sessionId = null,
      scoreThreshold = 0.5
    } = options;
    
    try {
      // Get query embedding
      const embedding = await this.embedder.getEmbedding(query);
      
      // Build filter
      const filter = this._buildFilter(since, sessionId);
      
      // Search Qdrant
      const response = await fetch(
        `${this.vectorClient.baseUrl}/collections/${this.collectionName}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector: embedding,
            limit,
            score_threshold: scoreThreshold,
            with_payload: true,
            ...(filter && { filter })
          }),
          signal: AbortSignal.timeout(5000)
        }
      );
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      
      const data = await response.json();
      
      return data.result.map(r => ({
        turnId: r.id,
        userMessage: r.payload.user_message,
        niaResponse: r.payload.nia_response,
        timestamp: r.payload.timestamp,
        sessionId: r.payload.session_id,
        topics: r.payload.topics,
        score: r.score
      }));
      
    } catch (err) {
      logger.error(`Conversation search failed: ${err.message}`);
      return [];
    }
  }
  
  /**
   * Get recent conversations (by time, not semantic)
   */
  async getRecent(limit = 10, sessionId = null) {
    if (!this.initialized) return [];
    
    try {
      const filter = sessionId ? {
        must: [{ key: 'session_id', match: { value: sessionId } }]
      } : null;
      
      // Try with order_by first (Qdrant 1.7+), fall back to fetching more and sorting
      let response;
      let useOrderBy = true;
      
      try {
        response = await fetch(
          `${this.vectorClient.baseUrl}/collections/${this.collectionName}/points/scroll`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              limit: limit * 2,
              with_payload: true,
              with_vector: false,
              order_by: { key: 'timestamp', direction: 'desc' },
              ...(filter && { filter })
            }),
            signal: AbortSignal.timeout(5000)
          }
        );
        
        // Check if order_by was rejected
        if (!response.ok) {
          const errText = await response.text();
          if (errText.includes('order_by') || errText.includes('unknown field')) {
            useOrderBy = false;
            logger.debug('Qdrant order_by not supported, falling back to fetch-all');
          }
        }
      } catch (e) {
        useOrderBy = false;
      }
      
      // Fallback: fetch more points and sort client-side
      if (!useOrderBy || !response?.ok) {
        response = await fetch(
          `${this.vectorClient.baseUrl}/collections/${this.collectionName}/points/scroll`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              limit: 100,  // Fetch more to ensure we get recent ones
              with_payload: true,
              with_vector: false,
              ...(filter && { filter })
            }),
            signal: AbortSignal.timeout(5000)
          }
        );
      }
      
      if (!response.ok) {
        const errText = await response.text();
        logger.warn(`getRecent scroll failed: ${response.status} - ${errText}`);
        return [];
      }
      
      const data = await response.json();
      
      if (!data.result?.points) {
        logger.warn('getRecent: No points in response');
        return [];
      }
      
      logger.debug(`getRecent: Got ${data.result.points.length} points from Qdrant`);
      
      // Sort by timestamp descending and take first N
      const sorted = data.result.points
        .filter(p => p.payload?.timestamp)  // Ensure has timestamp
        .sort((a, b) => (b.payload.timestamp || 0) - (a.payload.timestamp || 0))
        .slice(0, limit);
      
      return sorted.map(p => ({
        turnId: p.id,
        userMessage: p.payload.user_message,
        niaResponse: p.payload.nia_response,
        timestamp: p.payload.timestamp,
        sessionId: p.payload.session_id,
        topics: p.payload.topics
      }));
        
    } catch (err) {
      logger.error(`Get recent conversations failed: ${err.message}`);
      return [];
    }
  }
  
  /**
   * Flush batch to Qdrant
   */
  async _flush() {
    if (this.batch.length === 0) {
      logger.debug('ConversationArchiver._flush: Empty batch, skipping');
      return;
    }
    if (!this.embedder) {
      logger.warn('ConversationArchiver: No embedder, clearing batch');
      this.batch = [];
      return;
    }
    
    const toFlush = [...this.batch];
    this.batch = [];
    
    logger.info(`ConversationArchiver._flush: Processing ${toFlush.length} turns`);
    
    try {
      // Generate embeddings for all
      const points = [];
      
      for (const turn of toFlush) {
        try {
          // Combine user + NIA for embedding
          const text = `User: ${turn.userMessage}\nNIA: ${turn.niaResponse.substring(0, 500)}`;
          logger.debug(`ConversationArchiver: Embedding turn ${turn.id}, text length: ${text.length}`);
          
          const embedding = await this.embedder.getEmbedding(text);
          
          if (!embedding) {
            logger.warn(`ConversationArchiver: No embedding returned for turn ${turn.id}`);
            continue;
          }
          
          if (!Array.isArray(embedding)) {
            logger.warn(`ConversationArchiver: Invalid embedding type for turn ${turn.id}: ${typeof embedding}`);
            continue;
          }
          
          logger.debug(`ConversationArchiver: Got embedding for turn ${turn.id}, dims: ${embedding.length}`);
          
          points.push({
            id: turn.id,
            vector: embedding,
            payload: {
              user_message: turn.userMessage.substring(0, 1000),
              nia_response: turn.niaResponse.substring(0, 1000),
              thinking: turn.thinking?.substring(0, 500) || null,
              session_id: turn.sessionId,
              topics: turn.topics,
              timestamp: turn.timestamp
            }
          });
        } catch (embedErr) {
          logger.warn(`Failed to embed turn ${turn.id}: ${embedErr.message}`);
        }
      }
      
      if (points.length === 0) {
        logger.warn('ConversationArchiver._flush: No points to insert (all embeddings failed)');
        return;
      }
      
      logger.info(`ConversationArchiver._flush: Inserting ${points.length} points to Qdrant`);
      
      // Batch upsert to Qdrant
      const response = await fetch(
        `${this.vectorClient.baseUrl}/collections/${this.collectionName}/points`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points }),
          signal: AbortSignal.timeout(10000)
        }
      );
      
      if (response.ok) {
        const result = await response.json();
        logger.info(`ConversationArchiver: Archived ${points.length} turns successfully`);
        logger.debug(`Qdrant response: ${JSON.stringify(result)}`);
      } else {
        const errorText = await response.text();
        logger.error(`ConversationArchiver: Failed to archive turns: ${response.status} - ${errorText}`);
      }
      
    } catch (err) {
      logger.error(`Conversation archive flush failed: ${err.message}`);
      logger.error(`Stack: ${err.stack}`);
    }
  }
  
  /**
   * Check if conversation is trivial
   * Only skip if BOTH user message is trivial AND response is very short
   */
  _isTrivial(userMessage, niaResponse) {
    const userLen = userMessage?.length || 0;
    const responseLen = niaResponse?.length || 0;
    const totalLength = userLen + responseLen;
    
    // Very short exchanges - always trivial
    if (totalLength < 30) return true;
    
    // If Nia gave a substantial response (>100 chars), it's worth keeping
    if (responseLen > 100) return false;
    
    // Only check patterns if both messages are short
    if (userLen < 20 && responseLen < 80) {
      const trivialPatterns = [
        /^(hey|hi|hello|yo|sup)$/i,  // Only exact matches, not "hey nia!"
        /^(ok|okay|sure|yes|no|yeah|nah|yep|nope)$/i,
        /^(thanks|thx|ty)$/i
      ];
      
      if (trivialPatterns.some(p => p.test(userMessage?.trim() || ''))) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Build Qdrant filter
   */
  _buildFilter(since, sessionId) {
    const conditions = [];
    
    if (since) {
      conditions.push({
        key: 'timestamp',
        range: { gte: since }
      });
    }
    
    if (sessionId) {
      conditions.push({
        key: 'session_id',
        match: { value: sessionId }
      });
    }
    
    if (conditions.length === 0) return null;
    
    return { must: conditions };
  }
  
  /**
   * Start periodic flush timer
   */
  _startFlushTimer() {
    this.flushTimer = setInterval(() => {
      if (this.batch.length > 0) {
        this._flush();
      }
    }, this.flushInterval);
  }
  
  /**
   * Get archive stats
   */
  async getStats() {
    if (!this.initialized) return { count: 0, initialized: false };
    
    try {
      const response = await fetch(
        `${this.vectorClient.baseUrl}/collections/${this.collectionName}`,
        { signal: AbortSignal.timeout(2000) }
      );
      
      if (!response.ok) return { count: 0, error: response.status };
      
      const data = await response.json();
      
      return {
        count: data.result?.points_count || 0,
        initialized: true,
        pendingBatch: this.batch.length
      };
      
    } catch (err) {
      return { count: 0, error: err.message };
    }
  }
  
  /**
   * Enable/disable archiving
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    logger.info(`Conversation archiver ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Shutdown - flush remaining batch
   */
  async shutdown() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    if (this.batch.length > 0) {
      await this._flush();
    }
    
    logger.info('ConversationArchiver shut down');
  }
}

module.exports = ConversationArchiver;
