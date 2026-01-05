/**
 * CHAT HANDLER INTEGRATOR
 * Adds memory/correction detection to chat flow
 * ~130 lines (Target: <150)
 */

const { CommitParser, CorrectionParser, TopicExtractor, SubjectExtractor } = require('../parsers');
const { CorrectionDetector } = require('../correction');
const logger = require('../../../utils/logger');

class ChatHandlerIntegrator {
  constructor(daemon) {
    this.daemon = daemon;
    this.commitParser = new CommitParser();
    this.correctionParser = new CorrectionParser();
    this.topicExtractor = new TopicExtractor();
    this.subjectExtractor = new SubjectExtractor();
    this.correctionDetector = new CorrectionDetector();
  }
  
  /**
   * Process user message before sending to LLM
   * Returns: { shouldCommit, shouldCorrect, metadata }
   */
  processUserMessage(message) {
    const analysis = {
      shouldCommit: false,
      shouldCorrect: false,
      metadata: {},
      corrections: null
    };
    
    // Check for manual commit ("remember that...")
    const commit = this.commitParser.detect(message);
    if (commit.isCommit) {
      analysis.shouldCommit = true;
      const extracted = this.commitParser.extract(message);
      analysis.metadata.commitStatement = this.commitParser.clean(extracted.statement);
      analysis.metadata.trigger = extracted.trigger;
    }
    
    // Check for correction ("oops I meant...")
    const correction = this.correctionDetector.detect(message);
    if (correction.detected) {
      analysis.shouldCorrect = true;
      analysis.corrections = {
        type: correction.primaryType,
        confidence: correction.confidence,
        parsed: this.correctionParser.parse(message)
      };
    }
    
    // Extract topics and subjects for context
    analysis.metadata.topics = this.topicExtractor.extract(message);
    analysis.metadata.subjects = this.subjectExtractor.extract(message, 'user_message');
    
    return analysis;
  }
  
  /**
   * Process assistant response after LLM
   * Returns: { metadata }
   */
  processAssistantResponse(response, thinking = null) {
    const analysis = {
      metadata: {}
    };
    
    // Extract topics and subjects from response
    analysis.metadata.topics = this.topicExtractor.extract(response);
    analysis.metadata.subjects = this.subjectExtractor.extract(response, 'assistant_response');
    
    // If thinking available, extract from that too
    if (thinking) {
      const thinkingTopics = this.topicExtractor.extract(thinking);
      const thinkingSubjects = this.subjectExtractor.extract(thinking, 'assistant_response');
      
      // Merge with response topics/subjects
      analysis.metadata.topics = [...new Set([...analysis.metadata.topics, ...thinkingTopics])];
      analysis.metadata.subjects = [...new Set([...analysis.metadata.subjects, ...thinkingSubjects])];
    }
    
    return analysis;
  }
  
  /**
   * Build conversation object for belief extraction
   */
  buildConversationForExtraction(userMessage, assistantResponse, thinking = null) {
    return {
      userMessage,
      assistantResponse,
      thinking: thinking || null,
      timestamp: Date.now()
    };
  }
  
  /**
   * Determine if conversation should trigger belief extraction
   */
  shouldExtractBeliefs(userAnalysis, assistantAnalysis) {
    // Extract if:
    // 1. User message had substantive topics (not just greetings)
    // 2. Combined topics indicate meaningful conversation
    
    const totalTopics = new Set([
      ...userAnalysis.metadata.topics,
      ...assistantAnalysis.metadata.topics
    ]);
    
    const totalSubjects = new Set([
      ...userAnalysis.metadata.subjects,
      ...assistantAnalysis.metadata.subjects
    ]);
    
    // Need at least 2 topics or 3 subjects for extraction
    if (totalTopics.size >= 2 || totalSubjects.size >= 3) {
      return true;
    }
    
    // Or if manual commit requested
    if (userAnalysis.shouldCommit) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Suggest clarification questions if message is ambiguous
   */
  suggestClarification(message, recentBeliefs = []) {
    // Simple heuristic: too many pronouns without clear referents
    const pronouns = ['that', 'it', 'this', 'those', 'them'];
    const lowerMessage = message.toLowerCase();
    
    let pronounCount = 0;
    for (const pronoun of pronouns) {
      const regex = new RegExp(`\\b${pronoun}\\b`, 'gi');
      const matches = lowerMessage.match(regex);
      if (matches) pronounCount += matches.length;
    }
    
    // If 3+ pronouns and message is short, suggest clarification
    if (pronounCount >= 3 && message.split(/\s+/).length < 20) {
      return {
        shouldAsk: true,
        reason: 'ambiguous_reference',
        suggestion: `When you say "${pronouns.find(p => lowerMessage.includes(p))}", what specifically are you referring to?`
      };
    }
    
    return { shouldAsk: false };
  }
}

module.exports = ChatHandlerIntegrator;
