/**
 * CORRECTION PARSER
 * Parses correction statements to extract old/new values
 * ~75 lines (Target: <80)
 */

class CorrectionParser {
  constructor() {
    this.patterns = {
      // "I meant X" or "I meant X not Y"
      meant: /i meant (.+?)(?:\s+not\s+(.+?))?(?:\.|$)/i,
      
      // "Not X, Y" or "X should be Y"
      notComma: /not (.+?),\s*(.+?)(?:\.|$)/i,
      shouldBe: /(.+?)\s+should be\s+(.+?)(?:\.|$)/i,
      
      // "Actually it's X" or "Actually X"
      actually: /actually,?\s+(?:it'?s\s+)?(.+?)(?:\.|$)/i,
      
      // "Correction: X"
      explicit: /correction:\s*(.+?)(?:\.|$)/i
    };
  }
  
  /**
   * Parse correction statement
   */
  parse(message) {
    let match;
    
    // "I meant X not Y"
    if ((match = message.match(this.patterns.meant))) {
      return {
        newValue: match[1].trim(),
        oldValue: match[2] ? match[2].trim() : null,
        confidence: 0.9
      };
    }
    
    // "Not X, Y"
    if ((match = message.match(this.patterns.notComma))) {
      return {
        oldValue: match[1].trim(),
        newValue: match[2].trim(),
        confidence: 0.85
      };
    }
    
    // "X should be Y"
    if ((match = message.match(this.patterns.shouldBe))) {
      return {
        oldValue: match[1].trim(),
        newValue: match[2].trim(),
        confidence: 0.8
      };
    }
    
    // "Actually X"
    if ((match = message.match(this.patterns.actually))) {
      return {
        newValue: match[1].trim(),
        oldValue: null,
        confidence: 0.75
      };
    }
    
    // "Correction: X"
    if ((match = message.match(this.patterns.explicit))) {
      return {
        newValue: match[1].trim(),
        oldValue: null,
        confidence: 0.95
      };
    }
    
    // Fallback
    return {
      newValue: message.trim(),
      oldValue: null,
      confidence: 0.5
    };
  }
  
  /**
   * Normalize values for comparison
   */
  normalize(value) {
    return value.toLowerCase().trim().replace(/[^\w\s]/g, '');
  }
}

module.exports = CorrectionParser;
