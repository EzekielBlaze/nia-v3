/**
 * COMMIT PARSER
 * Detects "remember that..." / manual memory commits
 * ~70 lines (Target: <80)
 */

class CommitParser {
  constructor() {
    this.commitPatterns = [
      /\bremember that\b/i,
      /\bremember this\b/i,
      /\bdon'?t forget\b/i,
      /\bkeep in mind\b/i,
      /\bfor future reference\b/i,
      /\bmake a note\b/i,
      /\bwrite this down\b/i,
      /\bimportant:\s*/i
    ];
  }
  
  /**
   * Detect if message contains commit intent
   */
  detect(message) {
    for (const pattern of this.commitPatterns) {
      if (pattern.test(message)) {
        return {
          isCommit: true,
          pattern: pattern.source,
          confidence: 0.9
        };
      }
    }
    
    return { isCommit: false };
  }
  
  /**
   * Extract the statement to remember
   */
  extract(message) {
    // Pattern: "remember that X" â†’ extract X
    const rememberPattern = /remember (?:that|this)\s+(.+?)(?:[.?!]|$)/i;
    const dontForgetPattern = /don'?t forget\s+(.+?)(?:[.?!]|$)/i;
    const importantPattern = /important:\s*(.+?)(?:[.?!]|$)/i;
    
    let match;
    
    if ((match = message.match(rememberPattern))) {
      return {
        statement: match[1].trim(),
        trigger: 'user_manual'
      };
    }
    
    if ((match = message.match(dontForgetPattern))) {
      return {
        statement: match[1].trim(),
        trigger: 'user_manual'
      };
    }
    
    if ((match = message.match(importantPattern))) {
      return {
        statement: match[1].trim(),
        trigger: 'user_manual'
      };
    }
    
    // Fallback: entire message
    return {
      statement: message.trim(),
      trigger: 'manual_button'
    };
  }
  
  /**
   * Clean statement for storage
   */
  clean(statement) {
    // Remove extra whitespace
    statement = statement.replace(/\s+/g, ' ').trim();
    
    // Remove trailing punctuation artifacts
    statement = statement.replace(/[,;]\s*$/, '');
    
    return statement;
  }
}

module.exports = CommitParser;
