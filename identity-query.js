/**
 * NIA Identity Query Layer
 * Runtime enforcement of identity mechanics
 * 
 * This module provides the interface between NIA's daemon and the identity database.
 * Every action flows through here to check scars, distress, cognitive load, etc.
 * 
 * Uses better-sqlite3 for synchronous, fast SQLite access.
 */

const Database = require('better-sqlite3');

class IdentityQuery {
  constructor() {
    this.db = null;
    this.ready = false;
  }

  /**
   * Initialize the database connection
   * @param {string} dbPath - Path to the SQLite database file
   */
  init(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.ready = true;
    return this;
  }

  /**
   * Initialize from schema file (creates new db)
   * @param {string} dbPath - Path to create database
   * @param {string} schemaPath - Path to SQL schema file
   */
  initFromSchema(dbPath, schemaPath) {
    const fs = require('fs');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    
    const schema = fs.readFileSync(schemaPath, 'utf8');
    this.db.exec(schema);
    
    this.ready = true;
    return this;
  }

  // ===========================================================================
  // CORE QUERY FUNCTIONS
  // ===========================================================================

  /**
   * Get all locked identity core anchors
   */
  getCoreAnchors() {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        anchor_statement,
        anchor_type,
        constitutional_rule,
        stability_score,
        is_locked
      FROM identity_core
      WHERE is_locked = 1
      ORDER BY stability_score DESC
    `);
    return stmt.all();
  }

  /**
   * Get all active beliefs with conviction > threshold
   * @param {number} minConviction - Minimum conviction score (default 30)
   */
  getActiveBeliefs(minConviction = 30) {
    const stmt = this.db.prepare(`
      SELECT 
        b.id,
        b.belief_statement,
        b.belief_type,
        b.conviction_score,
        b.evidence_count,
        ic.anchor_statement as derives_from_anchor
      FROM beliefs b
      LEFT JOIN identity_core ic ON b.caused_by_identity_anchor_id = ic.id
      WHERE b.valid_to IS NULL
        AND b.conviction_score >= ?
      ORDER BY b.conviction_score DESC
    `);
    return stmt.all(minConviction);
  }

  // ===========================================================================
  // SCAR ENFORCEMENT (Critical for runtime decisions)
  // ===========================================================================

  /**
   * Get all active scar effects for a domain
   * @param {string} domain - The domain to check (e.g., 'helpfulness', 'trust')
   */
  getScarEffects(domain = null) {
    let sql = `
      SELECT 
        se.id,
        se.scar_id,
        se.effect_type,
        se.target_domain,
        se.target_action,
        se.magnitude,
        se.is_hard_limit,
        se.effect_description,
        se.enforcement_method,
        s.scar_type,
        s.scar_description,
        s.emotional_valence
      FROM scar_effects se
      JOIN identity_scars s ON se.scar_id = s.id
      WHERE se.is_active = 1
        AND s.is_permanent = 1
    `;
    
    if (domain) {
      sql += ` AND se.target_domain = ?`;
    }
    
    sql += ` ORDER BY se.is_hard_limit DESC, se.magnitude DESC`;
    
    const stmt = this.db.prepare(sql);
    return domain ? stmt.all(domain) : stmt.all();
  }

  /**
   * Get hard blocks - actions that are permanently impossible
   */
  getHardBlocks(domain = null, action = null) {
    let sql = `
      SELECT 
        se.target_domain,
        se.target_action,
        se.effect_description,
        s.scar_description as reason,
        s.formed_at
      FROM scar_effects se
      JOIN identity_scars s ON se.scar_id = s.id
      WHERE se.effect_type = 'hard_block'
        AND se.is_active = 1
        AND s.is_permanent = 1
    `;
    
    const params = [];
    if (domain) {
      sql += ` AND se.target_domain = ?`;
      params.push(domain);
    }
    if (action) {
      sql += ` AND se.target_action = ?`;
      params.push(action);
    }
    
    const stmt = this.db.prepare(sql);
    return stmt.all(...params);
  }

  /**
   * Get capability caps - permanent limits on metrics
   */
  getCapabilityCaps(domain = null) {
    let sql = `
      SELECT 
        se.target_domain,
        se.target_action,
        se.magnitude as cap_value,
        se.effect_description,
        s.scar_description as reason,
        s.emotional_valence
      FROM scar_effects se
      JOIN identity_scars s ON se.scar_id = s.id
      WHERE se.effect_type = 'cap'
        AND se.is_active = 1
        AND s.is_permanent = 1
    `;
    
    if (domain) {
      sql += ` AND se.target_domain = ?`;
    }
    
    const stmt = this.db.prepare(sql);
    return domain ? stmt.all(domain) : stmt.all();
  }

  /**
   * Get required steps before actions
   */
  getRequiredSteps(domain = null) {
    let sql = `
      SELECT 
        se.target_domain,
        se.target_action,
        se.effect_description as required_step,
        se.magnitude as importance,
        s.scar_description as reason
      FROM scar_effects se
      JOIN identity_scars s ON se.scar_id = s.id
      WHERE se.effect_type = 'requires_step'
        AND se.is_active = 1
        AND s.is_permanent = 1
    `;
    
    if (domain) {
      sql += ` AND se.target_domain = ?`;
    }
    
    const stmt = this.db.prepare(sql);
    return domain ? stmt.all(domain) : stmt.all();
  }

  /**
   * Get all biases (permanent weight shifts)
   */
  getBiases(domain = null) {
    let sql = `
      SELECT 
        se.target_domain,
        se.target_action,
        se.magnitude as bias_strength,
        se.effect_description,
        s.scar_description as source,
        s.emotional_valence
      FROM scar_effects se
      JOIN identity_scars s ON se.scar_id = s.id
      WHERE se.effect_type = 'bias'
        AND se.is_active = 1
        AND s.is_permanent = 1
    `;
    
    if (domain) {
      sql += ` AND se.target_domain = ?`;
    }
    
    const stmt = this.db.prepare(sql);
    return domain ? stmt.all(domain) : stmt.all();
  }

  /**
   * Get all formative scars (positive and negative)
   */
  getFormativeScars() {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        scar_type,
        emotional_valence,
        emotional_intensity,
        scar_description,
        behavioral_impact,
        value_shift,
        capability_change,
        integration_status,
        acceptance_level,
        formed_at,
        CASE 
          WHEN emotional_valence > 0.3 THEN 'POSITIVE'
          WHEN emotional_valence < -0.3 THEN 'NEGATIVE'
          ELSE 'COMPLEX'
        END as scar_category
      FROM identity_scars
      WHERE is_permanent = 1
      ORDER BY emotional_intensity DESC
    `);
    return stmt.all();
  }

  // ===========================================================================
  // DISTRESS & COGNITIVE LOAD
  // ===========================================================================

  /**
   * Get current distress state
   */
  getCurrentDistress() {
    const stmt = this.db.prepare(`
      SELECT 
        id,
        trigger_type,
        distress_level,
        defensive_mode,
        defensive_active_until,
        coherence_penalty,
        stability_penalty,
        status,
        CASE 
          WHEN status = 'active' AND distress_level > 80 THEN 'CRISIS'
          WHEN status = 'active' AND distress_level > 50 THEN 'HIGH'
          WHEN status = 'active' THEN 'MODERATE'
          WHEN status = 'chronic' THEN 'CHRONIC'
          ELSE 'RESOLVED'
        END as severity_category
      FROM identity_distress
      WHERE status IN ('active', 'chronic')
      ORDER BY distress_level DESC
    `);
    return stmt.all();
  }

  /**
   * Check if a defensive mode is currently active
   */
  getActiveDefensiveMode() {
    const distress = this.getCurrentDistress();
    const now = Math.floor(Date.now() / 1000);
    
    for (const d of distress) {
      if (d.defensive_mode && 
          (d.defensive_active_until === null || d.defensive_active_until > now)) {
        return {
          mode: d.defensive_mode,
          level: d.distress_level,
          trigger: d.trigger_type
        };
      }
    }
    return null;
  }

  /**
   * Get today's cognitive load status
   */
  getCognitiveLoad() {
    const today = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
    
    const stmt = this.db.prepare(`
      SELECT 
        revision_budget_max,
        revision_budget_remaining,
        revision_budget_used_today,
        active_tension_count,
        active_distress_count,
        fatigue_level,
        is_overwhelmed,
        can_process_new_beliefs,
        can_revise_existing_beliefs,
        can_resolve_tensions,
        can_engage_complex_topics
      FROM cognitive_load
      WHERE load_date = ?
    `);
    
    const result = stmt.get(today);
    
    if (!result) {
      return {
        revision_budget_max: 100,
        revision_budget_remaining: 100,
        revision_budget_used_today: 0,
        fatigue_level: 'normal',
        is_overwhelmed: 0,
        can_process_new_beliefs: 1,
        can_revise_existing_beliefs: 1,
        can_resolve_tensions: 1,
        can_engage_complex_topics: 1
      };
    }
    
    return result;
  }

  // ===========================================================================
  // TENSIONS
  // ===========================================================================

  /**
   * Get active tensions (unresolved contradictions)
   */
  getActiveTensions(stableOnly = false) {
    let sql = `
      SELECT 
        ct.id,
        ct.tension_type,
        ct.tension_description,
        ct.severity,
        ct.status,
        ct.days_unresolved,
        ct.acceptance_level,
        ct.affects_decisions,
        ct.decision_pattern,
        ct.refusal_trigger,
        ct.refusal_reasoning,
        ct.is_stable_unresolved,
        b1.belief_statement as belief_a,
        b2.belief_statement as belief_b,
        b1.conviction_score as conviction_a,
        b2.conviction_score as conviction_b
      FROM cognitive_tension ct
      JOIN beliefs b1 ON ct.belief_a_id = b1.id
      JOIN beliefs b2 ON ct.belief_b_id = b2.id
      WHERE ct.status IN ('unresolved', 'stable_unresolved', 'chronic', 'accepted_uncertainty', 'both_valid', 'context_dependent')
    `;
    
    if (stableOnly) {
      sql += ` AND ct.is_stable_unresolved = 1`;
    }
    
    sql += ` ORDER BY ct.severity DESC`;
    
    const stmt = this.db.prepare(sql);
    return stmt.all();
  }

  /**
   * Get tensions that can trigger refusals
   */
  getRefusalTriggers() {
    const stmt = this.db.prepare(`
      SELECT 
        ct.id,
        ct.tension_description,
        ct.refusal_reasoning,
        ct.decision_pattern,
        b1.belief_statement as belief_a,
        b2.belief_statement as belief_b
      FROM cognitive_tension ct
      JOIN beliefs b1 ON ct.belief_a_id = b1.id
      JOIN beliefs b2 ON ct.belief_b_id = b2.id
      WHERE ct.refusal_trigger = 1
        AND ct.status NOT IN ('resolved_revision_a', 'resolved_revision_b')
    `);
    return stmt.all();
  }

  // ===========================================================================
  // BELIEF ECHOES
  // ===========================================================================

  /**
   * Get active belief echoes (residual influence from superseded beliefs)
   */
  getActiveEchoes(minStrength = 0.1) {
    const stmt = this.db.prepare(`
      SELECT 
        be.id,
        be.superseded_belief_id,
        be.original_conviction,
        be.echo_strength,
        be.influence_type,
        be.trigger_count,
        b.belief_statement as original_belief
      FROM belief_echoes be
      JOIN beliefs b ON be.superseded_belief_id = b.id
      WHERE be.is_active = 1
        AND be.echo_strength >= ?
      ORDER BY be.echo_strength DESC
    `);
    return stmt.all(minStrength);
  }

  // ===========================================================================
  // MAIN DECISION FUNCTION
  // ===========================================================================

  /**
   * Check if NIA can perform an action
   * This is the main entry point for runtime enforcement
   */
  canPerformAction(domain, action) {
    const result = {
      allowed: true,
      blocked: false,
      blockReason: null,
      requirements: [],
      biases: [],
      caps: [],
      defensiveMode: null,
      cognitiveState: null,
      warnings: []
    };

    // 1. Check hard blocks first
    const hardBlocks = this.getHardBlocks(domain, action);
    if (hardBlocks.length > 0) {
      result.allowed = false;
      result.blocked = true;
      result.blockReason = hardBlocks[0].effect_description;
      result.blockSource = hardBlocks[0].reason;
      return result;
    }

    // 2. Check cognitive load
    const cogLoad = this.getCognitiveLoad();
    result.cognitiveState = cogLoad;
    
    if (cogLoad.is_overwhelmed) {
      result.allowed = false;
      result.blocked = true;
      result.blockReason = 'Cognitive capacity overwhelmed. Cannot process new actions.';
      return result;
    }

    // 3. Check defensive mode
    const defensiveMode = this.getActiveDefensiveMode();
    if (defensiveMode) {
      result.defensiveMode = defensiveMode;
      
      if (defensiveMode.mode === 'shutdown') {
        result.allowed = false;
        result.blocked = true;
        result.blockReason = 'Identity in shutdown mode due to severe distress.';
        return result;
      }
      
      if (defensiveMode.mode === 'withdrawal' && domain === 'engagement') {
        result.warnings.push('Defensive withdrawal active - reduced engagement capacity');
      }
      
      if (defensiveMode.mode === 'rigidity') {
        result.warnings.push('Defensive rigidity active - resistance to new beliefs or changes');
      }
    }

    // 4. Check required steps
    const requiredSteps = this.getRequiredSteps(domain);
    for (const step of requiredSteps) {
      if (!action || step.target_action === action || step.target_action === null) {
        result.requirements.push({
          step: step.required_step,
          importance: step.importance,
          reason: step.reason
        });
      }
    }

    // 5. Collect biases
    const biases = this.getBiases(domain);
    for (const bias of biases) {
      result.biases.push({
        target: bias.target_action || bias.target_domain,
        strength: bias.bias_strength,
        description: bias.effect_description,
        fromPositiveScar: bias.emotional_valence > 0
      });
    }

    // 6. Collect caps
    const caps = this.getCapabilityCaps(domain);
    for (const cap of caps) {
      result.caps.push({
        metric: cap.target_action || cap.target_domain,
        maxValue: cap.cap_value,
        description: cap.effect_description,
        reason: cap.reason
      });
    }

    // 7. Check for relevant tensions
    const tensions = this.getActiveTensions();
    for (const tension of tensions) {
      if (tension.affects_decisions && tension.refusal_trigger) {
        result.warnings.push(`Active tension may affect decision: ${tension.tension_description}`);
      }
    }

    // 8. Check echoes
    const echoes = this.getActiveEchoes(0.3);
    for (const echo of echoes) {
      if (echo.influence_type === 'hesitation' || echo.influence_type === 'resistance') {
        result.warnings.push(`Echo influence: "${echo.original_belief}" (strength: ${echo.echo_strength.toFixed(2)})`);
      }
    }

    return result;
  }

  /**
   * Build context for LLM prompt
   */
  buildIdentityContext() {
    return {
      coreAnchors: this.getCoreAnchors(),
      activeBeliefs: this.getActiveBeliefs(40),
      formativeScars: this.getFormativeScars(),
      activeEffects: this.getScarEffects(),
      currentDistress: this.getCurrentDistress(),
      cognitiveLoad: this.getCognitiveLoad(),
      activeTensions: this.getActiveTensions(true),
      activeEchoes: this.getActiveEchoes(0.2)
    };
  }

  /**
   * Format identity context for system prompt injection
   */
  formatForSystemPrompt() {
    const ctx = this.buildIdentityContext();
    
    let prompt = '=== IDENTITY CONTEXT ===\n\n';
    
    // Core anchors
    if (ctx.coreAnchors.length > 0) {
      prompt += '## Core Principles (Inviolable)\n';
      for (const anchor of ctx.coreAnchors) {
        prompt += `- ${anchor.anchor_statement}\n`;
        if (anchor.constitutional_rule) {
          prompt += `  Rule: ${anchor.constitutional_rule}\n`;
        }
      }
      prompt += '\n';
    }
    
    // Scars
    if (ctx.formativeScars.length > 0) {
      prompt += '## Formative Experiences\n';
      for (const scar of ctx.formativeScars) {
        const category = scar.emotional_valence > 0.3 ? '✨' : 
                         scar.emotional_valence < -0.3 ? '⚡' : '◐';
        prompt += `${category} ${scar.scar_description}\n`;
        prompt += `   Impact: ${scar.behavioral_impact}\n`;
      }
      prompt += '\n';
    }
    
    // Active effects
    const hardBlocks = ctx.activeEffects.filter(e => e.effect_type === 'hard_block');
    const requiredSteps = ctx.activeEffects.filter(e => e.effect_type === 'requires_step');
    
    if (hardBlocks.length > 0 || requiredSteps.length > 0) {
      prompt += '## Behavioral Constraints\n';
      for (const block of hardBlocks) {
        prompt += `🚫 CANNOT: ${block.effect_description}\n`;
      }
      for (const step of requiredSteps) {
        prompt += `⚠️ MUST: ${step.effect_description}\n`;
      }
      prompt += '\n';
    }
    
    // Distress state
    if (ctx.currentDistress.length > 0) {
      prompt += '## Current State\n';
      for (const d of ctx.currentDistress) {
        prompt += `⚠️ ${d.severity_category} distress from ${d.trigger_type}`;
        if (d.defensive_mode) {
          prompt += ` (defensive mode: ${d.defensive_mode})`;
        }
        prompt += '\n';
      }
      prompt += '\n';
    }
    
    // Active tensions
    if (ctx.activeTensions.length > 0) {
      prompt += '## Unresolved Tensions (I live with these)\n';
      for (const t of ctx.activeTensions) {
        prompt += `- ${t.tension_description}\n`;
        prompt += `  "${t.belief_a}" vs "${t.belief_b}"\n`;
      }
      prompt += '\n';
    }
    
    prompt += '=== END IDENTITY CONTEXT ===';
    
    return prompt;
  }

  // ===========================================================================
  // LOGGING & TRACKING
  // ===========================================================================

  logScarActivation(scarId, effectId, context, actionAttempted, effectApplied, result) {
    const stmt = this.db.prepare(`
      INSERT INTO scar_activations (
        scar_id, scar_effect_id, activation_date, trigger_context,
        action_attempted, effect_applied, result
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      scarId, 
      effectId, 
      Math.floor(Date.now() / 1000),
      context,
      actionAttempted,
      effectApplied,
      result
    );
  }

  logTensionActivation(tensionId, context, effectType, severity, behavior) {
    const stmt = this.db.prepare(`
      INSERT INTO tension_activations (
        tension_id, activation_date, trigger_context,
        effect_type, effect_severity, behavior_description
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      tensionId,
      Math.floor(Date.now() / 1000),
      context,
      effectType,
      severity,
      behavior
    );
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.ready = false;
    }
  }
}

module.exports = IdentityQuery;
