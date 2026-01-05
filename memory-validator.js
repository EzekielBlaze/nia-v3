/**
 * MEMORY VALIDATOR
 * 
 * Deterministic validation to prevent hallucinated memories.
 * Primary defense against LLM making things up.
 * 
 * Key validation: source_quote must exist in user message.
 */

const logger = require('./utils/logger');

class MemoryValidator {
  constructor() {
    // Minimum thresholds
    this.minStatementLength = 8;
    this.minImportance = 4;
    this.minSourceMatchRatio = 0.6; // 60% of quote words must match
    
    // Stop words to exclude from matching
    this.stopWords = new Set([
      'i', 'me', 'my', 'myself', 'we', 'our', 'you', 'your', 'he', 'she', 'it',
      'they', 'them', 'their', 'a', 'an', 'the', 'and', 'or', 'but', 'if', 'so',
      'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
      'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
      'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with', 'about', 'from', 'as',
      'that', 'this', 'these', 'those', 'what', 'which', 'who', 'whom',
      'just', 'like', 'really', 'very', 'also', 'too', 'now', 'then'
    ]);
    
    // Valid fact types
    this.validFactTypes = [
      'attribute', 'preference', 'relationship', 'state', 'event', 'membership',
      'observation', 'episode', 'context' // Legacy types
    ];
    
    // Valid temporal markers
    this.validTemporal = [
      'permanent', 'ongoing', 'past', 'temporary',
      'long_term', 'short_term', 'past_event' // Legacy
    ];
  }
  
  /**
   * Validate a single fact candidate
   * Returns { valid, errors, warnings, score }
   */
  validate(fact, userMessage) {
    const errors = [];
    const warnings = [];
    let score = 50; // Start at 50%
    
    // 1. Basic field validation
    if (!fact.statement || typeof fact.statement !== 'string') {
      errors.push('Missing or invalid statement');
      return { valid: false, errors, warnings, score: 0 };
    }
    
    if (fact.statement.length < this.minStatementLength) {
      errors.push(`Statement too short (${fact.statement.length} chars)`);
      return { valid: false, errors, warnings, score: 0 };
    }
    
    // 2. Source quote validation - CRITICAL
    if (!fact.source_quote) {
      errors.push('Missing source_quote - cannot verify fact');
      return { valid: false, errors, warnings, score: 0 };
    }
    
    const sourceValidation = this._validateSourceQuote(fact.source_quote, userMessage);
    if (!sourceValidation.valid) {
      errors.push(sourceValidation.reason);
      return { valid: false, errors, warnings, score: 0 };
    }
    score += sourceValidation.matchRatio * 25; // Up to +25 for good source match
    
    // 3. Statement-to-source coherence check
    const coherence = this._checkCoherence(fact.statement, fact.source_quote, userMessage);
    if (!coherence.valid) {
      errors.push(coherence.reason);
      return { valid: false, errors, warnings, score: 0 };
    }
    score += coherence.score * 15; // Up to +15 for coherence
    
    // 4. Importance threshold
    const importance = fact.importance || 0;
    if (importance < this.minImportance) {
      errors.push(`Importance too low (${importance}, need ${this.minImportance}+)`);
      return { valid: false, errors, warnings, score: 0 };
    }
    score += Math.min(importance, 10); // Up to +10 for importance
    
    // 5. Question check - facts shouldn't be questions or derived from questions
    if (fact.statement.includes('?')) {
      errors.push('Statement is a question, not a fact');
      return { valid: false, errors, warnings, score: 0 };
    }
    
    // 5b. Source quote shouldn't be a question either
    if (fact.source_quote && fact.source_quote.includes('?')) {
      errors.push('Fact derived from a question, not a statement');
      return { valid: false, errors, warnings, score: 0 };
    }
    
    // 5c. Check for request/question patterns in source
    if (fact.source_quote) {
      const requestPatterns = [
        /^(can|could|would|will|do|does) you/i,
        /^(please|hey|hi)/i,
        /\?$/
      ];
      for (const pattern of requestPatterns) {
        if (pattern.test(fact.source_quote.trim())) {
          errors.push('Fact derived from request/question, not a statement');
          return { valid: false, errors, warnings, score: 0 };
        }
      }
    }
    
    // 6. Type validation (warning only)
    if (fact.fact_type && !this.validFactTypes.includes(fact.fact_type)) {
      warnings.push(`Unknown fact_type: ${fact.fact_type}`);
    }
    
    // 7. Temporal validation (warning only)
    if (fact.temporal && !this.validTemporal.includes(fact.temporal)) {
      warnings.push(`Unknown temporal: ${fact.temporal}`);
    }
    
    // 8. About field check
    if (!fact.about) {
      warnings.push('Missing "about" field - defaulting to user');
      fact.about = 'user';
    }
    
    // Cap score
    score = Math.min(100, Math.max(0, Math.round(score)));
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      score
    };
  }
  
  /**
   * Validate source quote exists in user message
   */
  _validateSourceQuote(quote, userMessage) {
    const quoteLower = quote.toLowerCase().trim();
    const messageLower = userMessage.toLowerCase();
    
    // Direct substring match (best case)
    if (messageLower.includes(quoteLower)) {
      return { valid: true, matchRatio: 1.0, reason: 'Direct match' };
    }
    
    // Word-based matching
    const quoteWords = this._extractKeyWords(quoteLower);
    const messageWords = this._extractKeyWords(messageLower);
    
    if (quoteWords.length === 0) {
      return { valid: false, matchRatio: 0, reason: 'Source quote has no content words' };
    }
    
    // Count matching words
    const matches = quoteWords.filter(qw => 
      messageWords.some(mw => mw === qw || mw.includes(qw) || qw.includes(mw))
    );
    
    const matchRatio = matches.length / quoteWords.length;
    
    if (matchRatio < this.minSourceMatchRatio) {
      return {
        valid: false,
        matchRatio,
        reason: `Source quote not found in message (${(matchRatio * 100).toFixed(0)}% match, need ${this.minSourceMatchRatio * 100}%)`
      };
    }
    
    return { valid: true, matchRatio, reason: 'Word match' };
  }
  
  /**
   * Check statement is coherent with source and message
   */
  _checkCoherence(statement, sourceQuote, userMessage) {
    const statementWords = this._extractKeyWords(statement.toLowerCase());
    const sourceWords = this._extractKeyWords(sourceQuote.toLowerCase());
    const messageWords = this._extractKeyWords(userMessage.toLowerCase());
    
    if (statementWords.length === 0) {
      return { valid: false, score: 0, reason: 'Statement has no content words' };
    }
    
    // Statement words should mostly come from source or message
    const fromSource = statementWords.filter(sw => 
      sourceWords.some(qw => qw === sw || qw.includes(sw) || sw.includes(qw))
    );
    const fromMessage = statementWords.filter(sw =>
      messageWords.some(mw => mw === sw || mw.includes(sw) || sw.includes(mw))
    );
    
    const coverageFromSource = fromSource.length / statementWords.length;
    const coverageFromMessage = fromMessage.length / statementWords.length;
    const bestCoverage = Math.max(coverageFromSource, coverageFromMessage);
    
    // At least 40% of statement words should trace back to source
    if (bestCoverage < 0.4) {
      return {
        valid: false,
        score: bestCoverage,
        reason: `Statement contains words not in user message (${(bestCoverage * 100).toFixed(0)}% traceable)`
      };
    }
    
    return { valid: true, score: bestCoverage, reason: 'Coherent' };
  }
  
  /**
   * Extract key content words
   */
  _extractKeyWords(text) {
    return text
      .replace(/[^\w\s'-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !this.stopWords.has(w.toLowerCase()));
  }
  
  /**
   * Batch validate multiple facts
   */
  validateBatch(facts, userMessage) {
    const results = [];
    
    for (let i = 0; i < facts.length; i++) {
      const result = this.validate(facts[i], userMessage);
      results.push({
        index: i,
        fact: facts[i],
        ...result
      });
    }
    
    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    
    return results;
  }
  
  /**
   * Validate entity list from Pass A
   */
  validateEntities(entities) {
    if (!Array.isArray(entities)) {
      return { valid: false, reason: 'Entities must be an array' };
    }
    
    // Must have at least "user"
    const hasUser = entities.some(e => e.id === 'user');
    if (!hasUser) {
      return { valid: false, reason: 'Missing "user" entity' };
    }
    
    // Check for valid structure
    for (const entity of entities) {
      if (!entity.id || typeof entity.id !== 'string') {
        return { valid: false, reason: 'Entity missing id' };
      }
    }
    
    return { valid: true };
  }
}

module.exports = MemoryValidator;
