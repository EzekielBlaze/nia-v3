/**
 * TOPIC EXTRACTOR
 * Extracts topics/concepts from text
 * ~85 lines (Target: <90)
 */

class TopicExtractor {
  constructor() {
    this.stopwords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these',
      'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which',
      'who', 'when', 'where', 'why', 'how', 'my', 'your', 'his', 'her', 'its'
    ]);
    
    // Common topics to recognize
    this.knownTopics = new Map([
      ['programming', ['code', 'coding', 'program', 'software', 'dev', 'developer']],
      ['rust', ['rust', 'rustlang', 'cargo']],
      ['python', ['python', 'py', 'pip']],
      ['javascript', ['javascript', 'js', 'node', 'nodejs']],
      ['memory_safety', ['memory', 'safety', 'safe', 'bug', 'bugs', 'error']],
      ['ai', ['ai', 'artificial', 'intelligence', 'ml', 'machine', 'learning']],
      ['ocean', ['ocean', 'sea', 'marine', 'water', 'aquatic']],
      ['whales', ['whale', 'whales', 'cetacean']],
      ['god', ['god', 'divine', 'deity', 'lord']],
      ['faith', ['faith', 'believe', 'belief', 'trust', 'religion']]
    ]);
  }
  
  /**
   * Extract topics from text
   */
  extract(text) {
    const topics = new Set();
    const lowerText = text.toLowerCase();
    
    // Check known topics
    for (const [topic, keywords] of this.knownTopics.entries()) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          topics.add(topic);
          break;
        }
      }
    }
    
    // Extract noun phrases (simple heuristic)
    const words = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !this.stopwords.has(w));
    
    // Add significant words as topics
    const wordFreq = new Map();
    for (const word of words) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
    
    // Add words mentioned multiple times or capitalized
    for (const [word, count] of wordFreq.entries()) {
      if (count > 1 || this._isProperNoun(word, text)) {
        topics.add(word);
      }
    }
    
    return Array.from(topics);
  }
  
  /**
   * Check if word is likely a proper noun
   */
  _isProperNoun(word, originalText) {
    // Check if word appears capitalized in original
    const capitalizedPattern = new RegExp(`\\b${word.charAt(0).toUpperCase()}${word.slice(1)}\\b`);
    return capitalizedPattern.test(originalText);
  }
}

module.exports = TopicExtractor;
