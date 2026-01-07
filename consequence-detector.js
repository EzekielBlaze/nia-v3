/**
 * CONSEQUENCE DETECTOR
 * 
 * Analyzes user responses to detect salient consequences of Nia's actions.
 * Feeds experience-based belief formation.
 * 
 * DOES NOT replace fact extraction - runs alongside it.
 * 
 * Flow:
 *   Turn N: Nia does X (action)
 *   Turn N+1: User responds Y (consequence)
 *   → Detector: Was Y positive/negative/neutral toward X?
 *   → If salient: Form experience belief
 */

const logger = require('./utils/logger');

class ConsequenceDetector {
  constructor(options = {}) {
    this.minResponseLength = options.minResponseLength || 5;
    this.longResponseThreshold = options.longResponseThreshold || 100;
    this.shortResponseThreshold = options.shortResponseThreshold || 15;
    
    // Positive consequence patterns
    this.positivePatterns = [
      // Gratitude
      /\b(thanks?|ty|thx|thank\s*you)\b/i,
      /\b(appreciate|appreciated)\b/i,
      
      // Agreement/validation
      /\b(exactly|yes|yeah|yep|yup|mhm|right)\b/i,
      /\b(true|fair|good point|makes sense)\b/i,
      
      // Emotional positive
      /\b(lol|lmao|haha|hehe|rofl)\b/i,
      /\b(love|adore)\s+(it|that|this|you)/i,
      /\b(that'?s?\s*(so\s*)?(sweet|nice|cool|awesome|funny|cute|adorable))\b/i,
      
      // Engagement signals
      /\b(tell me more|go on|and then|what else)\b/i,
      /\b(oh really|no way|wait what)\b/i,
      
      // Emojis (positive)
      /[😂😊😄😁🥰❤️💕😍🤣💜💙😸]/,
      
      // Relief/comfort
      /\b(helps?|helped|better|relieved)\b/i,
      /\b(needed (to hear )?that|means a lot)\b/i,
    ];
    
    // Negative consequence patterns
    this.negativePatterns = [
      // Rejection
      /\b(no|nope|nah|not really|whatever)\b/i,
      /\b(stop|don'?t|didn'?t ask|drop it)\b/i,
      
      // Dismissal
      /\b(ok\.?|okay\.?|k\.?|sure\.?)$/i,  // Bare "ok" with nothing else
      /\b(i guess|if you say so|whatever you say)\b/i,
      
      // Correction
      /\b(actually|well actually|that'?s not)\b/i,
      /\b(wrong|incorrect|not what i)\b/i,
      
      // Discomfort
      /\b(weird|awkward|uncomfortable|cringe)\b/i,
      /\b(too (much|far|personal))\b/i,
      
      // Withdrawal signals
      /^\.+$/,                    // Just dots
      /^(meh|eh|idk|dunno)\.?$/i, // Minimal engagement
      
      // Emojis (negative)
      /[😒😕😐🙄😑😬]/,
      
      // Topic deflection
      /\b(anyway|moving on|let'?s talk about)\b/i,
    ];
    
    // Neutral/skip patterns (don't form beliefs)
    this.neutralPatterns = [
      /\b(how about you|what about you|and you)\b/i,  // Reciprocal question
      /^(hi|hey|hello|morning|night)/i,              // Greetings
    ];
    
    // Action classification patterns (what did Nia do?)
    this.actionPatterns = {
      asked_question: /\?$/,
      showed_empathy: /\b(sorry|understand|must be|sounds (hard|tough|rough))\b/i,
      was_playful: /\b(hehe|haha|\*.*\*|~)\b/i,
      gave_advice: /\b(maybe|could|should|try|consider|suggest)\b/i,
      shared_feeling: /\b(i feel|i think|i'?m (happy|sad|excited|worried))\b/i,
      showed_curiosity: /\b(curious|wonder|interesting|tell me)\b/i,
      offered_support: /\b(here for you|if you need|let me know|i'?m here)\b/i,
      changed_topic: /\b(anyway|speaking of|by the way|oh also)\b/i,
      was_enthusiastic: /!|😊|💕|❤️|\b(love|amazing|awesome)\b/i,
    };
  }
  
  /**
   * Analyze consequence of Nia's action
   * 
   * @param {string} niaMessage - What Nia said (Turn N)
   * @param {string} userResponse - How user responded (Turn N+1)
   * @param {object} context - Optional context (topics, history)
   * @returns {object} { salient, valence, confidence, action, belief }
   */
  analyze(niaMessage, userResponse, context = {}) {
    if (!niaMessage || !userResponse) {
      return { salient: false, reason: 'Missing messages' };
    }
    
    const response = userResponse.trim();
    
    // Skip very short responses that might be continuation
    if (response.length < this.minResponseLength) {
      return { salient: false, reason: 'Response too short' };
    }
    
    // Check for neutral patterns first (skip these)
    for (const pattern of this.neutralPatterns) {
      if (pattern.test(response)) {
        return { salient: false, reason: 'Neutral pattern (reciprocal/greeting)' };
      }
    }
    
    // Classify Nia's action
    const action = this._classifyAction(niaMessage);
    
    // Score positive and negative signals
    const positiveScore = this._scorePatterns(response, this.positivePatterns);
    const negativeScore = this._scorePatterns(response, this.negativePatterns);
    
    // Length-based signals
    const lengthSignal = this._analyzeLengthSignal(niaMessage, response);
    
    // Calculate final valence
    let valence = 'neutral';
    let confidence = 0;
    let signals = [];
    
    // Positive determination
    if (positiveScore > 0) {
      signals.push(`positive_patterns(${positiveScore})`);
    }
    if (lengthSignal === 'engaged') {
      signals.push('long_engaged_response');
      positiveScore + 1;
    }
    
    // Negative determination
    if (negativeScore > 0) {
      signals.push(`negative_patterns(${negativeScore})`);
    }
    if (lengthSignal === 'withdrawn') {
      signals.push('short_withdrawn_response');
    }
    
    // Determine valence
    const netScore = positiveScore - negativeScore + 
                     (lengthSignal === 'engaged' ? 1 : 0) +
                     (lengthSignal === 'withdrawn' ? -1 : 0);
    
    if (netScore >= 1) {
      valence = 'positive';
      confidence = Math.min(50 + (netScore * 15), 90);
    } else if (netScore <= -1) {
      valence = 'negative';
      confidence = Math.min(50 + (Math.abs(netScore) * 15), 90);
    } else {
      // Not salient enough
      return { 
        salient: false, 
        reason: 'No clear positive or negative signal',
        scores: { positive: positiveScore, negative: negativeScore, length: lengthSignal }
      };
    }
    
    // Build experience belief
    const belief = this._formExperienceBelief(action, valence, niaMessage, response, context);
    
    logger.debug(`Consequence detected: ${valence} (confidence: ${confidence})`);
    logger.debug(`  Action: ${action.primary}`);
    logger.debug(`  Signals: ${signals.join(', ')}`);
    
    return {
      salient: true,
      valence,
      confidence,
      action,
      signals,
      belief
    };
  }
  
  /**
   * Score message against pattern list
   */
  _scorePatterns(message, patterns) {
    let score = 0;
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        score++;
      }
    }
    return score;
  }
  
  /**
   * Classify what action Nia took
   */
  _classifyAction(niaMessage) {
    const actions = [];
    
    for (const [action, pattern] of Object.entries(this.actionPatterns)) {
      if (pattern.test(niaMessage)) {
        actions.push(action);
      }
    }
    
    return {
      primary: actions[0] || 'responded',
      all: actions.length > 0 ? actions : ['responded']
    };
  }
  
  /**
   * Analyze response length as engagement signal
   */
  _analyzeLengthSignal(niaMessage, response) {
    const niaAskedQuestion = /\?/.test(niaMessage);
    
    // Long response = engaged
    if (response.length > this.longResponseThreshold) {
      return 'engaged';
    }
    
    // Very short response to a question = withdrawn
    if (niaAskedQuestion && response.length < this.shortResponseThreshold) {
      // Check it's not just "yes/no" to a yes/no question
      if (!/^(yes|no|yeah|nope|maybe)\.?$/i.test(response)) {
        return 'withdrawn';
      }
    }
    
    return 'normal';
  }
  
  /**
   * Form an experience belief from action + consequence
   */
  _formExperienceBelief(action, valence, niaMessage, userResponse, context) {
    const actionVerb = this._actionToVerb(action.primary);
    const outcome = valence === 'positive' ? 'positive engagement' : 'withdrawal or discomfort';
    
    // Build belief statement
    let statement;
    
    if (valence === 'positive') {
      statement = `${actionVerb} leads to ${outcome} from Blaze`;
    } else {
      statement = `${actionVerb} can lead to ${outcome} from Blaze`;
    }
    
    // Add context if available
    const contextNote = context.topic ? ` (context: ${context.topic})` : '';
    
    return {
      statement,
      type: 'experience',
      subject: 'self',  // About Nia's behavior
      validation_score: valence === 'positive' ? 70 : 65,  // Slightly lower for negative
      formation_reasoning: `Observed: After I ${action.primary.replace(/_/g, ' ')}, Blaze responded ${valence}ly. Response: "${userResponse.substring(0, 80)}${userResponse.length > 80 ? '...' : ''}"${contextNote}`,
      experience_data: {
        action: action.primary,
        valence,
        nia_excerpt: niaMessage.substring(0, 100),
        user_excerpt: userResponse.substring(0, 100)
      }
    };
  }
  
  /**
   * Convert action key to readable verb phrase
   */
  _actionToVerb(action) {
    const verbMap = {
      asked_question: 'Asking questions',
      showed_empathy: 'Showing empathy',
      was_playful: 'Being playful',
      gave_advice: 'Giving advice',
      shared_feeling: 'Sharing my feelings',
      showed_curiosity: 'Showing curiosity',
      offered_support: 'Offering support',
      changed_topic: 'Changing topics',
      was_enthusiastic: 'Being enthusiastic',
      responded: 'Responding normally'
    };
    return verbMap[action] || 'Responding';
  }
  
  /**
   * Quick check if response seems salient (for gating)
   */
  quickCheck(userResponse) {
    if (!userResponse || userResponse.length < this.minResponseLength) {
      return false;
    }
    
    // Any strong signals?
    const hasPositive = this.positivePatterns.some(p => p.test(userResponse));
    const hasNegative = this.negativePatterns.some(p => p.test(userResponse));
    const isLong = userResponse.length > this.longResponseThreshold;
    const isVeryShort = userResponse.length < 10;
    
    return hasPositive || hasNegative || isLong || isVeryShort;
  }
}

module.exports = ConsequenceDetector;
