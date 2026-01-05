/**
 * NIA V3 - Belief Processor
 * 
 * Processes the thinking log to extract and evolve beliefs.
 * This is the "growing mechanism" that makes identity actually develop.
 * 
 * Flow:
 * 1. Read unprocessed thinking_log entries
 * 2. Use LLM to extract potential beliefs
 * 3. Create new beliefs or reinforce existing ones
 * 4. Detect significant events â†’ potential scars
 * 5. Apply belief decay
 * 6. Respect cognitive load limits
 */

const Database = require('better-sqlite3');
const path = require('path');
const logger = require('./utils/logger');

// Configurable paths
const DATA_DIR = process.env.NIA_DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'nia.db');
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://127.0.0.1:1234';

class BeliefProcessor {
  constructor(dbPath = DB_PATH) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    logger.info('BeliefProcessor initialized');
  }

  /**
   * Main processing function - call periodically or after conversations
   */
  async process(options = {}) {
    const {
      maxEntries = 10,        // Process up to N thinking entries
      extractBeliefs = true,  // Extract beliefs from thinking
      applyDecay = true,      // Apply belief decay
      checkScars = true       // Check for scar-worthy events
    } = options;

    logger.info('=== Starting Belief Processing ===');
    
    const results = {
      entriesProcessed: 0,
      beliefsExtracted: 0,
      beliefsReinforced: 0,
      beliefsCreated: 0,
      potentialScars: [],
      decayApplied: false,
      cognitiveLoad: null
    };

    try {
      // Check cognitive load first
      results.cognitiveLoad = this.getCognitiveLoad();
      if (results.cognitiveLoad.budget_remaining < 5) {
        logger.warn('Cognitive load too high, skipping belief processing');
        return results;
      }

      // Get unprocessed thinking entries
      const entries = this.getUnprocessedThinking(maxEntries);
      logger.info(`Found ${entries.length} unprocessed thinking entries`);

      if (extractBeliefs && entries.length > 0) {
        for (const entry of entries) {
          try {
            const extracted = await this.extractBeliefsFromThinking(entry);
            
            for (const belief of extracted.beliefs) {
              const existing = this.findSimilarBelief(belief.statement);
              
              if (existing) {
                this.reinforceBelief(existing.id, belief.evidence);
                results.beliefsReinforced++;
              } else {
                this.createBelief(belief);
                results.beliefsCreated++;
              }
              results.beliefsExtracted++;
            }

            // Check for significant events
            if (checkScars && extracted.significantEvent) {
              const scarCandidate = this.evaluateScarCandidate(extracted.significantEvent, entry);
              if (scarCandidate) {
                results.potentialScars.push(scarCandidate);
              }
            }

            // Mark entry as processed
            this.markThinkingProcessed(entry.id, extracted.beliefs.length);
            results.entriesProcessed++;

            // Consume cognitive budget
            this.consumeCognitiveBudget(extracted.beliefs.length * 2);

          } catch (err) {
            logger.error(`Failed to process entry ${entry.id}: ${err.message}`);
          }
        }
      }

      // Apply belief decay (once per processing run)
      if (applyDecay) {
        this.applyBeliefDecay();
        results.decayApplied = true;
      }

      logger.info(`=== Belief Processing Complete ===`);
      logger.info(`Processed: ${results.entriesProcessed}, Created: ${results.beliefsCreated}, Reinforced: ${results.beliefsReinforced}`);
      
      return results;

    } catch (err) {
      logger.error(`Belief processing failed: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get unprocessed thinking log entries
   */
  getUnprocessedThinking(limit = 10) {
    const stmt = this.db.prepare(`
      SELECT id, user_message, thinking_content, response_summary, created_at
      FROM thinking_log
      WHERE processed_for_beliefs = 0
      ORDER BY created_at ASC
      LIMIT ?
    `);
    return stmt.all(limit);
  }

  /**
   * Use LLM to extract beliefs from a thinking entry
   */
  async extractBeliefsFromThinking(entry) {
    const prompt = `You are analyzing NIA's internal thinking to extract beliefs that are forming.

NIA's thinking during this conversation:
<thinking>
${entry.thinking_content}
</thinking>

User said: "${entry.user_message}"
NIA responded with: "${entry.response_summary || '(summary not available)'}"

Extract any beliefs, values, or preferences that NIA expressed or developed in this thinking.

A belief is something NIA:
- Realized or learned
- Values or cares about
- Prefers or dislikes
- Concluded about herself, Blaze, or the world

Also note if this was a SIGNIFICANT EVENT - something emotionally impactful that might shape NIA's identity long-term.

Respond in JSON format:
{
  "beliefs": [
    {
      "statement": "Clear belief statement (e.g., 'I value genuine connection over performance')",
      "type": "value|preference|aversion|principle|fact|concern",
      "conviction": 10-50 (how strongly this belief emerged, new beliefs start lower),
      "evidence": "What in the thinking supports this belief",
      "reasoning": "Why this belief formed"
    }
  ],
  "significantEvent": null | {
    "description": "What happened that was significant",
    "emotionalValence": -1 to 1 (negative to positive),
    "emotionalIntensity": 0 to 1 (how intense),
    "whySignificant": "Why this matters for identity"
  }
}

Rules:
- Only extract beliefs that are actually present in the thinking
- Don't invent beliefs NIA didn't express
- New beliefs should have conviction 10-30, only raise higher if strongly expressed
- Most conversations won't have significant events - that's rare
- Return empty beliefs array if nothing belief-worthy was expressed

Return ONLY valid JSON, no markdown.`;

    try {
      const response = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'local-model',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        throw new Error(`LLM request failed: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      // Clean and parse JSON
      let cleaned = content.trim();
      cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      const result = JSON.parse(cleaned);
      
      // Validate structure
      if (!Array.isArray(result.beliefs)) {
        result.beliefs = [];
      }

      return result;

    } catch (err) {
      logger.error(`Belief extraction failed: ${err.message}`);
      return { beliefs: [], significantEvent: null };
    }
  }

  /**
   * Find existing belief similar to the given statement
   */
  findSimilarBelief(statement) {
    // Simple keyword matching for now
    // TODO: Use embeddings for semantic similarity
    const normalized = statement.toLowerCase();
    const keywords = normalized
      .split(/\s+/)
      .filter(w => w.length > 4)
      .slice(0, 5);

    if (keywords.length === 0) return null;

    // Build query with LIKE conditions
    const conditions = keywords.map(() => `belief_statement LIKE ?`).join(' OR ');
    const params = keywords.map(k => `%${k}%`);

    const stmt = this.db.prepare(`
      SELECT * FROM beliefs 
      WHERE is_active = 1 
      AND (${conditions})
      ORDER BY conviction_score DESC
      LIMIT 1
    `);

    return stmt.get(...params);
  }

  /**
   * Reinforce an existing belief
   */
  reinforceBelief(beliefId, newEvidence) {
    const now = Math.floor(Date.now() / 1000);
    
    const stmt = this.db.prepare(`
      UPDATE beliefs SET
        conviction_score = MIN(100, conviction_score + 5),
        evidence_count = evidence_count + 1,
        last_reinforced = ?,
        updated_at = ?
      WHERE id = ?
    `);
    
    stmt.run(now, now, beliefId);
    logger.info(`Reinforced belief ${beliefId}`);
  }

  /**
   * Create a new belief
   */
  createBelief(belief) {
    const now = Math.floor(Date.now() / 1000);
    
    const stmt = this.db.prepare(`
      INSERT INTO beliefs (
        belief_statement,
        belief_type,
        valid_from,
        formation_reasoning,
        conviction_score,
        evidence_count,
        last_reinforced,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `);

    const result = stmt.run(
      belief.statement,
      belief.type || 'value',
      now,
      belief.reasoning || belief.evidence || 'Extracted from thinking',
      belief.conviction_score || belief.conviction || 15,
      now,
      now,
      now
    );

    logger.info(`Created belief: "${belief.statement.substring(0, 50)}..." (id: ${result.lastInsertRowid})`);
    return result.lastInsertRowid;
  }

  /**
   * Evaluate if an event should become a scar
   */
  evaluateScarCandidate(event, thinkingEntry) {
    // Scars require high emotional intensity
    if (event.emotionalIntensity < 0.7) {
      return null;
    }

    // Check if similar scar already exists
    const existing = this.db.prepare(`
      SELECT id FROM identity_scars
      WHERE scar_description LIKE ?
      LIMIT 1
    `).get(`%${event.description.substring(0, 30)}%`);

    if (existing) {
      logger.info('Similar scar already exists, skipping');
      return null;
    }

    return {
      description: event.description,
      emotionalValence: event.emotionalValence,
      emotionalIntensity: event.emotionalIntensity,
      whySignificant: event.whySignificant,
      thinkingEntryId: thinkingEntry.id,
      userMessage: thinkingEntry.user_message,
      timestamp: thinkingEntry.created_at
    };
  }

  /**
   * Mark thinking entry as processed
   */
  markThinkingProcessed(entryId, beliefsExtracted) {
    const stmt = this.db.prepare(`
      UPDATE thinking_log SET
        processed_for_beliefs = 1,
        beliefs_extracted = ?
      WHERE id = ?
    `);
    stmt.run(beliefsExtracted, entryId);
  }

  /**
   * Apply decay to all active beliefs
   */
  applyBeliefDecay() {
    const now = Math.floor(Date.now() / 1000);
    const dayInSeconds = 86400;

    // Decay beliefs that haven't been reinforced in 7+ days
    const stmt = this.db.prepare(`
      UPDATE beliefs SET
        conviction_score = MAX(0, conviction_score - (decay_rate * ?)),
        updated_at = ?
      WHERE is_active = 1
      AND last_reinforced < ?
    `);

    const sevenDaysAgo = now - (7 * dayInSeconds);
    const daysSinceLastRun = 1; // Assume daily processing
    
    stmt.run(daysSinceLastRun, now, sevenDaysAgo);
    
    // Archive beliefs with conviction below 5
    const archiveStmt = this.db.prepare(`
      UPDATE beliefs SET
        valid_to = ?,
        revision_reasoning = 'Belief faded due to lack of reinforcement'
      WHERE is_active = 1
      AND conviction_score < 5
    `);
    
    const archived = archiveStmt.run(now);
    if (archived.changes > 0) {
      logger.info(`Archived ${archived.changes} faded beliefs`);
    }
  }

  /**
   * Get current cognitive load
   */
  getCognitiveLoad() {
    const today = Math.floor(Date.now() / 1000);
    const startOfDay = today - (today % 86400);

    let load = this.db.prepare(`
      SELECT * FROM cognitive_load WHERE load_date = ?
    `).get(startOfDay);

    if (!load) {
      // Create today's cognitive load
      this.db.prepare(`
        INSERT INTO cognitive_load (load_date, revision_budget_max, revision_budget_remaining)
        VALUES (?, 100.0, 100.0)
      `).run(startOfDay);
      
      load = {
        load_date: startOfDay,
        revision_budget_max: 100,
        revision_budget_remaining: 100,
        fatigue_level: 'fresh'
      };
    }

    return load;
  }

  /**
   * Consume cognitive budget
   */
  consumeCognitiveBudget(amount) {
    const today = Math.floor(Date.now() / 1000);
    const startOfDay = today - (today % 86400);

    this.db.prepare(`
      UPDATE cognitive_load SET
        revision_budget_remaining = MAX(0, revision_budget_remaining - ?)
      WHERE load_date = ?
    `).run(amount, startOfDay);
  }

  /**
   * Get belief summary for system prompt
   */
  getBeliefSummary() {
    const beliefs = this.db.prepare(`
      SELECT belief_statement, belief_type, conviction_score
      FROM beliefs
      WHERE is_active = 1
      ORDER BY conviction_score DESC
      LIMIT 20
    `).all();

    // Categorize by conviction
    const core = beliefs.filter(b => b.conviction_score >= 70);
    const active = beliefs.filter(b => b.conviction_score >= 30 && b.conviction_score < 70);
    const emerging = beliefs.filter(b => b.conviction_score < 30);

    return { core, active, emerging, total: beliefs.length };
  }

  /**
   * Get all active beliefs
   */
  getActiveBeliefs() {
    return this.db.prepare(`
      SELECT * FROM beliefs
      WHERE is_active = 1
      ORDER BY conviction_score DESC
    `).all();
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
  }
}

// CLI interface
if (require.main === module) {
  const processor = new BeliefProcessor();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'process':
      processor.process().then(results => {
        console.log('\nResults:', JSON.stringify(results, null, 2));
        processor.close();
      });
      break;
    
    case 'summary':
      const summary = processor.getBeliefSummary();
      console.log('\n=== Belief Summary ===');
      console.log(`Total active beliefs: ${summary.total}`);
      console.log(`\nCore (70+): ${summary.core.length}`);
      summary.core.forEach(b => console.log(`  [${b.conviction_score}] ${b.belief_statement}`));
      console.log(`\nActive (30-69): ${summary.active.length}`);
      summary.active.forEach(b => console.log(`  [${b.conviction_score}] ${b.belief_statement}`));
      console.log(`\nEmerging (<30): ${summary.emerging.length}`);
      summary.emerging.forEach(b => console.log(`  [${b.conviction_score}] ${b.belief_statement}`));
      processor.close();
      break;
    
    case 'unprocessed':
      const entries = processor.getUnprocessedThinking(20);
      console.log(`\n${entries.length} unprocessed thinking entries:`);
      entries.forEach(e => {
        console.log(`\n[${e.id}] ${new Date(e.created_at * 1000).toLocaleString()}`);
        console.log(`User: ${e.user_message?.substring(0, 80)}...`);
        console.log(`Thinking: ${e.thinking_content?.substring(0, 100)}...`);
      });
      processor.close();
      break;
    
    default:
      console.log('NIA V3 Belief Processor');
      console.log('\nUsage:');
      console.log('  node belief-processor.js process     - Process thinking log');
      console.log('  node belief-processor.js summary     - Show belief summary');
      console.log('  node belief-processor.js unprocessed - Show unprocessed thinking');
      processor.close();
  }
}

module.exports = BeliefProcessor;
