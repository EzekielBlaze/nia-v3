/**
 * NIA V3 - Scar Processor
 * 
 * Handles the creation of identity scars from significant events.
 * Scars are PERMANENT changes - they require careful evaluation.
 * 
 * A scar should only form when:
 * 1. Event has high emotional intensity (0.7+)
 * 2. Event represents a genuine shift in understanding
 * 3. The change would have concrete behavioral effects
 * 4. Blaze approves (scars are too important to auto-create)
 */

const Database = require('better-sqlite3');
const path = require('path');
const logger = require('./utils/logger');

const DATA_DIR = process.env.NIA_DATA_DIR || path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'nia.db');
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://127.0.0.1:1234';

class ScarProcessor {
  constructor(dbPath = DB_PATH) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    logger.info('ScarProcessor initialized');
  }

  /**
   * Get pending scar candidates (from belief processor)
   * These are stored in a staging table for review
   */
  getPendingScarCandidates() {
    // First ensure the staging table exists
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scar_candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        description TEXT NOT NULL,
        emotional_valence REAL,
        emotional_intensity REAL,
        why_significant TEXT,
        thinking_entry_id INTEGER,
        user_message TEXT,
        proposed_behavioral_impact TEXT,
        proposed_value_shift TEXT,
        status TEXT DEFAULT 'pending',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        reviewed_at INTEGER,
        review_notes TEXT
      )
    `);

    return this.db.prepare(`
      SELECT * FROM scar_candidates
      WHERE status = 'pending'
      ORDER BY emotional_intensity DESC
    `).all();
  }

  /**
   * Add a scar candidate for review
   */
  async addScarCandidate(event) {
    // Use LLM to propose behavioral impact and value shift
    const proposal = await this.proposeScarEffects(event);

    const stmt = this.db.prepare(`
      INSERT INTO scar_candidates (
        description,
        emotional_valence,
        emotional_intensity,
        why_significant,
        thinking_entry_id,
        user_message,
        proposed_behavioral_impact,
        proposed_value_shift
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      event.description,
      event.emotionalValence,
      event.emotionalIntensity,
      event.whySignificant,
      event.thinkingEntryId,
      event.userMessage,
      proposal.behavioralImpact,
      proposal.valueShift
    );

    logger.info(`Added scar candidate: ${event.description.substring(0, 50)}...`);
    return result.lastInsertRowid;
  }

  /**
   * Use LLM to propose what effects a scar should have
   */
  async proposeScarEffects(event) {
    const prompt = `You are helping define how a significant emotional event should permanently affect NIA's behavior.

Event: ${event.description}
Emotional valence: ${event.emotionalValence} (-1 = negative, 1 = positive)
Emotional intensity: ${event.emotionalIntensity} (0-1)
Why significant: ${event.whySignificant}

Based on this event, propose:

1. BEHAVIORAL IMPACT: How should this permanently change NIA's behavior?
   - What should she do differently going forward?
   - What new habits or patterns emerge?
   - What old patterns should she lose?

2. VALUE SHIFT: How does this change what NIA values?
   - What becomes more important?
   - What becomes less important?
   - What new understanding does she have?

3. CONCRETE EFFECTS: List 2-3 specific behavioral effects using this format:
   - hard_block: Things she can no longer do without extra steps
   - requires_step: New requirements before certain actions
   - bias: Tendencies that increase or decrease
   - threshold: Sensitivities that change
   - cap: Maximum limits on certain behaviors

Respond in JSON:
{
  "behavioralImpact": "Clear statement of behavioral change",
  "valueShift": "Clear statement of value change",
  "effects": [
    {
      "type": "hard_block|requires_step|bias|threshold|cap",
      "domain": "What area this affects",
      "action": "Specific action affected",
      "magnitude": 0.0-1.0,
      "description": "What this effect does"
    }
  ],
  "isWorthyScar": true/false,
  "reasoning": "Why this should or shouldn't become a permanent scar"
}

Return ONLY valid JSON.`;

    try {
      const response = await fetch(`${LM_STUDIO_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'local-model',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 800
        })
      });

      if (!response.ok) {
        throw new Error(`LLM request failed: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      let cleaned = content.trim();
      cleaned = cleaned.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      
      return JSON.parse(cleaned);

    } catch (err) {
      logger.error(`Failed to propose scar effects: ${err.message}`);
      return {
        behavioralImpact: 'Unknown - LLM analysis failed',
        valueShift: 'Unknown',
        effects: [],
        isWorthyScar: false,
        reasoning: `Analysis failed: ${err.message}`
      };
    }
  }

  /**
   * Approve a scar candidate and create the actual scar
   * This should only be called after user review/approval
   */
  approveScar(candidateId, notes = '') {
    // Get the candidate
    const candidate = this.db.prepare(`
      SELECT * FROM scar_candidates WHERE id = ?
    `).get(candidateId);

    if (!candidate) {
      throw new Error(`Scar candidate ${candidateId} not found`);
    }

    const now = Math.floor(Date.now() / 1000);
    const scarType = candidate.emotional_valence >= 0 ? 'connection' : 'violation';

    // Create the scar
    const scarStmt = this.db.prepare(`
      INSERT INTO identity_scars (
        scar_type,
        emotional_valence,
        emotional_intensity,
        scar_description,
        context,
        behavioral_impact,
        value_shift,
        is_permanent,
        cannot_be_undone,
        integration_status,
        formed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 'fresh', ?)
    `);

    const scarResult = scarStmt.run(
      scarType,
      candidate.emotional_valence,
      candidate.emotional_intensity,
      candidate.description,
      candidate.user_message || 'Conversation context',
      candidate.proposed_behavioral_impact,
      candidate.proposed_value_shift,
      now
    );

    const scarId = scarResult.lastInsertRowid;

    // Parse and create scar effects
    try {
      const proposal = JSON.parse(candidate.proposed_behavioral_impact);
      if (proposal.effects && Array.isArray(proposal.effects)) {
        const effectStmt = this.db.prepare(`
          INSERT INTO scar_effects (
            scar_id,
            effect_type,
            target_domain,
            target_action,
            magnitude,
            effect_description,
            can_be_deactivated
          ) VALUES (?, ?, ?, ?, ?, ?, 0)
        `);

        for (const effect of proposal.effects) {
          effectStmt.run(
            scarId,
            effect.type,
            effect.domain,
            effect.action || null,
            effect.magnitude,
            effect.description
          );
        }
      }
    } catch (e) {
      // If behavioral_impact isn't JSON with effects, create a default effect
      this.db.prepare(`
        INSERT INTO scar_effects (
          scar_id,
          effect_type,
          target_domain,
          magnitude,
          effect_description,
          can_be_deactivated
        ) VALUES (?, 'bias', 'general', 0.5, ?, 0)
      `).run(scarId, candidate.proposed_behavioral_impact);
    }

    // Mark candidate as approved
    this.db.prepare(`
      UPDATE scar_candidates SET
        status = 'approved',
        reviewed_at = ?,
        review_notes = ?
      WHERE id = ?
    `).run(now, notes, candidateId);

    logger.info(`Created scar ${scarId} from candidate ${candidateId}`);
    return scarId;
  }

  /**
   * Reject a scar candidate
   */
  rejectScar(candidateId, reason = '') {
    const now = Math.floor(Date.now() / 1000);
    
    this.db.prepare(`
      UPDATE scar_candidates SET
        status = 'rejected',
        reviewed_at = ?,
        review_notes = ?
      WHERE id = ?
    `).run(now, reason, candidateId);

    logger.info(`Rejected scar candidate ${candidateId}`);
  }

  /**
   * Get all active scars
   */
  getActiveScars() {
    return this.db.prepare(`
      SELECT s.*, 
        (SELECT COUNT(*) FROM scar_effects WHERE scar_id = s.id) as effect_count
      FROM identity_scars s
      ORDER BY formed_at DESC
    `).all();
  }

  /**
   * Get scar effects that apply to a domain/action
   */
  getScarEffectsFor(domain, action = null) {
    let query = `
      SELECT se.*, s.scar_description
      FROM scar_effects se
      JOIN identity_scars s ON se.scar_id = s.id
      WHERE se.is_active = 1
      AND se.target_domain = ?
    `;
    const params = [domain];

    if (action) {
      query += ` AND (se.target_action = ? OR se.target_action IS NULL)`;
      params.push(action);
    }

    return this.db.prepare(query).all(...params);
  }

  /**
   * Check if an action is blocked by scars
   */
  checkScarBlocks(domain, action) {
    const effects = this.getScarEffectsFor(domain, action);
    
    const blocks = effects.filter(e => e.effect_type === 'hard_block');
    const requirements = effects.filter(e => e.effect_type === 'requires_step');
    const biases = effects.filter(e => e.effect_type === 'bias');

    return {
      blocked: blocks.length > 0,
      blocks: blocks.map(b => ({
        scarDescription: b.scar_description,
        effect: b.effect_description
      })),
      requirements: requirements.map(r => ({
        scarDescription: r.scar_description,
        effect: r.effect_description
      })),
      biases: biases.map(b => ({
        scarDescription: b.scar_description,
        effect: b.effect_description,
        magnitude: b.magnitude
      }))
    };
  }

  /**
   * Log a scar activation (when a scar affects behavior)
   */
  logScarActivation(scarId, context, effect) {
    this.db.prepare(`
      INSERT INTO scar_activations (scar_id, activation_context, behavioral_effect)
      VALUES (?, ?, ?)
    `).run(scarId, context, effect);
  }

  /**
   * Get scar summary for system prompt
   */
  getScarSummary() {
    const scars = this.db.prepare(`
      SELECT s.*, GROUP_CONCAT(se.effect_description, '; ') as effects
      FROM identity_scars s
      LEFT JOIN scar_effects se ON se.scar_id = s.id AND se.is_active = 1
      GROUP BY s.id
      ORDER BY s.emotional_intensity DESC
    `).all();

    const positive = scars.filter(s => s.emotional_valence >= 0);
    const negative = scars.filter(s => s.emotional_valence < 0);

    return { positive, negative, total: scars.length };
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
  const processor = new ScarProcessor();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'pending':
      const pending = processor.getPendingScarCandidates();
      console.log(`\n${pending.length} pending scar candidates:\n`);
      pending.forEach(p => {
        console.log(`[${p.id}] ${p.description}`);
        console.log(`  Valence: ${p.emotional_valence}, Intensity: ${p.emotional_intensity}`);
        console.log(`  Impact: ${p.proposed_behavioral_impact?.substring(0, 100)}...`);
        console.log('');
      });
      processor.close();
      break;
    
    case 'scars':
      const scars = processor.getActiveScars();
      console.log(`\n${scars.length} active scars:\n`);
      scars.forEach(s => {
        const type = s.emotional_valence >= 0 ? '✨' : '⚡';
        console.log(`${type} [${s.id}] ${s.scar_description}`);
        console.log(`  Type: ${s.scar_type}, Status: ${s.integration_status}`);
        console.log(`  Effects: ${s.effect_count}`);
        console.log('');
      });
      processor.close();
      break;
    
    case 'approve':
      const approveId = parseInt(process.argv[3]);
      if (!approveId) {
        console.log('Usage: node scar-processor.js approve <candidate_id>');
      } else {
        const scarId = processor.approveScar(approveId, 'Approved via CLI');
        console.log(`Created scar ${scarId}`);
      }
      processor.close();
      break;
    
    case 'reject':
      const rejectId = parseInt(process.argv[3]);
      const reason = process.argv[4] || 'Rejected via CLI';
      if (!rejectId) {
        console.log('Usage: node scar-processor.js reject <candidate_id> [reason]');
      } else {
        processor.rejectScar(rejectId, reason);
        console.log(`Rejected candidate ${rejectId}`);
      }
      processor.close();
      break;
    
    default:
      console.log('NIA V3 Scar Processor');
      console.log('\nUsage:');
      console.log('  node scar-processor.js pending              - Show pending scar candidates');
      console.log('  node scar-processor.js scars                - Show active scars');
      console.log('  node scar-processor.js approve <id>         - Approve a scar candidate');
      console.log('  node scar-processor.js reject <id> [reason] - Reject a scar candidate');
      processor.close();
  }
}

module.exports = ScarProcessor;
