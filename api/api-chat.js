/**
 * API - CHAT WITH MEMORY
 * Handles chat with memory commit/correction detection
 * ~80 lines (Target: <90)
 */

const logger = require('../utils/logger');

class ChatAPI {
  constructor(daemon) {
    this.daemon = daemon;
  }
  
  /**
   * Register IPC handlers for chat
   */
  register(ipcServer) {
    // Enhanced chat with memory/correction handling
    ipcServer.registerHandler('chat_enhanced', async (data) => {
      return await this.handleChatEnhanced(data.message, data.context || {});
    });
  }
  
  /**
   * Handle enhanced chat with memory integration
   */
  async handleChatEnhanced(message, context = {}) {
    try {
      // Analyze user message
      const analysis = this.daemon.chatHandlerIntegrator.processUserMessage(message);
      
      // Handle manual commit ("remember that...")
      if (analysis.shouldCommit) {
        const memory = await this.daemon.memoryIntegrator.storeMemory(
          analysis.metadata.commitStatement,
          {
            type: 'fact',
            trigger: analysis.metadata.trigger,
            topics: analysis.metadata.topics,
            subjects: analysis.metadata.subjects
          }
        );
        
        return {
          success: true,
          type: 'memory_commit',
          response: "Got it - I'll remember that!",
          memory: {
            id: memory.id,
            statement: memory.statement
          }
        };
      }
      
      // Handle correction ("oops I meant...")
      if (analysis.shouldCorrect) {
        const result = await this.daemon.correctionIntegrator.handleCorrection(
          analysis.corrections
        );
        
        return {
          success: true,
          type: 'correction',
          response: result.message,
          correction: {
            corrected: result.corrected,
            distressLevel: result.distressLevel,
            exempt: result.exempt
          }
        };
      }
      
      // Regular chat - use existing handleChat
      const response = await this.daemon.handleChat(message, context);
      
      return {
        success: true,
        type: 'chat',
        response: response.response,
        thinking: response.thinking
      };
      
    } catch (err) {
      logger.error(`Enhanced chat error: ${err.message}`);
      return {
        success: false,
        error: err.message
      };
    }
  }
}

module.exports = ChatAPI;
