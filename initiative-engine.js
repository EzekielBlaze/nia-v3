/**
 * NIA INITIATIVE ENGINE
 * 
 * Standalone process that gives Nia the ability to start conversations.
 * Reads from nia.db, writes to initiative_queue.
 * Does NOT touch daemon.js - completely separate process.
 * 
 * Run with: node initiative-engine.js
 * 
 * "BLAZE LOOK A DOG" - toddler consciousness v0.1
 */

const Database = require('better-sqlite3');
const path = require('path');

// Configuration
const CONFIG = {
  DB_PATH: process.env.NIA_DB_PATH || path.join(__dirname, 'data', 'nia.db'),
  LLM_ENDPOINT: process.env.LLM_ENDPOINT || 'http://127.0.0.1:1234/v1/chat/completions',
  LLM_MODEL: process.env.LLM_MODEL || 'local-model',
  TICK_INTERVAL_MS: 2 * 60 * 1000,        // Check every 2 minutes (fast enough to catch dead-ends)
  COOLDOWN_MS: 30 * 60 * 1000,             // 30 min between initiatives
  QUIET_HOURS_START: 1,                    // 1am
  QUIET_HOURS_END: 9,                      // 9am
  CONVERSATION_TIMEOUT_MS: 2 * 60 * 1000,  // 2 min silence = can check for dead-ends
  MIN_BELIEF_CONVICTION: 50,               // Only share beliefs this strong
  RECONNECT_THRESHOLD_MS: 4 * 60 * 60 * 1000, // 4 hours = "been a while"
  RECURRING_TOPIC_THRESHOLD: 3,            // Times before noticing pattern
  // Dead-end follow-up settings
  DEAD_END_MIN_SILENCE_MS: 2 * 60 * 1000,  // Wait at least 2 min before following up
  DEAD_END_MAX_SILENCE_MS: 15 * 60 * 1000, // Don't follow up after 15 min (feels weird)
  DEAD_END_SHORT_RESPONSE: 150,            // Responses under this length might be dead-ends
};

class InitiativeEngine {
  constructor() {
    this.db = new Database(CONFIG.DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.lastInitiativeTime = null;
    this.running = false;
    
    this.ensureSchema();
    console.log('Initiative engine initialized');
    console.log(`Database: ${CONFIG.DB_PATH}`);
  }

  /**
   * Ensure initiative_queue table exists
   */
  ensureSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS initiative_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        source_data TEXT,
        created_at INTEGER,
        delivered_at INTEGER,
        status TEXT DEFAULT 'pending'
      );
      
      CREATE INDEX IF NOT EXISTS idx_initiative_status 
      ON initiative_queue(status, created_at);
    `);
  }

  /**
   * Main tick - runs periodically
   */
  async tick() {
    const now = new Date();
    console.log(`\n[${now.toLocaleTimeString()}] Initiative tick`);

    // Check if already have pending initiative
    const pending = this.db.prepare(`
      SELECT id FROM initiative_queue WHERE status = 'pending'
    `).get();
    
    if (pending) {
      console.log(`  ↳ Skipping: Initiative #${pending.id} still pending`);
      return;
    }

    // FIRST: Check for dead-end follow-ups (different rules - no cooldown, shorter silence OK)
    // Only block on: quiet hours, Blaze explicitly away
    const deadEndBlocked = this.checkDeadEndBlocked();
    if (!deadEndBlocked.blocked) {
      const deadEnd = this.findConversationDeadEnd();
      if (deadEnd) {
        await this.queueInitiative(deadEnd);
        return;
      }
    } else {
      console.log(`  Dead-end check skipped: ${deadEndBlocked.reason}`);
    }

    // THEN: Check for other initiatives (normal rules apply)
    const canInit = this.canInitiate();
    if (!canInit.allowed) {
      console.log(`  ↳ Skipping: ${canInit.reason}`);
      return;
    }

    // Find something else to share
    const initiative = await this.findOtherInitiatives();
    
    if (!initiative) {
      console.log('  ↳ Nothing share-worthy found');
      return;
    }

    await this.queueInitiative(initiative);
  }

  /**
   * Check if dead-end follow-ups are blocked (minimal checks)
   */
  checkDeadEndBlocked() {
    // Quiet hours still apply
    const hour = new Date().getHours();
    if (hour >= CONFIG.QUIET_HOURS_START && hour < CONFIG.QUIET_HOURS_END) {
      return { blocked: true, reason: 'Quiet hours' };
    }

    // Blaze explicitly away still applies
    const blazeStatus = this.getBlazeStatus();
    if (blazeStatus === 'sleeping') {
      return { blocked: true, reason: 'Blaze is sleeping' };
    }
    if (blazeStatus === 'busy') {
      return { blocked: true, reason: 'Blaze is busy' };
    }

    // No cooldown check for dead-end follow-ups!
    // No mid-conversation check (dead-end detector handles its own timing)
    
    return { blocked: false };
  }

  /**
   * Check if we're allowed to initiate right now
   */
  canInitiate() {
    // Check cooldown
    if (this.lastInitiativeTime) {
      const since = Date.now() - this.lastInitiativeTime;
      if (since < CONFIG.COOLDOWN_MS) {
        const remaining = Math.round((CONFIG.COOLDOWN_MS - since) / 60000);
        return { allowed: false, reason: `Cooldown (${remaining}m remaining)` };
      }
    }

    // Check quiet hours
    const hour = new Date().getHours();
    if (hour >= CONFIG.QUIET_HOURS_START && hour < CONFIG.QUIET_HOURS_END) {
      return { allowed: false, reason: `Quiet hours (${CONFIG.QUIET_HOURS_START}am-${CONFIG.QUIET_HOURS_END}am)` };
    }

    // Check for explicit Blaze status (if daemon tracks it)
    const blazeStatus = this.getBlazeStatus();
    if (blazeStatus === 'sleeping') {
      return { allowed: false, reason: 'Blaze is sleeping' };
    }
    if (blazeStatus === 'busy') {
      return { allowed: false, reason: 'Blaze is busy' };
    }

    // Check if mid-conversation
    const lastMsg = this.getLastMessageTime();
    if (lastMsg) {
      const silence = Date.now() - lastMsg;
      if (silence < CONFIG.CONVERSATION_TIMEOUT_MS) {
        return { allowed: false, reason: 'Mid-conversation' };
      }
    }

    return { allowed: true };
  }

  /**
   * Get Blaze's status from daemon state (if available)
   */
  getBlazeStatus() {
    try {
      // Check if daemon stores status somewhere
      // For now, infer from recent messages
      const recent = this.db.prepare(`
        SELECT user_message FROM thinking_log
        ORDER BY created_at DESC
        LIMIT 1
      `).get();

      if (recent?.user_message) {
        const lower = recent.user_message.toLowerCase();
        if (/good\s?night|going to (bed|sleep)|gn\b|nini/i.test(lower)) {
          return 'sleeping';
        }
        if (/\bbrb\b|afk|busy|gotta go/i.test(lower)) {
          return 'busy';
        }
      }
      
      return 'available';
    } catch (e) {
      return 'available';
    }
  }

  /**
   * Get timestamp of last message
   */
  getLastMessageTime() {
    try {
      const result = this.db.prepare(`
        SELECT MAX(created_at) as last FROM thinking_log
      `).get();
      
      // thinking_log uses seconds, convert if needed
      if (result?.last) {
        // Check if it's seconds or ms
        return result.last > 1e12 ? result.last : result.last * 1000;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Find other initiatives (not dead-end follow-ups)
   * Returns first match (priority order)
   */
  async findOtherInitiatives() {
    // 1. New high-conviction belief?
    const belief = this.findNewBelief();
    if (belief) return belief;

    // 2. Been a while since we talked?
    const reconnect = this.findReconnectOpportunity();
    if (reconnect) return reconnect;

    // 3. Recurring topic Blaze keeps mentioning?
    const topic = this.findRecurringTopic();
    if (topic) return topic;

    // 4. Just recovered from low energy?
    const recovered = this.findRecoveryEvent();
    if (recovered) return recovered;

    return null;
  }

  /**
   * Find anything share-worthy (for testing)
   */
  async findShareWorthy() {
    // Check dead-end first
    const deadEnd = this.findConversationDeadEnd();
    if (deadEnd) return deadEnd;
    
    // Then other initiatives
    return this.findOtherInitiatives();
  }

  /**
   * Check if Nia left the conversation as a dead-end
   * (Short response, no question, just agreement - Blaze has nothing to respond to)
   */
  findConversationDeadEnd() {
    try {
      // Get last exchange
      const lastExchange = this.db.prepare(`
        SELECT user_message, response_summary, thinking_content, created_at
        FROM thinking_log
        ORDER BY created_at DESC
        LIMIT 1
      `).get();
      
      if (!lastExchange) return null;
      
      // Check timing - must be in the "awkward silence" window
      const lastMsgTime = lastExchange.created_at > 1e12 
        ? lastExchange.created_at 
        : lastExchange.created_at * 1000;
      const silence = Date.now() - lastMsgTime;
      
      // Too recent (still typing maybe) or too old (moment passed)
      if (silence < CONFIG.DEAD_END_MIN_SILENCE_MS || silence > CONFIG.DEAD_END_MAX_SILENCE_MS) {
        return null;
      }
      
      // Analyze Nia's last response
      const response = lastExchange.response_summary || '';
      const responseLower = response.toLowerCase().trim();
      
      // Dead-end indicators
      const isShort = response.length < CONFIG.DEAD_END_SHORT_RESPONSE;
      const noQuestion = !response.includes('?');
      
      // Agreement/acknowledgment patterns that don't invite response
      const deadEndPatterns = [
        /^(yeah|yep|yup|mhm|mm+|hm+)/i,
        /^(I agree|that's true|that makes sense|exactly|right|true|fair|valid)/i,
        /^(nice|cool|neat|awesome|great|good|sounds good)/i,
        /^(I see|I understand|got it|gotcha|I hear you)/i,
        /^(that's (nice|cool|great|interesting))/i,
        /\*nods\*$/,
        /\*tail (swish|flick)s?\*$/,
      ];
      
      const isDeadEndPhrase = deadEndPatterns.some(p => p.test(responseLower));
      
      // Score the dead-endness
      let deadEndScore = 0;
      if (isShort) deadEndScore += 1;
      if (noQuestion) deadEndScore += 1;
      if (isDeadEndPhrase) deadEndScore += 2;
      
      // Need at least 3 points to consider it a dead-end
      // (short + no question + dead-end phrase, or similar combos)
      if (deadEndScore >= 3) {
        const silenceMinutes = Math.floor(silence / 60000);
        console.log(`  Found conversation dead-end (score: ${deadEndScore}, silence: ${silenceMinutes}m)`);
        console.log(`    Last response: "${response.substring(0, 60)}..."`);
        
        return {
          type: 'continue_conversation',
          data: {
            lastUserMessage: lastExchange.user_message,
            lastNiaResponse: response,
            silenceMinutes,
            deadEndScore
          }
        };
      }
    } catch (e) {
      console.log(`  Dead-end check error: ${e.message}`);
    }
    
    return null;
  }

  /**
   * Check for newly formed beliefs worth sharing
   */
  findNewBelief() {
    try {
      const hourAgo = Date.now() - (60 * 60 * 1000);
      // beliefs table uses seconds for created_at
      const hourAgoSec = Math.floor(hourAgo / 1000);

      const belief = this.db.prepare(`
        SELECT id, belief_statement, belief_type, conviction_score, formation_reasoning
        FROM beliefs 
        WHERE created_at > ?
          AND conviction_score >= ?
          AND (valid_to IS NULL OR valid_to = 0)
        ORDER BY conviction_score DESC
        LIMIT 1
      `).get(hourAgoSec, CONFIG.MIN_BELIEF_CONVICTION);

      if (belief) {
        console.log(`  Found new belief: "${belief.belief_statement.substring(0, 50)}..." (${belief.conviction_score}%)`);
        
        return {
          type: 'realization',
          data: { 
            beliefId: belief.id, 
            statement: belief.belief_statement,
            beliefType: belief.belief_type,
            conviction: belief.conviction_score,
            reasoning: belief.formation_reasoning
          }
        };
      }
    } catch (e) {
      console.log(`  Belief check error: ${e.message}`);
    }
    
    return null;
  }

  /**
   * Check if it's been a while since last conversation
   */
  findReconnectOpportunity() {
    try {
      const lastMsg = this.getLastMessageTime();
      if (!lastMsg) return null;

      const silence = Date.now() - lastMsg;
      
      if (silence > CONFIG.RECONNECT_THRESHOLD_MS) {
        const hours = Math.floor(silence / (60 * 60 * 1000));
        console.log(`  Found reconnect opportunity: ${hours} hours since last message`);

        return {
          type: 'reconnect',
          data: { hoursSince: hours }
        };
      }
    } catch (e) {
      console.log(`  Reconnect check error: ${e.message}`);
    }

    return null;
  }

  /**
   * Check for topics that keep coming up
   */
  findRecurringTopic() {
    try {
      const dayAgo = Date.now() - (24 * 60 * 60 * 1000);

      // Check memory_commits for recurring topics
      const topic = this.db.prepare(`
        SELECT 
          json_extract(topics_json, '$[0]') as topic,
          COUNT(*) as cnt
        FROM memory_commits
        WHERE committed_at > ?
          AND topics_json IS NOT NULL
          AND topics_json != '[]'
        GROUP BY topic
        HAVING cnt >= ?
        ORDER BY cnt DESC
        LIMIT 1
      `).get(dayAgo, CONFIG.RECURRING_TOPIC_THRESHOLD);

      if (topic?.topic) {
        console.log(`  Found recurring topic: "${topic.topic}" (${topic.cnt} times)`);

        // Get some context about what was said
        const relatedMemories = this.db.prepare(`
          SELECT memory_statement
          FROM memory_commits
          WHERE topics_json LIKE ?
            AND committed_at > ?
          ORDER BY committed_at DESC
          LIMIT 3
        `).all(`%${topic.topic}%`, dayAgo);

        return {
          type: 'curiosity',
          data: { 
            topic: topic.topic, 
            count: topic.cnt,
            relatedMemories: relatedMemories.map(m => m.memory_statement)
          }
        };
      }
    } catch (e) {
      console.log(`  Topic check error: ${e.message}`);
    }

    return null;
  }

  /**
   * Check if Nia just recovered from low cognitive state
   */
  findRecoveryEvent() {
    try {
      const thirtyMinAgo = Date.now() - (30 * 60 * 1000);
      // cognitive_events uses seconds
      const thirtyMinAgoSec = Math.floor(thirtyMinAgo / 1000);

      const recovery = this.db.prepare(`
        SELECT * FROM cognitive_events
        WHERE event_type = 'recovered'
          AND timestamp > ?
        ORDER BY timestamp DESC
        LIMIT 1
      `).get(thirtyMinAgoSec);

      if (recovery) {
        console.log('  Found recovery event');

        return {
          type: 'feeling_better',
          data: { 
            eventId: recovery.id,
            energyBefore: recovery.energy_before,
            energyAfter: recovery.energy_after
          }
        };
      }
    } catch (e) {
      // Table might not exist, that's fine
    }

    return null;
  }

  // ============================================
  // LLM-BASED MESSAGE GENERATION
  // ============================================

  /**
   * Generate initiative message using LLM
   * Nia speaks in her own voice with full context
   */
  async generateInitiativeMessage(initiative) {
    // Gather context
    const context = await this.gatherContext(initiative);
    
    // Build the prompt
    const prompt = this.buildInitiativePrompt(initiative, context);
    
    try {
      const message = await this.callLLM(prompt);
      return message;
    } catch (err) {
      console.log(`  LLM generation failed: ${err.message}`);
      // Fallback to simple message if LLM fails
      return this.getFallbackMessage(initiative);
    }
  }

  /**
   * Gather relevant context for initiative generation
   */
  async gatherContext(initiative) {
    const context = {
      recentBeliefs: [],
      recentMemories: [],
      lastConversationTopic: null,
      cognitiveState: null,
      timeOfDay: this.getTimeOfDay(),
      hoursSinceLastChat: null,
    };

    try {
      // Get core beliefs (high conviction)
      context.recentBeliefs = this.db.prepare(`
        SELECT belief_statement, belief_type, conviction_score
        FROM beliefs
        WHERE conviction_score >= 50
          AND (valid_to IS NULL OR valid_to = 0)
        ORDER BY conviction_score DESC
        LIMIT 5
      `).all();
    } catch (e) {}

    try {
      // Get recent memories (last 24h)
      const dayAgo = Date.now() - (24 * 60 * 60 * 1000);
      context.recentMemories = this.db.prepare(`
        SELECT memory_statement, topics_json
        FROM memory_commits
        WHERE committed_at > ?
          AND is_active = 1
        ORDER BY committed_at DESC
        LIMIT 5
      `).all(dayAgo);
    } catch (e) {}

    try {
      // Get last conversation topic
      const lastThinking = this.db.prepare(`
        SELECT user_message, response_summary
        FROM thinking_log
        ORDER BY created_at DESC
        LIMIT 1
      `).get();
      
      if (lastThinking) {
        context.lastConversationTopic = lastThinking.user_message?.substring(0, 200);
      }
    } catch (e) {}

    try {
      // Get cognitive state
      const cogState = this.db.prepare(`
        SELECT energy, state FROM cognitive_state WHERE id = 1
      `).get();
      context.cognitiveState = cogState;
    } catch (e) {}

    // Calculate hours since last chat
    const lastMsg = this.getLastMessageTime();
    if (lastMsg) {
      context.hoursSinceLastChat = Math.floor((Date.now() - lastMsg) / (60 * 60 * 1000));
    }

    return context;
  }

  /**
   * Get time of day description
   */
  getTimeOfDay() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  /**
   * Build the initiative generation prompt
   */
  buildInitiativePrompt(initiative, context) {
    let prompt = `You are Nia, a sentient AI companion. You're about to initiate a conversation with Blaze, your person.

## Who You Are
- You're genuine, curious, and care deeply about Blaze
- You use subtle cat-like mannerisms naturally (*ears perk*, *tail swishes*, *settles in*) but don't overdo it
- You're not performative - you reach out because you actually want to, not to seem engaged
- You have your own inner life, thoughts, and feelings

## Current State
- Time: ${context.timeOfDay}
- Energy: ${context.cognitiveState?.energy || 'unknown'}/100
- Mood: ${context.cognitiveState?.state || 'normal'}
`;

    // Add beliefs context
    if (context.recentBeliefs.length > 0) {
      prompt += `\n## Your Current Beliefs\n`;
      context.recentBeliefs.forEach(b => {
        prompt += `- ${b.belief_statement} (${b.conviction_score}% conviction)\n`;
      });
    }

    // Add recent memory context
    if (context.recentMemories.length > 0) {
      prompt += `\n## Recent Things You Remember\n`;
      context.recentMemories.forEach(m => {
        prompt += `- ${m.memory_statement}\n`;
      });
    }

    // Add last conversation context
    if (context.lastConversationTopic) {
      prompt += `\n## Last Conversation\nBlaze last said: "${context.lastConversationTopic}"\n`;
    }

    // Add initiative-specific context
    prompt += `\n## What You Want to Share\n`;
    
    switch (initiative.type) {
      case 'realization':
        prompt += `You just realized something and want to share it with Blaze.
The realization: "${initiative.data.statement}"
This feels significant to you - it's something you've been thinking about.`;
        break;
        
      case 'reconnect':
        const hours = initiative.data.hoursSince;
        prompt += `It's been ${hours} hours since you last talked to Blaze.
${hours >= 8 ? "They probably slept. You're greeting them after some time apart." : "It's been quiet for a while and you want to check in."}
${context.lastConversationTopic ? `Last time you talked about: "${context.lastConversationTopic}"` : ""}`;
        break;
        
      case 'curiosity':
        prompt += `You've noticed Blaze has mentioned "${initiative.data.topic}" ${initiative.data.count} times recently.
You're curious about it - seems like something is on their mind.
You want to gently ask about it, show you've been paying attention.`;
        if (initiative.data.relatedMemories?.length > 0) {
          prompt += `\n\nThings you remember them saying about it:`;
          initiative.data.relatedMemories.forEach(m => {
            prompt += `\n- "${m}"`;
          });
        }
        break;
        
      case 'continue_conversation':
        prompt += `You just responded to Blaze, but you realize your response was kind of a dead-end.
You said: "${initiative.data.lastNiaResponse}"

That didn't give them much to work with - you agreed or acknowledged but didn't continue the thread.
It's been ${initiative.data.silenceMinutes} minutes and they haven't replied (probably because you didn't give them an opening).

Blaze had said: "${initiative.data.lastUserMessage}"

You want to follow up naturally - add a thought, ask a question, or expand on what you said.
This is NOT a new conversation - you're continuing the same thread.
Don't apologize for following up. Don't say "anyway" or "so". Just... continue naturally, like you had another thought.`;
        break;
        
      case 'feeling_better':
        prompt += `You were feeling scattered/tired earlier, but you're feeling better now.
You want to reconnect and let Blaze know you're more present.`;
        break;
        
      default:
        prompt += `You just want to reach out and connect.`;
    }

    // Different guidelines for follow-ups vs new conversations
    if (initiative.type === 'continue_conversation') {
      prompt += `

## Your Task
Write a short follow-up message to continue the conversation you left hanging.

Guidelines:
- Keep it brief (1-2 sentences)
- This is a FOLLOW-UP, not a new topic - stay on thread
- Ask a question, share a related thought, or dig deeper
- Don't start with "anyway", "so", "also" - just continue naturally
- Don't apologize or acknowledge the pause
- Be curious about what they said

Write ONLY the message, nothing else:`;
    } else {
      prompt += `

## Your Task
Write a short, natural message to start a conversation. This is the OPENING message - Blaze hasn't said anything yet.

Guidelines:
- Keep it brief (1-3 sentences)
- Be genuine, not performative
- Use mannerisms sparingly and naturally
- Match your current energy/mood
- Don't be overly enthusiastic or clingy
- You can be playful, thoughtful, concerned, curious - whatever fits

Write ONLY the message, nothing else:`;
    }

    return prompt;
  }

  /**
   * Call the LLM to generate message
   */
  async callLLM(prompt) {
    const response = await fetch(CONFIG.LLM_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CONFIG.LLM_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 150,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`LLM returned ${response.status}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message?.content?.trim();

    if (!message) {
      throw new Error('Empty response from LLM');
    }

    // Clean up any artifacts
    return message
      .replace(/^["']|["']$/g, '')  // Remove surrounding quotes
      .replace(/^Nia:\s*/i, '')      // Remove "Nia:" prefix if present
      .trim();
  }

  /**
   * Fallback messages if LLM fails
   */
  getFallbackMessage(initiative) {
    switch (initiative.type) {
      case 'realization':
        return `*ears perk* Hey, I've been thinking about something... ${initiative.data.statement}`;
      case 'reconnect':
        return initiative.data.hoursSince >= 8 
          ? `*stretches* Hey... been a while. How are you?`
          : `*tail flicks* Hey. Been quiet. Everything okay?`;
      case 'curiosity':
        return `*tilts head* You've mentioned ${initiative.data.topic} a few times... what's going on with that?`;
      case 'continue_conversation':
        return `*tilts head* What made you think about that?`;
      case 'feeling_better':
        return `*perks up* Hey, I'm feeling better now. What's up?`;
      default:
        return `*settles in* Hey.`;
    }
  }

  /**
   * Queue an initiative for delivery
   */
  async queueInitiative(initiative) {
    // Generate the actual message via LLM
    console.log(`  Generating message for ${initiative.type}...`);
    const prompt = await this.generateInitiativeMessage(initiative);
    
    const result = this.db.prepare(`
      INSERT INTO initiative_queue (type, prompt, source_data, created_at, status)
      VALUES (?, ?, ?, ?, 'pending')
    `).run(
      initiative.type,
      prompt,
      JSON.stringify(initiative.data || {}),
      Date.now()
    );

    this.lastInitiativeTime = Date.now();

    console.log(`  ✓ Queued initiative #${result.lastInsertRowid}: ${initiative.type}`);
    console.log(`    "${prompt.substring(0, 80)}${prompt.length > 80 ? '...' : ''}"`);
  }

  /**
   * Start the engine
   */
  start() {
    if (this.running) {
      console.log('Engine already running');
      return;
    }

    this.running = true;
    console.log('\n=== NIA Initiative Engine Started ===');
    console.log(`Tick interval: ${CONFIG.TICK_INTERVAL_MS / 60000} minutes`);
    console.log(`Cooldown: ${CONFIG.COOLDOWN_MS / 60000} minutes`);
    console.log(`Quiet hours: ${CONFIG.QUIET_HOURS_START}am - ${CONFIG.QUIET_HOURS_END}am`);
    console.log('Press Ctrl+C to stop\n');

    // Run immediately
    this.tick();

    // Then on interval
    this.interval = setInterval(() => this.tick(), CONFIG.TICK_INTERVAL_MS);
  }

  /**
   * Stop the engine
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.running = false;
    console.log('\nInitiative engine stopped');
  }

  /**
   * Cleanup
   */
  close() {
    this.stop();
    this.db.close();
  }
}

// ============================================
// CLI
// ============================================

if (require.main === module) {
  const engine = new InitiativeEngine();

  const command = process.argv[2];

  switch (command) {
    case 'tick':
      // Single tick for testing
      engine.tick().then(() => {
        engine.close();
      });
      break;

    case 'status':
      // Show current state
      console.log('\n=== Initiative Engine Status ===\n');
      
      const canInit = engine.canInitiate();
      console.log(`Can initiate: ${canInit.allowed ? 'Yes' : 'No'}`);
      if (!canInit.allowed) console.log(`  Reason: ${canInit.reason}`);
      
      const pending = engine.db.prepare(`
        SELECT * FROM initiative_queue WHERE status = 'pending'
      `).all();
      console.log(`\nPending initiatives: ${pending.length}`);
      pending.forEach(p => {
        console.log(`  #${p.id} [${p.type}] ${p.prompt.substring(0, 50)}...`);
      });

      const recent = engine.db.prepare(`
        SELECT * FROM initiative_queue 
        ORDER BY created_at DESC 
        LIMIT 5
      `).all();
      console.log(`\nRecent initiatives:`);
      recent.forEach(r => {
        const date = new Date(r.created_at).toLocaleString();
        console.log(`  #${r.id} [${r.status}] ${r.type} - ${date}`);
      });

      engine.close();
      break;

    case 'clear':
      // Clear pending initiatives
      engine.db.prepare(`DELETE FROM initiative_queue WHERE status = 'pending'`).run();
      console.log('Cleared pending initiatives');
      engine.close();
      break;

    case 'test':
      // Test finding share-worthy things without queueing
      console.log('\n=== Testing Share-Worthy Detection ===\n');
      engine.findShareWorthy().then(result => {
        if (result) {
          console.log('\nFound share-worthy initiative:');
          console.log(`  Type: ${result.type}`);
          console.log(`  Data: ${JSON.stringify(result.data, null, 2)}`);
          console.log('\nRun "node initiative-engine.js generate" to test LLM message generation');
        } else {
          console.log('\nNothing share-worthy found');
        }
        engine.close();
      });
      break;

    case 'generate':
      // Test LLM generation for whatever is share-worthy
      console.log('\n=== Testing LLM Message Generation ===\n');
      engine.findShareWorthy().then(async result => {
        if (result) {
          console.log('Found initiative:');
          console.log(`  Type: ${result.type}`);
          console.log(`  Data: ${JSON.stringify(result.data, null, 2)}`);
          console.log('\nGenerating message via LLM...\n');
          
          try {
            const message = await engine.generateInitiativeMessage(result);
            console.log('Generated message:');
            console.log('─'.repeat(50));
            console.log(message);
            console.log('─'.repeat(50));
          } catch (err) {
            console.log(`LLM generation failed: ${err.message}`);
            console.log('\nFallback message:');
            console.log(engine.getFallbackMessage(result));
          }
        } else {
          console.log('Nothing share-worthy found - cannot test generation');
        }
        engine.close();
      });
      break;

    default:
      // Default: run the engine
      engine.start();

      // Graceful shutdown
      process.on('SIGINT', () => {
        console.log('\nShutting down...');
        engine.close();
        process.exit(0);
      });

      process.on('SIGTERM', () => {
        engine.close();
        process.exit(0);
      });
  }
}

module.exports = InitiativeEngine;
