/**
 * UNCERTAINTY DETECTOR
 * Detects when NIA should ask for clarification
 * ~90 lines (Target: <100)
 */

const logger = require('../../../utils/logger');

class UncertaintyDetector {
  constructor() {
    this.ambiguousPatterns = [
      /\bthat\b/i,
      /\bit\b/i,
      /\bthis\b/i,
      /\bthese\b/i,
      /\bthose\b/i,
      /\bthem\b/i
    ];
    
    this.contradictsWords = [
      'but', 'however', 'although', 'though', 'except',
      'actually', 'really', 'honestly'
    ];
  }
  
  /**
   * Detect uncertainty in message
   */
  detect(message, context = {}) {
    const uncertainties = [];
    
    // Check for ambiguous references
    const ambiguous = this._detectAmbiguousReferences(message);
    if (ambiguous.score > 0.5) {
      uncertainties.push({
        type: 'ambiguous_reference',
        score: ambiguous.score,
        reason: 'Message contains unclear pronouns or references',
        examples: ambiguous.examples
      });
    }
    
    // Check for potential typos
    const typos = this._detectPotentialTypos(message);
    if (typos.score > 0.5) {
      uncertainties.push({
        type: 'potential_typo',
        score: typos.score,
        reason: 'Unusual spelling or word combinations detected',
        examples: typos.examples
      });
    }
    
    // Check for contradictions
    if (context.recentBeliefs) {
      const contradiction = this._detectContradiction(message, context.recentBeliefs);
      if (contradiction.score > 0.6) {
        uncertainties.push({
          type: 'contradiction',
          score: contradiction.score,
          reason: 'Contradicts recent beliefs',
          conflictingBeliefs: contradiction.conflicts
        });
      }
    }
    
    if (uncertainties.length === 0) {
      return null;
    }
    
    // Return highest uncertainty
    uncertainties.sort((a, b) => b.score - a.score);
    
    return {
      uncertain: true,
      primaryType: uncertainties[0].type,
      score: uncertainties[0].score,
      reason: uncertainties[0].reason,
      details: uncertainties[0]
    };
  }
  
  /**
   * Detect ambiguous references
   */
  _detectAmbiguousReferences(message) {
    let count = 0;
    const examples = [];
    
    for (const pattern of this.ambiguousPatterns) {
      const matches = message.match(new RegExp(pattern, 'gi'));
      if (matches) {
        count += matches.length;
        examples.push(...matches.slice(0, 2));
      }
    }
    
    const score = Math.min(1, count * 0.3);
    return { score, examples };
  }
  
  /**
   * Detect potential typos (simple heuristic)
   */
  _detectPotentialTypos(message) {
    const words = message.toLowerCase().split(/\s+/);
    const examples = [];
    
    // Very basic: look for unusual character sequences
    for (const word of words) {
      if (word.length > 3 && /(.)\1{2,}/.test(word)) {
        examples.push(word);
      }
    }
    
    const score = Math.min(1, examples.length * 0.4);
    return { score, examples };
  }
  
  /**
   * Detect contradictions with recent beliefs
   */
  _detectContradiction(message, recentBeliefs) {
    const conflicts = [];
    const messageLower = message.toLowerCase();
    
    for (const belief of recentBeliefs) {
      const beliefLower = belief.belief_statement.toLowerCase();
      
      // Simple check: negation words + shared concepts
      const hasNegation = this.contradictsWords.some(w => messageLower.includes(w));
      
      if (hasNegation) {
        conflicts.push(belief);
      }
    }
    
    const score = Math.min(1, conflicts.length * 0.4);
    return { score, conflicts };
  }
}

module.exports = UncertaintyDetector;
