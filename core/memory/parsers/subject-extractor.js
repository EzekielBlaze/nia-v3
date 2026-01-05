/**
 * SUBJECT EXTRACTOR
 * Extracts subjects (user, self, entities) from text
 * ~70 lines (Target: <80)
 */

class SubjectExtractor {
  constructor() {
    this.firstPersonPatterns = [
      /\bi\b/i,
      /\bme\b/i,
      /\bmy\b/i,
      /\bmine\b/i,
      /\bmyself\b/i
    ];
    
    this.secondPersonPatterns = [
      /\byou\b/i,
      /\byour\b/i,
      /\byours\b/i,
      /\byourself\b/i
    ];
  }
  
  /**
   * Extract subjects from text
   */
  extract(text, context = 'user_message') {
    const subjects = [];
    
    // Always include primary subjects
    if (context === 'user_message') {
      // User is speaking
      if (this._containsFirstPerson(text)) {
        subjects.push('user');
      }
      if (this._containsSecondPerson(text)) {
        subjects.push('self'); // "you" refers to NIA
      }
    } else if (context === 'assistant_response') {
      // NIA is speaking
      if (this._containsFirstPerson(text)) {
        subjects.push('self'); // "I" refers to NIA
      }
      if (this._containsSecondPerson(text)) {
        subjects.push('user'); // "you" refers to user
      }
    }
    
    // Extract named entities (capitalized words)
    const entities = this._extractEntities(text);
    subjects.push(...entities);
    
    // Default: if no subjects found, assume it's about the conversation
    if (subjects.length === 0) {
      subjects.push('user', 'self');
    }
    
    return [...new Set(subjects)]; // Remove duplicates
  }
  
  /**
   * Check for first person pronouns
   */
  _containsFirstPerson(text) {
    return this.firstPersonPatterns.some(p => p.test(text));
  }
  
  /**
   * Check for second person pronouns
   */
  _containsSecondPerson(text) {
    return this.secondPersonPatterns.some(p => p.test(text));
  }
  
  /**
   * Extract named entities (simple heuristic)
   */
  _extractEntities(text) {
    const entities = [];
    
    // Find capitalized words (not at sentence start)
    const words = text.split(/\s+/);
    
    for (let i = 1; i < words.length; i++) {
      const word = words[i].replace(/[^\w]/g, '');
      if (word.length > 2 && word[0] === word[0].toUpperCase()) {
        entities.push(word.toLowerCase());
      }
    }
    
    return entities;
  }
}

module.exports = SubjectExtractor;
