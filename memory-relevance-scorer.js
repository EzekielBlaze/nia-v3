/**
 * MEMORY RELEVANCE SCORER
 * 
 * Scores recalled memory candidates for relevance to the user's query.
 * Uses ONE LLM call to score ALL candidates at once (efficiency).
 * 
 * This bridges the gap between "keyword matched" and "actually relevant".
 * 
 * Example:
 *   Query: "what do I like?"
 *   Candidates: 
 *     - "gloomie likes whales" (matched "like")
 *     - "user likes Photography" (matched "like")
 *   Scores: [3, 9] → Only return the Photography one
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

class MemoryRelevanceScorer {
  constructor(options = {}) {
    // LLM client (injected) or fallback to local
    this.llmClient = options.llmClient || null;
    this.llmEndpoint = options.llmEndpoint || 'http://localhost:1234/v1/chat/completions';
    this.llmModel = options.llmModel || 'local-model';
    this.scoreThreshold = options.scoreThreshold || 6; // 0-10, keep >= this
    this.maxCandidates = options.maxCandidates || 15; // Don't score more than this
    this.enabled = options.enabled !== false;
    
    // Cache for recent queries
    this.cache = new Map();
    this.cacheMaxSize = 50;
    this.cacheTTL = 60000; // 1 minute
  }
  
  /**
   * Score memory candidates for relevance to query
   * 
   * @param query - User's message/query
   * @param candidates - Array of memory objects with memory_statement field
   * @returns Array of {memory, score, relevant} sorted by score desc
   */
  async scoreRelevance(query, candidates) {
    if (!this.enabled || candidates.length === 0) {
      // Pass through all candidates with neutral scores
      return candidates.map(m => ({
        memory: m,
        score: 5,
        relevant: true
      }));
    }
    
    // Check cache
    const cacheKey = this._cacheKey(query, candidates);
    const cached = this._getFromCache(cacheKey);
    if (cached) {
      logger.debug('Relevance scorer: cache hit');
      return cached;
    }
    
    // Limit candidates
    const toScore = candidates.slice(0, this.maxCandidates);
    
    try {
      const startTime = Date.now();
      
      // Build scoring prompt
      const prompt = this._buildPrompt(query, toScore);
      
      // Call LLM
      const response = await this._callLLM(prompt);
      
      // Parse scores
      const scores = this._parseScores(response, toScore.length);
      
      // Combine with candidates
      const results = toScore.map((memory, i) => ({
        memory,
        score: scores[i] || 0,
        relevant: (scores[i] || 0) >= this.scoreThreshold
      }));
      
      // Sort by score descending
      results.sort((a, b) => b.score - a.score);
      
      const elapsed = Date.now() - startTime;
      const relevantCount = results.filter(r => r.relevant).length;
      
      logger.info(`Relevance scorer: ${relevantCount}/${toScore.length} relevant in ${elapsed}ms`);
      
      // Cache result
      this._setCache(cacheKey, results);
      
      return results;
      
    } catch (err) {
      logger.error(`Relevance scorer failed: ${err.message}`);
      // Fallback: return all with neutral scores
      return candidates.map(m => ({
        memory: m,
        score: 5,
        relevant: true
      }));
    }
  }
  
  /**
   * Get only relevant memories (convenience method)
   */
  async getRelevant(query, candidates) {
    const scored = await this.scoreRelevance(query, candidates);
    return scored.filter(r => r.relevant).map(r => r.memory);
  }
  
  /**
   * Build scoring prompt
   */
  _buildPrompt(query, candidates) {
    const memoryList = candidates
      .map((m, i) => `${i + 1}. "${m.memory_statement || m.statement}"`)
      .join('\n');
    
    return `Score how relevant each memory is to answering this query.

QUERY: "${query}"

MEMORIES TO SCORE:
${memoryList}

SCORING GUIDE:
- 0-2: Completely irrelevant, different topic entirely
- 3-4: Tangentially related, but doesn't help answer
- 5-6: Somewhat relevant, might be useful context
- 7-8: Directly relevant, helps answer the query
- 9-10: Exactly what's needed to answer

IMPORTANT RULES:
1. If query asks about "I" or "me" or "my", only memories about "user" are relevant
2. If query asks about a specific person (like "Gloomie"), only memories about that person are relevant
3. Keyword overlap alone doesn't make something relevant
4. Consider: "Would this memory help answer the question?"

OUTPUT FORMAT (JSON only, no other text):
{"scores": [score1, score2, score3, ...]}

Example for 3 memories: {"scores": [8, 2, 9]}

Output ONLY the JSON object:`;
  }
  
  /**
   * Call LLM API (uses injected client if available)
   */
  async _callLLM(prompt) {
    const systemPrompt = 'You score memory relevance. Output ONLY valid JSON with scores array. No preamble, no explanation.';
    
    // Use injected llmClient if available
    if (this.llmClient) {
      return this.llmClient.chat(systemPrompt, [
        { role: 'user', content: prompt }
      ], { temperature: 0.1, maxTokens: 200 });
    }
    
    // Fallback to local fetch
    const response = await fetch(this.llmEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.llmModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1, // Low temp for consistent scoring
        max_tokens: 200
      })
    });
    
    if (!response.ok) {
      throw new Error(`LLM API error: ${response.status}`);
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
  }
  
  /**
   * Parse scores from LLM response
   */
  _parseScores(response, expectedCount) {
    try {
      // Try direct parse
      let parsed = JSON.parse(response);
      if (parsed.scores && Array.isArray(parsed.scores)) {
        return this._normalizeScores(parsed.scores, expectedCount);
      }
    } catch (e) {
      // Try to extract JSON
      const match = response.match(/\{[\s\S]*"scores"[\s\S]*\}/);
      if (match) {
        try {
          const parsed = JSON.parse(match[0]);
          if (parsed.scores && Array.isArray(parsed.scores)) {
            return this._normalizeScores(parsed.scores, expectedCount);
          }
        } catch (e2) {}
      }
      
      // Try to extract array directly
      const arrayMatch = response.match(/\[[\d,\s]+\]/);
      if (arrayMatch) {
        try {
          const scores = JSON.parse(arrayMatch[0]);
          return this._normalizeScores(scores, expectedCount);
        } catch (e3) {}
      }
    }
    
    logger.warn('Failed to parse relevance scores, using defaults');
    return new Array(expectedCount).fill(5);
  }
  
  /**
   * Normalize scores to expected count and range
   */
  _normalizeScores(scores, expectedCount) {
    const normalized = [];
    
    for (let i = 0; i < expectedCount; i++) {
      let score = scores[i];
      
      // Handle missing
      if (score === undefined || score === null) {
        score = 5;
      }
      
      // Clamp to 0-10
      score = Math.max(0, Math.min(10, Number(score) || 5));
      
      normalized.push(score);
    }
    
    return normalized;
  }
  
  /**
   * Cache key generation
   */
  _cacheKey(query, candidates) {
    const memoryIds = candidates.map(m => m.id || m.memory_statement?.substring(0, 20)).join(',');
    return `${query.toLowerCase().substring(0, 50)}|${memoryIds}`;
  }
  
  /**
   * Get from cache if valid
   */
  _getFromCache(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.time > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }
  
  /**
   * Set cache entry
   */
  _setCache(key, value) {
    // Evict old entries if full
    if (this.cache.size >= this.cacheMaxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(key, {
      value,
      time: Date.now()
    });
  }
  
  /**
   * Set score threshold
   */
  setThreshold(threshold) {
    this.scoreThreshold = threshold;
    logger.info(`Relevance scorer threshold set to ${threshold}`);
  }
  
  /**
   * Enable/disable scorer
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    logger.info(`Relevance scorer ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

module.exports = MemoryRelevanceScorer;
