/**
 * CORRECTION DETECTOR
 * Detects correction intent in user messages
 * ~95 lines (Target: <100)
 */

const logger = require('../../../utils/logger');

class CorrectionDetector {
  constructor() {
    this.patterns = {
      typo: [
        /\b(oops|whoops|typo)\b/i,
        /\bi meant\b/i,
        /\bactually\b.*\bnot\b/i,
        /\bsorry,?\s+(i|that)\s+was\b/i
      ],
      misunderstanding: [
        /\bthat'?s not what i meant\b/i,
        /\byou misunderstood\b/i,
        /\blet me (clarify|rephrase)\b/i,
        /\bwhat i (meant|said) was\b/i
      ],
      clarification: [
        /\bto clarify\b/i,
        /\bwhat i'?m (saying|trying to say) is\b/i,
        /\bin other words\b/i
      ],
      changed_mind: [
        /\bactually,?\s+i (think|believe)\b/i,
        /\bon second thought\b/i,
        /\bi'?ve changed my mind\b/i,
        /\bi was wrong about\b/i
      ],
      user_error: [
        /\bignore that\b/i,
        /\bnever mind\b/i,
        /\bmy (bad|mistake)\b/i,
        /\bdisregard\b/i
      ]
    };
  }
  
  /**
   * Detect if message contains correction intent
   */
  detect(message) {
    const corrections = [];
    
    for (const [type, patterns] of Object.entries(this.patterns)) {
      for (const pattern of patterns) {
        if (pattern.test(message)) {
          corrections.push({
            type,
            pattern: pattern.source,
            confidence: this._calculateConfidence(message, type)
          });
          break; // Only count once per type
        }
      }
    }
    
    if (corrections.length === 0) {
      return { detected: false };
    }
    
    // Return strongest match
    corrections.sort((a, b) => b.confidence - a.confidence);
    
    return {
      detected: true,
      primaryType: corrections[0].type,
      allTypes: corrections.map(c => c.type),
      confidence: corrections[0].confidence,
      message
    };
  }
  
  /**
   * Calculate confidence score
   */
  _calculateConfidence(message, type) {
    let score = 0.7; // Base score
    
    // Boost for early position
    const lowerMessage = message.toLowerCase();
    const patterns = this.patterns[type];
    
    for (const pattern of patterns) {
      const match = lowerMessage.match(pattern);
      if (match) {
        const position = match.index / message.length;
        if (position < 0.2) score += 0.2; // Early in message
        break;
      }
    }
    
    // Boost for explicit markers
    if (lowerMessage.includes('correction')) score += 0.1;
    if (lowerMessage.includes('mistake')) score += 0.1;
    
    return Math.min(1, score);
  }
  
  /**
   * Extract what's being corrected
   */
  extractCorrection(message) {
    // Pattern: "I meant X" or "Actually it's Y" or "Not X, Y"
    
    const meantPattern = /i meant (.+?)(?:\.|$)/i;
    const actuallyPattern = /actually,?\s+(?:it'?s\s+)?(.+?)(?:\.|$)/i;
    const notPattern = /not (.+?),\s*(.+?)(?:\.|$)/i;
    
    let match;
    
    if ((match = message.match(meantPattern))) {
      return { newValue: match[1].trim() };
    }
    
    if ((match = message.match(actuallyPattern))) {
      return { newValue: match[1].trim() };
    }
    
    if ((match = message.match(notPattern))) {
      return { oldValue: match[1].trim(), newValue: match[2].trim() };
    }
    
    return { newValue: message.trim() };
  }
}

module.exports = CorrectionDetector;
