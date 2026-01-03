/**
 * BELIEF CANDIDATE VALIDATOR
 * 
 * Deterministic rules to filter out junk and prevent hallucinated beliefs.
 * These are HARD EDGES - no fuzzy logic, no "vibes."
 * 
 * V3: BELIEF-WORTHINESS CHECKS
 * Prevents extracting beliefs from greetings, pleasantries, or conversational noise.
 */

const logger = require('./utils/logger');

class BeliefValidator {
  constructor() {
    // Rejection patterns
    this.questionPatterns = /\?|should I|do I|am I|would I/i;
    this.imperativePatterns = /^(let's|let us|we should|I need to|I must|I have to)/i;
    this.hedgeWords = /(maybe|might|could|perhaps|possibly|probably|I think|I guess)/i;
    this.temporaryStates = /^I (am|feel|need) (hungry|tired|thirsty|sick|busy|stressed) right now/i;
    this.sarcasticMarkers = /(yeah right|sure|totally|obviously|of course.*not)/i;
    
    // Subject validation
    this.firstPersonMarkers = /^I (am|have|believe|value|prefer|tend to|avoid|like|dislike)/i;
    
    // BELIEF-WORTHINESS: Trigger patterns (statements that indicate actual beliefs)
    this.beliefTriggers = [
      // Value/stance verbs
      /\b(value|prefer|dislike|avoid|care about|believe|prioritize|reject)\b/i,
      // Stable modality
      /\b(always|usually|tend to|often|rarely|never|I'm the kind of|I'm someone who)\b/i,
      // Explicit learning/update
      /\b(realized|learned|discovered|changed my mind|now understand|came to believe)\b/i,
      // Constraint/principle
      /\b(won't|refuse|can't accept|must|it's important that|matters to me|principle)\b/i,
      // Identity statements
      /\b(I am|I'm|that's who I am|defines me|core to|fundamental)\b/i
    ];
    
    // BELIEF-WORTHINESS: Stopwords (common words with no semantic content)
    this.stopwords = new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'of', 'at', 'by', 'for',
      'with', 'about', 'as', 'into', 'through', 'during', 'before', 'after',
      'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off',
      'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there',
      'when', 'where', 'why', 'how', 'all', 'both', 'each', 'few', 'more',
      'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
      'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just',
      'don', 'should', 'now', 'am', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
      'that', 'this', 'these', 'those', 'it', 'its', 'me', 'my', 'you', 'your'
    ]);
    
    // Ambiguous subjects that need disambiguation
    this.ambiguousSubjects = {
      'bugs': {
        contexts: {
          'software_bugs': ['code', 'program', 'software', 'memory', 'compile', 'runtime', 'error', 'crash', 'debug', 'fix', 'patch'],
          'insect_bugs': ['insect', 'crawl', 'fly', 'antenna', 'nature', 'garden', 'pest', 'beetle', 'spider']
        }
      },
      'memory': {
        contexts: {
          'computer_memory': ['ram', 'allocate', 'pointer', 'leak', 'stack', 'heap', 'byte', 'buffer', 'storage', 'malloc', 'free'],
          'human_memory': ['remember', 'forget', 'recall', 'brain', 'nostalgia', 'childhood', 'traumatic', 'recollection']
        }
      },
      'type': {
        contexts: {
          'data_type': ['integer', 'string', 'boolean', 'variable', 'compile', 'static', 'dynamic', 'type system', 'typed'],
          'personality_type': ['personality', 'character', 'introvert', 'extrovert', 'myers', 'briggs', 'enneagram']
        }
      },
      'python': {
        contexts: {
          'Python_language': ['code', 'program', 'script', 'django', 'pip', 'import', 'def', 'class', 'syntax', 'interpreter'],
          'python_snake': ['snake', 'reptile', 'slither', 'venom', 'constrict', 'scales', 'boa', 'anaconda']
        }
      },
      'java': {
        contexts: {
          'Java_language': ['code', 'program', 'jvm', 'class', 'object', 'spring', 'maven', 'compile', 'bytecode'],
          'Java_island': ['island', 'indonesia', 'coffee', 'jakarta', 'culture', 'geography', 'bali']
        }
      },
      'rust': {
        contexts: {
          'Rust_language': ['code', 'program', 'borrow', 'ownership', 'cargo', 'crate', 'compile', 'safe', 'memory', 'lifetime'],
          'rust_corrosion': ['corrosion', 'oxidation', 'metal', 'iron', 'decay', 'deteriorate', 'rust belt', 'rusty'],
          'Rust_game': ['survival', 'game', 'multiplayer', 'PC', 'base', 'raid', 'loot', 'server', 'wipe', 'nakeds', 'monument']
        }
      },
      'class': {
        contexts: {
          'programming_class': ['object', 'instance', 'method', 'inheritance', 'code', 'struct', 'constructor'],
          'social_class': ['wealthy', 'poor', 'middle', 'upper', 'lower', 'economic', 'society', 'inequality'],
          'school_class': ['student', 'teacher', 'lesson', 'homework', 'grade', 'education', 'course', 'lecture']
        }
      },
      'function': {
        contexts: {
          'programming_function': ['code', 'return', 'parameter', 'argument', 'call', 'def', 'method', 'lambda'],
          'mathematical_function': ['equation', 'variable', 'input', 'output', 'domain', 'range', 'graph', 'derivative']
        }
      },
      'bank': {
        contexts: {
          'financial_bank': ['money', 'account', 'deposit', 'loan', 'interest', 'savings', 'checking', 'atm'],
          'river_bank': ['river', 'shore', 'water', 'erosion', 'fish', 'stream', 'creek']
        }
      },
      'light': {
        contexts: {
          'visible_light': ['photon', 'wavelength', 'bright', 'dark', 'illuminate', 'lamp', 'spectrum', 'visible'],
          'weight_light': ['heavy', 'weight', 'mass', 'pound', 'kilogram', 'feather', 'lightweight']
        }
      }
    };
  }
  
  /**
   * Disambiguate subject based on statement context
   * Enhanced with ALL-context scoring and uncertainty flagging
   */
  disambiguateSubject(subject, statement) {
    const subjectLower = subject.toLowerCase();
    
    // Check if subject is ambiguous
    if (!this.ambiguousSubjects[subjectLower]) {
      return subject; // Not ambiguous, return as-is
    }
    
    const contexts = this.ambiguousSubjects[subjectLower].contexts;
    const stmtLower = statement.toLowerCase();
    
    // Score ALL contexts
    const scores = {};
    let totalScore = 0;
    
    for (const [contextName, keywords] of Object.entries(contexts)) {
      let score = 0;
      const matchedKeywords = [];
      
      for (const keyword of keywords) {
        if (stmtLower.includes(keyword.toLowerCase())) {
          score++;
          matchedKeywords.push(keyword);
        }
      }
      
      scores[contextName] = { score, keywords: matchedKeywords };
      totalScore += score;
    }
    
    // Find best match
    let bestContext = null;
    let bestScore = 0;
    let secondBestScore = 0;
    
    const sortedContexts = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
    
    if (sortedContexts.length > 0) {
      bestContext = sortedContexts[0][0];
      bestScore = sortedContexts[0][1].score;
      
      if (sortedContexts.length > 1) {
        secondBestScore = sortedContexts[1][1].score;
      }
    }
    
    // Confidence calculation
    const confidence = totalScore > 0 ? (bestScore / totalScore) : 0;
    const isAmbiguous = bestScore === secondBestScore || confidence < 0.5;
    
    // If we found a clear match, use it
    if (bestContext && bestScore > 0 && !isAmbiguous) {
      logger.info(`Disambiguated "${subject}" → "${bestContext}" (score: ${bestScore}, confidence: ${(confidence * 100).toFixed(0)}%, keywords: ${scores[bestContext].keywords.join(', ')})`);
      return bestContext;
    }
    
    // Flag uncertain cases
    if (isAmbiguous && totalScore > 0) {
      logger.warn(`Ambiguous disambiguation for "${subject}": ${JSON.stringify(Object.entries(scores).map(([k, v]) => `${k}:${v.score}`))}`);
      // Return best guess but log uncertainty
      return bestContext || subject;
    }
    
    // No clear context found - keep original
    logger.warn(`Could not disambiguate "${subject}" (no keyword matches), keeping original`);
    return subject;
  }
  
  /**
   * Count content words (non-stopwords) in statement
   * BELIEF-WORTHINESS: Minimum semantic payload check
   */
  countContentWords(statement) {
    const words = statement
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')  // Remove punctuation
      .split(/\s+/)
      .filter(w => w.length > 0 && !this.stopwords.has(w));
    
    return words.length;
  }
  
  /**
   * Check if statement contains belief trigger patterns
   * BELIEF-WORTHINESS: Distinguishes beliefs from pleasantries
   */
  hasBeliefTrigger(statement) {
    for (const pattern of this.beliefTriggers) {
      if (pattern.test(statement)) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Validate evidence quality (stricter than just existence)
   * BELIEF-WORTHINESS: Evidence must be substantial and belief-bearing
   */
  validateEvidenceQuality(evidence, statement) {
    if (!evidence || evidence.length === 0) {
      return { valid: false, reason: 'No evidence provided' };
    }
    
    // Find direct quotes from user/assistant
    const quotes = evidence.filter(e => 
      (e.source === 'user_message' || e.source === 'assistant_message') && 
      e.quote && 
      e.quote.length > 10
    );
    
    if (quotes.length === 0) {
      return { valid: false, reason: 'No substantial quotes in evidence' };
    }
    
    // At least one quote should contain meaningful content
    const hasSubstantialQuote = quotes.some(q => {
      const contentWords = this.countContentWords(q.quote);
      return contentWords >= 4;  // Minimum 4 content words in quote
    });
    
    if (!hasSubstantialQuote) {
      return { valid: false, reason: 'Evidence quotes lack semantic substance' };
    }
    
    return { valid: true };
  }
  
  /**
   * Validate a candidate and return result
   */
  validate(candidate) {
    const errors = [];
    const warnings = [];
    let score = 50; // base score
    
    // HARD REJECTIONS (return immediately)
    
    // 1. Subject must be valid (non-empty, proper format)
    if (!candidate.subject || typeof candidate.subject !== 'string') {
      errors.push('Subject is missing or invalid type');
      return { valid: false, errors, warnings, score: 0 };
    }
    
    const subject = candidate.subject.trim();
    
    // REJECT random nouns that aren't real subjects
    const invalidSubjects = ['day', 'nap', 'title', 'smiley_face', 'smiley', 'face', 'time', 'moment'];
    if (invalidSubjects.includes(subject.toLowerCase())) {
      errors.push(`Invalid subject: "${subject}" is not a valid belief subject`);
      return { valid: false, errors, warnings, score: 0 };
    }
    
    // Subject should be a noun/concept (allow any noun, but enforce format)
    if (subject.length < 2) {
      errors.push('Subject too short');
      return { valid: false, errors, warnings, score: 0 };
    }
    
    // Reserved subjects should be lowercase
    const reservedSubjects = ['user', 'self', 'assistant'];
    const isReserved = reservedSubjects.includes(subject.toLowerCase());
    
    if (isReserved && subject !== subject.toLowerCase()) {
      warnings.push(`Reserved subject "${subject}" should be lowercase`);
      candidate.subject = subject.toLowerCase();
    }
    
    // For dynamic subjects (non-reserved), capitalize proper nouns
    if (!isReserved && subject.length > 0) {
      // First, disambiguate the subject based on context
      const disambiguated = this.disambiguateSubject(subject, candidate.statement);
      
      // Capitalize first letter for proper nouns/concepts
      candidate.subject = disambiguated.charAt(0).toUpperCase() + disambiguated.slice(1).toLowerCase();
    }
    
    // 2. Statement must exist and be non-empty
    if (!candidate.statement || candidate.statement.trim().length === 0) {
      errors.push('Statement is empty');
      return { valid: false, errors, warnings, score: 0 };
    }
    
    const stmt = candidate.statement;
    
    // 2a. REJECT ephemeral feelings/states
    const ephemeralPatterns = [
      /^(my|the) (day|night|morning|afternoon|evening) (is|was|has been)/i,
      /^I feel (happy|sad|excited|tired|good|great|okay|fine|chill)/i,
      /^I'm (feeling|having|experiencing)/i,
      /^(today|tonight|right now|currently|at the moment)/i,
      /^I've been (thinking|feeling|doing)/i
    ];
    
    for (const pattern of ephemeralPatterns) {
      if (pattern.test(stmt)) {
        errors.push('Statement is ephemeral (temporary feeling/state, not a belief)');
        return { valid: false, errors, warnings, score: 0 };
      }
    }
    
    // 2b. BELIEF-WORTHINESS: Minimum semantic payload
    const contentWords = this.countContentWords(stmt);
    if (contentWords < 6) {
      errors.push(`Insufficient semantic content (${contentWords} content words, need >= 6)`);
      return { valid: false, errors, warnings, score: 0 };
    }
    
    // 2c. BELIEF-WORTHINESS: Must contain belief trigger pattern
    // (unless explicitly tagged as ephemeral_fact or observation)
    if (!this.hasBeliefTrigger(stmt)) {
      if (candidate.type !== 'ephemeral_fact' && candidate.type !== 'observation') {
        errors.push('Statement lacks belief trigger pattern (no value/stance/principle markers)');
        return { valid: false, errors, warnings, score: 0 };
      }
      // If tagged as observation/ephemeral, allow through but note it
      warnings.push('No belief trigger pattern (acceptable for observations)');
      score -= 10;
    }
    
    // 3. Reject questions
    if (this.questionPatterns.test(stmt)) {
      errors.push('Statement is a question');
      return { valid: false, errors, warnings, score: 0 };
    }
    
    // 4. Reject imperatives/plans
    if (this.imperativePatterns.test(stmt)) {
      errors.push('Statement is an imperative or plan');
      return { valid: false, errors, warnings, score: 0 };
    }
    
    // 5. Reject temporary states (unless tagged ephemeral_fact)
    if (this.temporaryStates.test(stmt) && candidate.type !== 'ephemeral_fact') {
      errors.push('Temporary state not tagged as ephemeral_fact');
      return { valid: false, errors, warnings, score: 0 };
    }
    
    // 6. BELIEF-WORTHINESS: Stricter evidence validation
    const evidenceCheck = this.validateEvidenceQuality(candidate.evidence, stmt);
    if (!evidenceCheck.valid) {
      errors.push(evidenceCheck.reason);
      return { valid: false, errors, warnings, score: 0 };
    }
    
    // 7. Confidence must be valid
    if (typeof candidate.confidence !== 'number' || 
        candidate.confidence < 0 || 
        candidate.confidence > 1) {
      errors.push('Invalid confidence value');
      return { valid: false, errors, warnings, score: 0 };
    }
    
    // 7b. BELIEF-WORTHINESS: Confidence threshold by type
    const identityTypes = ['value', 'principle', 'core_value', 'identity', 'scar'];
    if (identityTypes.includes(candidate.type)) {
      if (candidate.confidence < 0.65) {
        errors.push(`Identity-relevant belief requires confidence >= 0.65 (got ${candidate.confidence})`);
        return { valid: false, errors, warnings, score: 0 };
      }
    }
    
    // SOFT REJECTIONS (can pass with low score)
    
    // 8. Hedge words reduce confidence
    if (this.hedgeWords.test(stmt)) {
      if (candidate.confidence < 0.5) {
        errors.push('Hedged statement with low confidence');
        return { valid: false, errors, warnings, score: 0 };
      }
      warnings.push('Contains hedge words');
      score -= 20;
    }
    
    // 9. Sarcasm detection
    if (this.sarcasticMarkers.test(stmt)) {
      warnings.push('Possible sarcasm detected');
      score -= 30;
    }
    
    // 10. Must use first person
    if (!this.firstPersonMarkers.test(stmt) && candidate.type === 'belief') {
      warnings.push('Not in first person format');
      score -= 10;
    }
    
    // SCORING BOOSTS
    
    // Type-based bonuses
    if (candidate.time_scope === 'long_term') {
      score += 20;
    }
    
    // Evidence quality
    const hasDirectQuote = candidate.evidence.some(e => 
      e.source === 'user_message' && e.quote && e.quote.length > 10
    );
    if (hasDirectQuote) {
      score += 10;
    }
    
    // Confidence alignment
    score += candidate.confidence * 20; // 0-20 bonus
    
    // Multiple evidence sources
    if (candidate.evidence.length > 1) {
      score += 5;
    }
    
    // Formation reasoning quality
    if (candidate.formation_reasoning && candidate.formation_reasoning.length > 20) {
      score += 5;
    }
    
    // Clamp score 0-100
    score = Math.max(0, Math.min(100, score));
    
    // Final check: minimum score threshold
    if (score < 30) {
      errors.push(`Score too low: ${score}`);
      return { valid: false, errors, warnings, score };
    }
    
    return {
      valid: true,
      errors: [],
      warnings,
      score,
      normalizedCandidate: this.normalize(candidate)
    };
  }
  
  /**
   * Normalize a candidate
   */
  normalize(candidate) {
    let stmt = candidate.statement;
    
    // Remove trailing punctuation
    stmt = stmt.replace(/[.!?]+$/, '');
    
    // Standardize hedges to "believe"
    stmt = stmt.replace(/I think that/i, 'I believe');
    stmt = stmt.replace(/I guess/i, 'I believe');
    
    // Ensure first person
    if (!stmt.startsWith('I ')) {
      // Try to convert if possible
      if (stmt.match(/^(being|having|doing)/i)) {
        stmt = 'I value ' + stmt.toLowerCase();
      }
    }
    
    // TODO: Phase 2 - Embedding refresh needed
    // When Poincaré embeddings are added, trigger re-embedding here
    // after normalization changes the statement text
    
    return {
      ...candidate,
      statement: stmt,
      conviction_score: this.score
    };
  }
  
  /**
   * Batch validate multiple candidates
   */
  validateBatch(candidates) {
    const results = {
      valid: [],
      rejected: [],
      warnings: []
    };
    
    for (const candidate of candidates) {
      const validation = this.validate(candidate);
      
      if (validation.valid) {
        results.valid.push({
          ...validation.normalizedCandidate,
          validation_score: validation.score,
          validation_warnings: validation.warnings
        });
        
        if (validation.warnings.length > 0) {
          results.warnings.push({
            statement: candidate.statement,
            warnings: validation.warnings
          });
        }
      } else {
        results.rejected.push({
          statement: candidate.statement,
          errors: validation.errors,
          score: validation.score
        });
      }
    }
    
    // RATE LIMITER: Prevent belief floods (max 4 per conversation turn)
    if (results.valid.length > 4) {
      logger.warn(`Rate limiting: ${results.valid.length} candidates, keeping top 4 by score`);
      results.valid.sort((a, b) => b.validation_score - a.validation_score);
      const dropped = results.valid.slice(4);
      results.valid = results.valid.slice(0, 4);
      
      results.warnings.push({
        statement: 'RATE_LIMIT',
        warnings: [`Dropped ${dropped.length} lower-scored beliefs to prevent flood`]
      });
    }
    
    logger.info(`Validated ${candidates.length} candidates: ${results.valid.length} valid, ${results.rejected.length} rejected`);
    
    return results;
  }
}

module.exports = BeliefValidator;
