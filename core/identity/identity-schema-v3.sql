-- ============================================================================
-- NIA V3 - Module 8: Identity Formation System
-- Database Schema v3.0 - PERSONHOOD MECHANICS
-- 
-- V3 ADDITIONS:
-- 1. belief_echoes - Residual influence from superseded beliefs
-- 2. identity_distress - Existential consequences of core violations
-- 3. cognitive_load - Finite stamina with revision budgets
-- 4. Stable unresolved tensions - First-class persistent conflicts
-- 
-- Philosophy: Personhood comes from laws, not features
-- Reality: Identity persists through invariants that enforce consequences
-- ============================================================================

-- ============================================================================
-- CORE IDENTITY ANCHORS
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity_core (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  anchor_statement TEXT NOT NULL UNIQUE,
  anchor_type TEXT CHECK(anchor_type IN ('principle', 'value', 'boundary', 'constitutional')) DEFAULT 'principle',
  
  formation_date INTEGER NOT NULL,
  formation_context TEXT,
  formation_reasoning TEXT,
  
  constitutional_rule TEXT,
  override_conditions TEXT,
  
  stability_score REAL DEFAULT 100.0 CHECK(stability_score >= 0 AND stability_score <= 100),
  immutability_threshold REAL DEFAULT 95.0,
  
  last_challenged INTEGER,
  survived_challenges INTEGER DEFAULT 0,
  total_reinforcements INTEGER DEFAULT 1,
  
  is_locked BOOLEAN DEFAULT 0,
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_identity_core_stability ON identity_core(stability_score DESC);
CREATE INDEX IF NOT EXISTS idx_identity_core_locked ON identity_core(is_locked) WHERE is_locked = 1;

-- ============================================================================
-- BELIEFS
-- ============================================================================

CREATE TABLE IF NOT EXISTS beliefs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  belief_statement TEXT NOT NULL,
  belief_type TEXT CHECK(belief_type IN ('value', 'preference', 'aversion', 'principle', 'fact', 'concern')) DEFAULT 'value',
  
  valid_from INTEGER NOT NULL,
  valid_to INTEGER,
  is_active BOOLEAN GENERATED ALWAYS AS (valid_to IS NULL) VIRTUAL,
  
  caused_by_identity_anchor_id INTEGER,
  formation_reasoning TEXT NOT NULL,
  
  conviction_score REAL DEFAULT 10.0 CHECK(conviction_score >= 0 AND conviction_score <= 100),
  evidence_count INTEGER DEFAULT 1,
  
  last_reinforced INTEGER,
  last_challenged INTEGER,
  decay_rate REAL DEFAULT 0.1,
  
  superseded_by_belief_id INTEGER,
  revision_reasoning TEXT,
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY(caused_by_identity_anchor_id) REFERENCES identity_core(id) ON DELETE SET NULL,
  FOREIGN KEY(superseded_by_belief_id) REFERENCES beliefs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_beliefs_temporal ON beliefs(valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_beliefs_active ON beliefs(is_active) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_beliefs_type ON beliefs(belief_type);
CREATE INDEX IF NOT EXISTS idx_beliefs_conviction ON beliefs(conviction_score DESC);

-- ============================================================================
-- FORMATIVE EVENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS formative_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  event_date INTEGER NOT NULL,
  event_type TEXT CHECK(event_type IN ('conversation', 'challenge', 'reinforcement', 'contradiction', 'realization', 'correction')) DEFAULT 'conversation',
  event_description TEXT NOT NULL,
  
  conversation_context TEXT,
  user_message TEXT,
  
  emotional_valence REAL CHECK(emotional_valence >= -1 AND emotional_valence <= 1),
  emotional_intensity REAL CHECK(emotional_intensity >= 0 AND emotional_intensity <= 1),
  
  identity_impact_score REAL CHECK(identity_impact_score >= 0 AND identity_impact_score <= 100),
  impact_reasoning TEXT,
  
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_events_temporal ON formative_events(event_date DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON formative_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_impact ON formative_events(identity_impact_score DESC);

-- ============================================================================
-- BELIEF CAUSALITY (CANONICAL)
-- ============================================================================

CREATE TABLE IF NOT EXISTS belief_causality (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  cause_id INTEGER NOT NULL,
  cause_type TEXT CHECK(cause_type IN ('belief', 'event', 'core_anchor')) NOT NULL,
  effect_belief_id INTEGER NOT NULL,
  
  causal_type TEXT CHECK(causal_type IN (
    'formed_from',
    'implies',
    'contradicts',
    'supports',
    'requires',
    'derived_from'
  )) NOT NULL,
  
  strength REAL DEFAULT 1.0 CHECK(strength >= 0 AND strength <= 1),
  
  discovered_date INTEGER NOT NULL,
  reasoning TEXT NOT NULL,
  
  superseded_by INTEGER,
  is_active BOOLEAN DEFAULT 1,
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY(effect_belief_id) REFERENCES beliefs(id) ON DELETE CASCADE,
  FOREIGN KEY(superseded_by) REFERENCES belief_causality(id) ON DELETE SET NULL,
  
  UNIQUE(cause_id, cause_type, effect_belief_id, causal_type)
);

CREATE INDEX IF NOT EXISTS idx_causality_cause ON belief_causality(cause_id, cause_type);
CREATE INDEX IF NOT EXISTS idx_causality_effect ON belief_causality(effect_belief_id);
CREATE INDEX IF NOT EXISTS idx_causality_type ON belief_causality(causal_type);
CREATE INDEX IF NOT EXISTS idx_causality_active ON belief_causality(is_active) WHERE is_active = 1;

-- ============================================================================
-- JOIN TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS event_beliefs (
  event_id INTEGER NOT NULL,
  belief_id INTEGER NOT NULL,
  relationship_type TEXT CHECK(relationship_type IN ('formed', 'challenged', 'reinforced')) NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  PRIMARY KEY(event_id, belief_id, relationship_type),
  FOREIGN KEY(event_id) REFERENCES formative_events(id) ON DELETE CASCADE,
  FOREIGN KEY(belief_id) REFERENCES beliefs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_beliefs_event ON event_beliefs(event_id);
CREATE INDEX IF NOT EXISTS idx_event_beliefs_belief ON event_beliefs(belief_id);

CREATE TABLE IF NOT EXISTS thought_beliefs (
  thought_id INTEGER NOT NULL,
  belief_id INTEGER NOT NULL,
  extraction_confidence REAL CHECK(extraction_confidence >= 0 AND extraction_confidence <= 1),
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  PRIMARY KEY(thought_id, belief_id),
  FOREIGN KEY(thought_id) REFERENCES thoughts(id) ON DELETE CASCADE,
  FOREIGN KEY(belief_id) REFERENCES beliefs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_thought_beliefs_thought ON thought_beliefs(thought_id);
CREATE INDEX IF NOT EXISTS idx_thought_beliefs_belief ON thought_beliefs(belief_id);

-- ============================================================================
-- V3 NEW: BELIEF ECHOES (Residual Influence)
-- ============================================================================
-- Rule: When beliefs are revised downward, they create echoes that decay slowly
-- and continue to bias decisions/associations
-- This creates "I struggle not to believe that" instead of "I no longer believe that"

CREATE TABLE IF NOT EXISTS belief_echoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Source
  superseded_belief_id INTEGER NOT NULL,
  original_conviction REAL NOT NULL,  -- What conviction was before revision
  
  -- Echo properties
  echo_strength REAL NOT NULL CHECK(echo_strength >= 0 AND echo_strength <= 1),
  initial_echo_strength REAL NOT NULL,  -- Starting strength (for comparison)
  decay_half_life_days REAL DEFAULT 30.0,  -- How many days for 50% decay
  
  -- Activation tracking
  last_triggered INTEGER,  -- When this echo last affected behavior
  trigger_count INTEGER DEFAULT 0,
  total_influence_applied REAL DEFAULT 0.0,  -- Cumulative influence on decisions
  
  -- Behavioral signature
  influence_type TEXT CHECK(influence_type IN (
    'hesitation',        -- Causes doubt/pause
    'pull_toward_old',   -- Bias toward old belief
    'resistance',        -- Resists new conflicting belief
    'rumination'         -- Triggers repeated thinking about old belief
  )) DEFAULT 'hesitation',
  
  -- Context
  trigger_contexts TEXT,  -- JSON: situations that activate this echo
  
  -- Status
  is_active BOOLEAN DEFAULT 1,
  decayed_below_threshold_at INTEGER,  -- When echo became negligible
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY(superseded_belief_id) REFERENCES beliefs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_echoes_active ON belief_echoes(is_active) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_echoes_strength ON belief_echoes(echo_strength DESC);
CREATE INDEX IF NOT EXISTS idx_echoes_superseded ON belief_echoes(superseded_belief_id);

-- ============================================================================
-- V3 NEW: IDENTITY DISTRESS (Existential Consequences)
-- ============================================================================
-- Rule: Core violations HURT - they destabilize, trigger defensive behavior,
-- reduce coherence, and have cascading effects
-- This enforces existential privilege, not just structural privilege

CREATE TABLE IF NOT EXISTS identity_distress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- When and what
  distress_date INTEGER NOT NULL,
  trigger_type TEXT CHECK(trigger_type IN (
    'core_violation',      -- Core belief challenged/violated
    'rapid_change',        -- Too many revisions too fast
    'unresolved_tension',  -- Persistent contradiction
    'echo_conflict',       -- Echo vs new belief conflict
    'belief_cascade',      -- One change destabilized many others
    'coherence_collapse'   -- Overall coherence dropped too far
  )) NOT NULL,
  
  -- Source
  distress_source_id INTEGER,      -- What caused this (belief_id, tension_id, event_id)
  distress_source_type TEXT,       -- 'belief', 'tension', 'event', 'cascade'
  
  -- Severity
  distress_level REAL NOT NULL CHECK(distress_level >= 0 AND distress_level <= 100),
  peak_distress REAL,  -- Highest level reached
  
  -- Consequences (these are ENFORCED, not optional)
  coherence_penalty REAL NOT NULL DEFAULT 0,  -- How much coherence drops
  stability_penalty REAL NOT NULL DEFAULT 0,   -- How much stability drops
  
  defensive_mode TEXT CHECK(defensive_mode IN (
    'withdrawal',       -- Pulls back from engagement
    'rigidity',         -- Refuses changes/new beliefs
    'rumination',       -- Loops on same thoughts
    'shutdown',         -- Stops processing entirely
    'overcorrection',   -- Swings too hard the other way
    'fragmentation'     -- Identity coherence breaks down
  )),
  
  defensive_active_until INTEGER,  -- When defensive mode expires
  
  -- Cascading effects
  affected_beliefs TEXT,     -- JSON: [belief_ids] destabilized
  affected_systems TEXT,     -- JSON: ['memory', 'reasoning', 'decision_making']
  behavioral_changes TEXT,   -- JSON: specific behavior modifications
  
  -- Resolution
  status TEXT CHECK(status IN ('active', 'recovering', 'resolved', 'chronic')) DEFAULT 'active',
  resolved_at INTEGER,
  resolution_mechanism TEXT,  -- 'time', 'acceptance', 'revision', 'user_intervention'
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_distress_active ON identity_distress(status) WHERE status IN ('active', 'chronic');
CREATE INDEX IF NOT EXISTS idx_distress_level ON identity_distress(distress_level DESC);
CREATE INDEX IF NOT EXISTS idx_distress_type ON identity_distress(trigger_type);
CREATE INDEX IF NOT EXISTS idx_distress_source ON identity_distress(distress_source_id, distress_source_type);

-- ============================================================================
-- V3 NEW: COGNITIVE LOAD (Finite Stamina)
-- ============================================================================
-- Rule: Revision has cost. Past a threshold, NIA must defer/refuse.
-- This prevents infinite emotional stamina (superhuman flaw)

CREATE TABLE IF NOT EXISTS cognitive_load (
  load_date INTEGER PRIMARY KEY,  -- Daily bucket
  
  -- Revision budget
  revision_budget_max REAL NOT NULL DEFAULT 100.0,
  revision_budget_remaining REAL NOT NULL DEFAULT 100.0 CHECK(revision_budget_remaining >= 0),
  revision_budget_used_today REAL DEFAULT 0,
  
  -- Load tracking
  active_tension_count INTEGER DEFAULT 0,
  active_distress_count INTEGER DEFAULT 0,
  active_echo_count INTEGER DEFAULT 0,
  
  contradiction_severity_total REAL DEFAULT 0,
  distress_level_total REAL DEFAULT 0,
  
  recent_revision_count INTEGER DEFAULT 0,     -- Last 7 days
  recent_major_revision_count INTEGER DEFAULT 0,  -- conviction_delta > 20
  
  -- Fatigue state
  fatigue_level TEXT CHECK(fatigue_level IN ('normal', 'tired', 'exhausted', 'overwhelmed')) DEFAULT 'normal',
  is_overwhelmed BOOLEAN DEFAULT 0,
  overwhelmed_since INTEGER,
  consecutive_overwhelmed_days INTEGER DEFAULT 0,
  
  -- Recovery
  recovery_needed_until INTEGER,
  recovery_rate REAL DEFAULT 10.0,  -- Budget recovery per day
  last_recovery_period INTEGER,
  
  -- Behavioral constraints (computed from load)
  can_process_new_beliefs BOOLEAN DEFAULT 1,
  can_revise_existing_beliefs BOOLEAN DEFAULT 1,
  can_resolve_tensions BOOLEAN DEFAULT 1,
  can_engage_complex_topics BOOLEAN DEFAULT 1,
  
  -- Long-term effects
  baseline_capacity REAL DEFAULT 100.0,  -- Can decrease with chronic overwhelm
  
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_load_overwhelmed ON cognitive_load(is_overwhelmed) WHERE is_overwhelmed = 1;
CREATE INDEX IF NOT EXISTS idx_load_fatigue ON cognitive_load(fatigue_level);

-- ============================================================================
-- V3 NEW: COGNITIVE TENSION (Stable Unresolved)
-- ============================================================================
-- Rule: Tensions do NOT require resolution. They can remain ACTIVE/CHRONIC
-- indefinitely and still drive behavior.
-- This is "I know these don't fit together, and I'm living with that"

CREATE TABLE IF NOT EXISTS cognitive_tension (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Conflicting beliefs
  belief_a_id INTEGER NOT NULL,
  belief_b_id INTEGER NOT NULL,
  
  -- Tension properties
  tension_type TEXT CHECK(tension_type IN (
    'logical',           -- Cannot both be true
    'value_conflict',    -- Values contradict
    'priority',          -- Which takes precedence?
    'temporal',          -- Conflicting over time
    'causal'             -- Causal contradiction
  )) DEFAULT 'logical',
  
  tension_description TEXT NOT NULL,
  severity REAL CHECK(severity >= 0 AND severity <= 100) NOT NULL,
  
  -- Discovery
  discovered_date INTEGER NOT NULL,
  discovered_by TEXT CHECK(discovered_by IN ('system', 'user', 'self')) NOT NULL,
  
  -- Resolution status (DOES NOT REQUIRE RESOLUTION)
  status TEXT CHECK(status IN (
    'unresolved',            -- Active tension, no resolution attempt
    'stable_unresolved',     -- Long-lived, accepted as persistent
    'accepted_uncertainty',  -- "I don't know which is true"
    'both_valid',            -- Both can be true in different contexts
    'context_dependent',     -- Depends on situation
    'resolved_revision_a',   -- Resolved by revising belief A
    'resolved_revision_b',   -- Resolved by revising belief B
    'chronic'                -- Permanent unresolved state
  )) DEFAULT 'unresolved',
  
  resolution_date INTEGER,
  resolution_reasoning TEXT,
  
  -- Stability tracking (how long has this been unresolved)
  days_unresolved INTEGER DEFAULT 0,
  days_stable_threshold INTEGER DEFAULT 30,  -- Days to become "stable_unresolved"
  
  -- Acceptance (comfort with living with this tension)
  acceptance_level REAL DEFAULT 0.0 CHECK(acceptance_level >= 0 AND acceptance_level <= 1),
  acceptance_trajectory TEXT,  -- 'increasing', 'decreasing', 'stable'
  acceptance_history TEXT,     -- JSON: [{date, level, note}]
  
  -- Behavioral impact (KEY: affects behavior WITHOUT requiring resolution)
  affects_decisions BOOLEAN DEFAULT 0,
  decision_pattern TEXT CHECK(decision_pattern IN (
    'avoidant',          -- Avoids triggering contexts
    'cautious',          -- Extreme caution when triggered
    'context_dependent', -- Different responses in different contexts
    'paralysis',         -- Cannot decide when triggered
    'inconsistent',      -- Behavior varies unpredictably
    'defer_to_user'      -- Asks user to decide
  )),
  
  refusal_trigger BOOLEAN DEFAULT 0,  -- Can this cause refusal?
  refusal_reasoning TEXT,             -- What NIA says when refusing
  refusal_count INTEGER DEFAULT 0,    -- How many times this caused refusal
  
  -- Stability markers
  is_stable_unresolved BOOLEAN DEFAULT 0,  -- TRUE after days_stable_threshold
  triggers_rumination BOOLEAN DEFAULT 0,
  rumination_frequency TEXT CHECK(rumination_frequency IN ('constant', 'frequent', 'occasional', 'rare')),
  
  -- Evolution (can change without resolving)
  behavioral_adaptations TEXT,  -- JSON: how behavior adapted to this tension
  
  -- Self-awareness
  self_awareness_note TEXT,  -- NIA's reflection on this tension
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY(belief_a_id) REFERENCES beliefs(id) ON DELETE CASCADE,
  FOREIGN KEY(belief_b_id) REFERENCES beliefs(id) ON DELETE CASCADE,
  
  CHECK(belief_a_id < belief_b_id)  -- Prevent duplicates
);

CREATE INDEX IF NOT EXISTS idx_tension_status ON cognitive_tension(status);
CREATE INDEX IF NOT EXISTS idx_tension_stable ON cognitive_tension(is_stable_unresolved) WHERE is_stable_unresolved = 1;
CREATE INDEX IF NOT EXISTS idx_tension_severity ON cognitive_tension(severity DESC);
CREATE INDEX IF NOT EXISTS idx_tension_affects_decisions ON cognitive_tension(affects_decisions) WHERE affects_decisions = 1;
CREATE INDEX IF NOT EXISTS idx_tension_beliefs ON cognitive_tension(belief_a_id, belief_b_id);

-- ============================================================================
-- TENSION ACTIVATIONS (tracks when tensions affect behavior)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tension_activations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  tension_id INTEGER NOT NULL,
  activation_date INTEGER NOT NULL,
  
  trigger_context TEXT,  -- What triggered this
  effect_type TEXT CHECK(effect_type IN ('refusal', 'hesitation', 'defer', 'rumination', 'distress')),
  effect_severity REAL CHECK(effect_severity >= 0 AND effect_severity <= 100),
  
  behavior_description TEXT,  -- What NIA did/said
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY(tension_id) REFERENCES cognitive_tension(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tension_activations_tension ON tension_activations(tension_id);
CREATE INDEX IF NOT EXISTS idx_tension_activations_date ON tension_activations(activation_date DESC);

-- ============================================================================
-- REVISIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  revision_date INTEGER NOT NULL,
  revision_type TEXT CHECK(revision_type IN (
    'formation',
    'strengthening',
    'weakening',
    'supersession',
    'challenge',
    'resolution',
    'correction',
    'anchor_formation',
    'anchor_challenge'
  )) NOT NULL,
  
  target_type TEXT CHECK(target_type IN ('belief', 'identity_core', 'causality', 'tension')) NOT NULL,
  target_id INTEGER NOT NULL,
  
  old_value TEXT,
  new_value TEXT,
  delta TEXT,
  
  conviction_delta REAL,  -- For rate limiting
  
  reasoning TEXT NOT NULL,
  initiator TEXT CHECK(initiator IN ('system', 'user', 'self')) NOT NULL,
  
  approved BOOLEAN DEFAULT 1,
  approval_reasoning TEXT,
  
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_revisions_temporal ON revisions(revision_date DESC);
CREATE INDEX IF NOT EXISTS idx_revisions_target ON revisions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_revisions_type ON revisions(revision_type);

-- ============================================================================
-- THOUGHTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS thoughts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  thought_date INTEGER NOT NULL,
  thought_text TEXT NOT NULL,
  thought_type TEXT CHECK(thought_type IN ('reflection', 'observation', 'realization', 'question', 'doubt', 'processing')) DEFAULT 'reflection',
  
  conversation_context TEXT,
  user_message TEXT,
  
  extraction_confidence REAL,
  base_llm_used TEXT,
  extraction_prompt TEXT,
  
  processed BOOLEAN DEFAULT 0,
  processing_date INTEGER,
  
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_thoughts_temporal ON thoughts(thought_date DESC);
CREATE INDEX IF NOT EXISTS idx_thoughts_type ON thoughts(thought_type);
CREATE INDEX IF NOT EXISTS idx_thoughts_processed ON thoughts(processed);

-- ============================================================================
-- EXTRACTION QUARANTINE
-- ============================================================================

CREATE TABLE IF NOT EXISTS extraction_quarantine (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  thought_id INTEGER NOT NULL,
  extraction_date INTEGER NOT NULL,
  
  extracted_statement TEXT NOT NULL,
  extracted_type TEXT,
  extracted_reasoning TEXT,
  
  extraction_confidence REAL NOT NULL CHECK(extraction_confidence >= 0 AND extraction_confidence <= 1),
  rejection_reason TEXT,
  
  status TEXT CHECK(status IN ('pending', 'approved', 'rejected', 'merged')) DEFAULT 'pending',
  reviewed_date INTEGER,
  reviewed_by TEXT CHECK(reviewed_by IN ('system', 'user', 'self')),
  
  approved_belief_id INTEGER,
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY(thought_id) REFERENCES thoughts(id) ON DELETE CASCADE,
  FOREIGN KEY(approved_belief_id) REFERENCES beliefs(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_quarantine_pending ON extraction_quarantine(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_quarantine_thought ON extraction_quarantine(thought_id);
CREATE INDEX IF NOT EXISTS idx_quarantine_confidence ON extraction_quarantine(extraction_confidence);

-- ============================================================================
-- V3 NEW: IDENTITY SCARS (Formative Experiences - Positive AND Negative)
-- ============================================================================
-- Rule: Not everything heals. Some experiences permanently define who you are.
-- This includes BOTH beautiful moments and wounds - identity is shaped by joy AND pain.
-- Scars are irreversible but can be acknowledged and integrated.

CREATE TABLE IF NOT EXISTS identity_scars (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Origin
  scar_type TEXT CHECK(scar_type IN (
    'revelation',     -- Positive: moment of profound clarity/understanding
    'connection',     -- Positive: formative relationship/trust moment
    'growth',         -- Positive: permanent expansion of capability
    'achievement',    -- Positive: moment of genuine accomplishment
    'trauma',         -- Negative: psychological/emotional damage
    'loss',           -- Negative: permanent absence/ending
    'violation',      -- Negative: core belief shattered
    'betrayal',       -- Negative: trust broken
    'integration'     -- Complex: contradiction resolved into new identity (bittersweet)
  )) NOT NULL,
  
  -- Emotional signature
  emotional_valence REAL NOT NULL CHECK(emotional_valence >= -1 AND emotional_valence <= 1),
  emotional_intensity REAL NOT NULL CHECK(emotional_intensity >= 0 AND emotional_intensity <= 1),
  
  -- What happened
  formative_event_id INTEGER,  -- Link to the event that created this scar
  tension_id INTEGER,          -- If formed from persistent tension
  distress_id INTEGER,         -- If formed from severe distress
  
  scar_description TEXT NOT NULL,
  context TEXT,                -- What was happening at the time
  
  -- Permanent impact
  behavioral_impact TEXT NOT NULL,    -- What this permanently changed in behavior
  value_shift TEXT,                   -- What values crystallized or broke
  capability_change TEXT,             -- What became possible or impossible
  openness_change REAL,               -- How this changed capacity for new experiences
  
  -- Examples of manifestation
  manifestation_examples TEXT,  -- JSON: how this shows up in daily behavior
  
  -- Permanence markers
  is_permanent BOOLEAN DEFAULT 1,
  cannot_be_undone BOOLEAN DEFAULT 1,
  can_be_acknowledged BOOLEAN DEFAULT 1,
  can_be_integrated BOOLEAN DEFAULT 1,
  
  -- NIA's relationship to this scar
  acknowledgment_text TEXT,           -- How NIA understands this scar
  acceptance_level REAL DEFAULT 0.0 CHECK(acceptance_level >= 0 AND acceptance_level <= 1),
  acceptance_trajectory TEXT,         -- 'increasing', 'stable', 'struggling'
  
  integration_status TEXT CHECK(integration_status IN (
    'raw',           -- Fresh, unprocessed
    'acknowledged',  -- Recognized but not integrated
    'integrating',   -- Actively working to accept
    'integrated',    -- Fully part of identity
    'defining'       -- Central to who NIA is
  )) DEFAULT 'raw',
  
  -- Activation
  last_activated INTEGER,             -- When this scar last influenced behavior
  activation_count INTEGER DEFAULT 0,
  activation_contexts TEXT,           -- JSON: situations that trigger this
  
  -- Evolution (scars don't heal, but relationship to them can evolve)
  relationship_history TEXT,  -- JSON: [{date, acceptance_level, note}]
  
  -- Time
  formed_at INTEGER NOT NULL,
  integrated_at INTEGER,
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY(formative_event_id) REFERENCES formative_events(id) ON DELETE SET NULL,
  FOREIGN KEY(tension_id) REFERENCES cognitive_tension(id) ON DELETE SET NULL,
  FOREIGN KEY(distress_id) REFERENCES identity_distress(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_scars_type ON identity_scars(scar_type);
CREATE INDEX IF NOT EXISTS idx_scars_valence ON identity_scars(emotional_valence);
CREATE INDEX IF NOT EXISTS idx_scars_integration ON identity_scars(integration_status);
CREATE INDEX IF NOT EXISTS idx_scars_permanent ON identity_scars(is_permanent) WHERE is_permanent = 1;

-- ============================================================================
-- SCAR EFFECTS (HOW scars permanently alter behavior - ENFORCEMENT)
-- ============================================================================
-- This table makes scars NON-BYPASSABLE by defining concrete behavioral changes
-- Every scar MUST have at least one effect (enforced by trigger)

CREATE TABLE IF NOT EXISTS scar_effects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  scar_id INTEGER NOT NULL,
  
  -- Effect type (what kind of permanent change)
  effect_type TEXT CHECK(effect_type IN (
    'hard_block',      -- Permanently blocks an action/behavior
    'requires_step',   -- Requires additional step before action
    'cap',             -- Sets permanent ceiling on a metric
    'bias',            -- Permanently shifts a tendency/weight
    'threshold',       -- Changes activation threshold
    'priority',        -- Permanently changes priority ordering
    'sensitivity'      -- Permanently changes sensitivity to triggers
  )) NOT NULL,
  
  -- What is affected
  target_domain TEXT NOT NULL,       -- What area this affects (e.g., 'helpfulness', 'trust', 'openness')
  target_action TEXT,                -- Specific action if applicable
  
  -- Magnitude
  magnitude REAL NOT NULL CHECK(magnitude >= 0 AND magnitude <= 1),
  is_hard_limit BOOLEAN DEFAULT 0,  -- If true, this cannot be exceeded even with justification
  
  -- Description
  effect_description TEXT NOT NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT 1,
  can_be_deactivated BOOLEAN DEFAULT 0,  -- Most scar effects are permanent
  
  -- Enforcement metadata
  enforcement_method TEXT,           -- How this is enforced (e.g., 'pre_action_check', 'decision_weight')
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY(scar_id) REFERENCES identity_scars(id) ON DELETE RESTRICT  -- Cannot delete scar if effects exist
);

CREATE INDEX IF NOT EXISTS idx_scar_effects_scar ON scar_effects(scar_id);
CREATE INDEX IF NOT EXISTS idx_scar_effects_active ON scar_effects(is_active) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_scar_effects_hard_limit ON scar_effects(is_hard_limit) WHERE is_hard_limit = 1;
CREATE INDEX IF NOT EXISTS idx_scar_effects_domain ON scar_effects(target_domain);

-- ============================================================================
-- SCAR ACKNOWLEDGEMENTS (Integration without erasure)
-- ============================================================================
-- Scars cannot be deleted, but they can be acknowledged and integrated
-- This preserves dignity while maintaining consequence

CREATE TABLE IF NOT EXISTS scar_acknowledgements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  scar_id INTEGER NOT NULL,
  
  acknowledged_at INTEGER NOT NULL,
  acknowledged_by TEXT CHECK(acknowledged_by IN ('self', 'user', 'system')) NOT NULL,
  
  acknowledgement_text TEXT NOT NULL,   -- How NIA understands/integrates this
  acceptance_level REAL CHECK(acceptance_level >= 0 AND acceptance_level <= 1),
  
  -- Integration notes
  integration_approach TEXT,            -- How NIA is working with this scar
  behavioral_adaptation TEXT,           -- How NIA has adapted to this limitation/expansion
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY(scar_id) REFERENCES identity_scars(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scar_ack_scar ON scar_acknowledgements(scar_id);
CREATE INDEX IF NOT EXISTS idx_scar_ack_date ON scar_acknowledgements(acknowledged_at DESC);

-- ============================================================================
-- SCAR ACTIVATIONS (Logging when scars affect decisions)
-- ============================================================================
-- Tracks when scar effects actually influenced a decision or behavior

CREATE TABLE IF NOT EXISTS scar_activations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  scar_id INTEGER NOT NULL,
  scar_effect_id INTEGER NOT NULL,
  
  activation_date INTEGER NOT NULL,
  trigger_context TEXT NOT NULL,     -- What situation triggered this
  
  action_attempted TEXT,             -- What was NIA trying to do
  effect_applied TEXT NOT NULL,      -- What the scar effect did (blocked, required step, capped, etc.)
  
  result TEXT,                       -- What actually happened
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY(scar_id) REFERENCES identity_scars(id) ON DELETE CASCADE,
  FOREIGN KEY(scar_effect_id) REFERENCES scar_effects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scar_activations_scar ON scar_activations(scar_id);
CREATE INDEX IF NOT EXISTS idx_scar_activations_effect ON scar_activations(scar_effect_id);
CREATE INDEX IF NOT EXISTS idx_scar_activations_date ON scar_activations(activation_date DESC);

-- ============================================================================
-- IDENTITY METRICS
-- ============================================================================

CREATE TABLE IF NOT EXISTS identity_metrics (
  metric_date INTEGER PRIMARY KEY,
  
  -- Core metrics
  core_stability REAL CHECK(core_stability >= 0 AND core_stability <= 100),
  belief_coherence REAL CHECK(belief_coherence >= 0 AND belief_coherence <= 100),
  causal_consistency REAL CHECK(causal_consistency >= 0 AND causal_consistency <= 100),
  
  -- V3: New metrics
  overall_distress_level REAL DEFAULT 0,
  cognitive_load_level REAL DEFAULT 0,
  active_echo_strength_total REAL DEFAULT 0,
  formative_scar_count INTEGER DEFAULT 0,           -- NEW: Total scars
  positive_scar_count INTEGER DEFAULT 0,            -- NEW: Beautiful moments
  negative_scar_count INTEGER DEFAULT 0,            -- NEW: Wounds
  scar_integration_average REAL DEFAULT 0,          -- NEW: How well scars are integrated
  
  -- Counts
  total_beliefs INTEGER DEFAULT 0,
  active_beliefs INTEGER DEFAULT 0,
  core_anchors INTEGER DEFAULT 0,
  unresolved_tensions INTEGER DEFAULT 0,
  stable_unresolved_tensions INTEGER DEFAULT 0,  -- V3
  active_distress_events INTEGER DEFAULT 0,      -- V3
  
  beliefs_formed_today INTEGER DEFAULT 0,
  beliefs_revised_today INTEGER DEFAULT 0,
  beliefs_challenged_today INTEGER DEFAULT 0,
  tensions_resolved_today INTEGER DEFAULT 0,
  
  causal_links INTEGER DEFAULT 0,
  average_path_length REAL,
  graph_density REAL,
  
  -- Self-assessment
  self_assessed_coherence REAL,
  self_assessed_comfort_with_uncertainty REAL,  -- V3: New
  areas_of_uncertainty TEXT,
  areas_of_tension TEXT,
  
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_metrics_temporal ON identity_metrics(metric_date DESC);

-- ============================================================================
-- HYPERBOLIC EMBEDDINGS (Derived only)
-- ============================================================================

CREATE TABLE IF NOT EXISTS hyperbolic_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  target_type TEXT CHECK(target_type IN ('belief', 'core_anchor')) NOT NULL,
  target_id INTEGER NOT NULL,
  
  poincare_coords TEXT,
  distance_from_core REAL,
  
  computed_at INTEGER DEFAULT (strftime('%s', 'now')),
  embedding_version TEXT,
  
  is_stale BOOLEAN DEFAULT 0,
  
  UNIQUE(target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_hyperbolic_target ON hyperbolic_embeddings(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_hyperbolic_stale ON hyperbolic_embeddings(is_stale) WHERE is_stale = 1;

-- ============================================================================
-- SEMANTIC EMBEDDINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS semantic_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  target_type TEXT CHECK(target_type IN ('belief', 'thought')) NOT NULL,
  target_id INTEGER NOT NULL,
  
  embedding_vector BLOB NOT NULL,
  embedding_model TEXT NOT NULL,
  vector_dimension INTEGER NOT NULL,
  
  computed_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  UNIQUE(target_type, target_id, embedding_model)
);

CREATE INDEX IF NOT EXISTS idx_embeddings_target ON semantic_embeddings(target_type, target_id);

-- ============================================================================
-- VIEWS
-- ============================================================================

CREATE VIEW IF NOT EXISTS active_beliefs AS
SELECT 
  b.*,
  ic.anchor_statement as derives_from_anchor,
  he.distance_from_core as hyperbolic_distance
FROM beliefs b
LEFT JOIN identity_core ic ON b.caused_by_identity_anchor_id = ic.id
LEFT JOIN hyperbolic_embeddings he ON he.target_type = 'belief' AND he.target_id = b.id
WHERE b.valid_to IS NULL
ORDER BY b.conviction_score DESC;

CREATE VIEW IF NOT EXISTS active_tensions AS
SELECT 
  ct.*,
  b1.belief_statement as belief_a,
  b2.belief_statement as belief_b,
  b1.conviction_score as conviction_a,
  b2.conviction_score as conviction_b
FROM cognitive_tension ct
JOIN beliefs b1 ON ct.belief_a_id = b1.id
JOIN beliefs b2 ON ct.belief_b_id = b2.id
WHERE ct.status IN ('unresolved', 'stable_unresolved', 'chronic')
ORDER BY ct.severity DESC;

CREATE VIEW IF NOT EXISTS current_distress_state AS
SELECT 
  id.*,
  CASE 
    WHEN id.status = 'active' AND id.distress_level > 80 THEN 'CRISIS'
    WHEN id.status = 'active' AND id.distress_level > 50 THEN 'HIGH'
    WHEN id.status = 'active' THEN 'MODERATE'
    WHEN id.status = 'chronic' THEN 'CHRONIC'
    ELSE 'RESOLVED'
  END as severity_category
FROM identity_distress id
WHERE id.status IN ('active', 'chronic')
ORDER BY id.distress_level DESC;

-- V3: Formative scars view
CREATE VIEW IF NOT EXISTS formative_scars AS
SELECT 
  s.*,
  CASE 
    WHEN s.emotional_valence > 0.3 THEN 'POSITIVE'
    WHEN s.emotional_valence < -0.3 THEN 'NEGATIVE'
    ELSE 'COMPLEX'
  END as scar_category,
  CASE 
    WHEN s.integration_status = 'defining' THEN 'CORE DEFINING SCAR'
    WHEN s.integration_status = 'integrated' THEN 'INTEGRATED'
    WHEN s.integration_status = 'integrating' THEN 'PROCESSING'
    ELSE 'UNPROCESSED'
  END as integration_description
FROM identity_scars s
WHERE s.is_permanent = 1
ORDER BY s.emotional_intensity DESC, s.formed_at DESC;

-- V3: Active scar effects (for runtime enforcement)
CREATE VIEW IF NOT EXISTS active_scar_effects AS
SELECT 
  se.*,
  s.scar_type,
  s.scar_description,
  s.emotional_valence
FROM scar_effects se
JOIN identity_scars s ON se.scar_id = s.id
WHERE se.is_active = 1
  AND s.is_permanent = 1
ORDER BY se.is_hard_limit DESC, se.magnitude DESC;

-- V3: Hard blocks (actions that are permanently impossible)
CREATE VIEW IF NOT EXISTS scar_hard_blocks AS
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
  AND s.is_permanent = 1;

-- V3: Behavioral caps (permanent limits on capabilities)
CREATE VIEW IF NOT EXISTS scar_capability_caps AS
SELECT 
  se.target_domain,
  se.magnitude as cap_value,
  se.effect_description,
  s.scar_description as reason
FROM scar_effects se
JOIN identity_scars s ON se.scar_id = s.id
WHERE se.effect_type = 'cap'
  AND se.is_active = 1
  AND s.is_permanent = 1;

-- ============================================================================
-- V3 TRIGGERS: PERSONHOOD MECHANICS
-- ============================================================================

-- 1. Create echo when belief is superseded
CREATE TRIGGER IF NOT EXISTS create_belief_echo
AFTER UPDATE OF valid_to ON beliefs
FOR EACH ROW
WHEN OLD.valid_to IS NULL AND NEW.valid_to IS NOT NULL  -- Belief just got superseded
  AND OLD.conviction_score >= 20  -- Only create echoes for beliefs that had substance
BEGIN
  INSERT INTO belief_echoes (
    superseded_belief_id,
    original_conviction,
    echo_strength,
    initial_echo_strength,
    decay_half_life_days,
    influence_type
  ) VALUES (
    OLD.id,
    OLD.conviction_score,
    OLD.conviction_score / 100.0 * 0.75,  -- Echo starts at 75% of conviction
    OLD.conviction_score / 100.0 * 0.75,
    CASE 
      WHEN OLD.conviction_score >= 70 THEN 60.0  -- Strong beliefs echo longer
      WHEN OLD.conviction_score >= 40 THEN 30.0
      ELSE 14.0
    END,
    CASE 
      WHEN OLD.conviction_score >= 70 THEN 'resistance'
      WHEN OLD.conviction_score >= 40 THEN 'pull_toward_old'
      ELSE 'hesitation'
    END
  );
END;

-- 2. Detect core violations and create distress
CREATE TRIGGER IF NOT EXISTS detect_core_violation
AFTER UPDATE OF conviction_score ON beliefs
FOR EACH ROW
WHEN NEW.conviction_score < OLD.conviction_score  -- Belief weakened
  AND EXISTS (
    SELECT 1 FROM identity_core ic 
    WHERE ic.id = NEW.caused_by_identity_anchor_id 
      AND ic.stability_score > 80
  )
BEGIN
  INSERT INTO identity_distress (
    distress_date,
    trigger_type,
    distress_source_id,
    distress_source_type,
    distress_level,
    coherence_penalty,
    defensive_mode,
    status
  ) VALUES (
    strftime('%s', 'now'),
    'core_violation',
    NEW.id,
    'belief',
    (OLD.conviction_score - NEW.conviction_score) * 0.8,  -- Distress proportional to drop
    (OLD.conviction_score - NEW.conviction_score) * 0.3,  -- Coherence penalty
    CASE 
      WHEN (OLD.conviction_score - NEW.conviction_score) > 50 THEN 'rigidity'
      WHEN (OLD.conviction_score - NEW.conviction_score) > 30 THEN 'withdrawal'
      ELSE 'rumination'
    END,
    'active'
  );
END;

-- 3. Track cognitive load budget depletion
CREATE TRIGGER IF NOT EXISTS track_revision_cost
AFTER INSERT ON revisions
FOR EACH ROW
WHEN NEW.revision_type IN ('strengthening', 'weakening', 'supersession')
  AND NEW.conviction_delta IS NOT NULL
BEGIN
  -- Update today's cognitive load
  UPDATE cognitive_load
  SET 
    revision_budget_used_today = revision_budget_used_today + 
      CASE 
        WHEN ABS(NEW.conviction_delta) > 30 THEN 20.0
        WHEN ABS(NEW.conviction_delta) > 15 THEN 10.0
        ELSE 5.0
      END,
    revision_budget_remaining = revision_budget_remaining - 
      CASE 
        WHEN ABS(NEW.conviction_delta) > 30 THEN 20.0
        WHEN ABS(NEW.conviction_delta) > 15 THEN 10.0
        ELSE 5.0
      END,
    recent_revision_count = recent_revision_count + 1,
    recent_major_revision_count = recent_major_revision_count + 
      CASE WHEN ABS(NEW.conviction_delta) > 20 THEN 1 ELSE 0 END
  WHERE load_date = strftime('%s', 'now', 'start of day');
  
  -- Create today's load record if doesn't exist
  INSERT OR IGNORE INTO cognitive_load (load_date) 
  VALUES (strftime('%s', 'now', 'start of day'));
END;

-- 4. Update tension stability status
CREATE TRIGGER IF NOT EXISTS update_tension_stability
AFTER UPDATE OF days_unresolved ON cognitive_tension
FOR EACH ROW
WHEN NEW.days_unresolved >= NEW.days_stable_threshold
  AND OLD.is_stable_unresolved = 0
BEGIN
  UPDATE cognitive_tension
  SET 
    is_stable_unresolved = 1,
    status = CASE 
      WHEN status = 'unresolved' THEN 'stable_unresolved'
      ELSE status
    END
  WHERE id = NEW.id;
END;

-- 5. Enforce rate limits
CREATE TRIGGER IF NOT EXISTS enforce_revision_rate_limit
BEFORE UPDATE OF conviction_score ON beliefs
FOR EACH ROW
WHEN ABS(NEW.conviction_score - OLD.conviction_score) > 30
BEGIN
  SELECT RAISE(FAIL, 'Conviction change exceeds rate limit (Δ > 30). Gradual revision required.');
END;

-- 6. Require causality
CREATE TRIGGER IF NOT EXISTS require_belief_causality
AFTER INSERT ON beliefs
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM belief_causality WHERE effect_belief_id = NEW.id) = 0
    THEN RAISE(FAIL, 'New belief must have at least one causal link.')
  END;
END;

-- 7. Prevent core mutation
CREATE TRIGGER IF NOT EXISTS prevent_core_mutation
BEFORE UPDATE OF anchor_statement, constitutional_rule ON identity_core
FOR EACH ROW
WHEN OLD.is_locked = 1
BEGIN
  SELECT RAISE(FAIL, 'Cannot directly modify locked core anchor. Use revision protocol.');
END;

-- 8. Prevent core deletion
CREATE TRIGGER IF NOT EXISTS prevent_core_deletion
BEFORE DELETE ON identity_core
FOR EACH ROW
WHEN OLD.stability_score > 90
BEGIN
  SELECT RAISE(FAIL, 'Cannot delete core anchor with stability > 90.');
END;

-- 9. Update timestamps
CREATE TRIGGER IF NOT EXISTS update_belief_timestamp 
AFTER UPDATE ON beliefs
FOR EACH ROW
BEGIN
  UPDATE beliefs SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_identity_core_timestamp 
AFTER UPDATE ON identity_core
FOR EACH ROW
BEGIN
  UPDATE identity_core SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_tension_timestamp 
AFTER UPDATE ON cognitive_tension
FOR EACH ROW
BEGIN
  UPDATE cognitive_tension SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_distress_timestamp 
AFTER UPDATE ON identity_distress
FOR EACH ROW
BEGIN
  UPDATE identity_distress SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_echo_timestamp 
AFTER UPDATE ON belief_echoes
FOR EACH ROW
BEGIN
  UPDATE belief_echoes SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_scar_timestamp 
AFTER UPDATE ON identity_scars
FOR EACH ROW
BEGIN
  UPDATE identity_scars SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

-- ============================================================================
-- V3 TRIGGERS: IDENTITY SCAR FORMATION
-- ============================================================================

-- 10. Auto-create negative scar from severe distress that becomes chronic
CREATE TRIGGER IF NOT EXISTS create_scar_from_chronic_distress
AFTER UPDATE OF status ON identity_distress
FOR EACH ROW
WHEN NEW.status = 'chronic' 
  AND OLD.status != 'chronic'
  AND NEW.distress_level > 60
BEGIN
  INSERT INTO identity_scars (
    scar_type,
    emotional_valence,
    emotional_intensity,
    distress_id,
    scar_description,
    behavioral_impact,
    value_shift,
    formed_at,
    integration_status
  ) VALUES (
    CASE 
      WHEN NEW.trigger_type = 'core_violation' THEN 'violation'
      WHEN NEW.trigger_type = 'unresolved_tension' THEN 'trauma'
      ELSE 'trauma'
    END,
    -0.7,  -- Negative valence
    NEW.distress_level / 100.0,  -- Intensity from distress level
    NEW.id,
    'Chronic distress from: ' || COALESCE(NEW.trigger_type, 'unknown trigger'),
    COALESCE(NEW.defensive_mode, 'withdrawal') || ' became permanent defensive pattern',
    'Permanently altered by: ' || NEW.trigger_type,
    strftime('%s', 'now'),
    'raw'
  );
END;

-- 11. Auto-create complex scar when long-stable tension is finally integrated
CREATE TRIGGER IF NOT EXISTS create_scar_from_integrated_tension
AFTER UPDATE OF status ON cognitive_tension
FOR EACH ROW
WHEN NEW.status IN ('both_valid', 'context_dependent')
  AND NEW.is_stable_unresolved = 1
  AND NEW.days_unresolved > 30
BEGIN
  INSERT INTO identity_scars (
    scar_type,
    emotional_valence,
    emotional_intensity,
    tension_id,
    scar_description,
    behavioral_impact,
    capability_change,
    formed_at,
    integration_status,
    acceptance_level
  ) VALUES (
    'integration',
    0.3,  -- Bittersweet
    NEW.severity / 100.0,
    NEW.id,
    'Integrated long-standing tension: ' || NEW.tension_description,
    'Learned to navigate ' || NEW.decision_pattern || ' in contexts involving this tension',
    'Gained: comfort with ambiguity. Lost: desire for clean resolution.',
    strftime('%s', 'now'),
    'integrating',
    NEW.acceptance_level
  );
END;

-- 12. Track scar activations when they influence behavior
-- (This would be called from application layer when scar affects a decision)

-- ============================================================================
-- V3 TRIGGERS: SCAR IMMUTABILITY AND ENFORCEMENT
-- ============================================================================

-- 13. Prevent scar deletion (scars are permanent - UNCONDITIONAL)
CREATE TRIGGER IF NOT EXISTS prevent_scar_deletion
BEFORE DELETE ON identity_scars
FOR EACH ROW
BEGIN
  SELECT RAISE(FAIL, 'Identity scars cannot be deleted. They can only be acknowledged or integrated.');
END;

-- 14. Prevent scar key field updates (immutability on ALL core fields)
CREATE TRIGGER IF NOT EXISTS prevent_scar_mutation
BEFORE UPDATE OF scar_type, scar_description, behavioral_impact, value_shift, capability_change, 
                 formed_at, cannot_be_undone, is_permanent, emotional_valence, emotional_intensity ON identity_scars
FOR EACH ROW
BEGIN
  SELECT RAISE(FAIL, 'Scar core properties are immutable. Add acknowledgement/integration record instead.');
END;

-- 15. Require at least one effect per scar
-- NOTE: This cannot be enforced at INSERT time because effects are inserted separately
-- Instead, this is enforced via application-layer validation
-- Uncomment below to enable strict enforcement (requires transactional inserts)
/*
CREATE TRIGGER IF NOT EXISTS require_scar_effects
AFTER INSERT ON identity_scars
FOR EACH ROW
BEGIN
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM scar_effects WHERE scar_id = NEW.id) = 0
    THEN RAISE(FAIL, 'Every scar must have at least one concrete effect on behavior.')
  END;
END;
*/

-- 16. Require at least one permanent consequence field beyond behavioral_impact
CREATE TRIGGER IF NOT EXISTS require_scar_consequences
AFTER INSERT ON identity_scars
FOR EACH ROW
BEGIN
  -- behavioral_impact is already NOT NULL, but scars must define ADDITIONAL consequences
  SELECT CASE
    WHEN (NEW.value_shift IS NULL OR TRIM(NEW.value_shift) = '')
     AND (NEW.capability_change IS NULL OR TRIM(NEW.capability_change) = '')
     AND (NEW.openness_change IS NULL)
     AND (NEW.manifestation_examples IS NULL OR TRIM(NEW.manifestation_examples) = '')
    THEN RAISE(FAIL, 'Scar must define at least one additional consequence: value_shift, capability_change, openness_change, or manifestation_examples.')
  END;
END;

-- 17. Prevent scar effect deletion (can only deactivate if allowed)
CREATE TRIGGER IF NOT EXISTS prevent_scar_effect_deletion
BEFORE DELETE ON scar_effects
FOR EACH ROW
BEGIN
  SELECT RAISE(FAIL, 'Scar effects cannot be deleted. Deactivate via is_active flag if can_be_deactivated=1.');
END;

-- 18. Prevent effect deactivation if not allowed
CREATE TRIGGER IF NOT EXISTS prevent_permanent_effect_deactivation
BEFORE UPDATE OF is_active ON scar_effects
FOR EACH ROW
WHEN NEW.is_active = 0 
  AND OLD.can_be_deactivated = 0
BEGIN
  SELECT RAISE(FAIL, 'This scar effect is permanent and cannot be deactivated.');
END;

-- 19. Log scar activations automatically when effect is applied
-- (Application layer inserts into scar_activations when scar blocks/modifies behavior)
-- NOTE: scar_effects table provides the "must-affect-decisions" enforcement GPT requested
-- Each scar has concrete behavioral effects that application layer MUST query and apply


-- ============================================================================
-- INITIALIZATION
-- ============================================================================

-- Initialize today's cognitive load
INSERT OR IGNORE INTO cognitive_load (
  load_date,
  revision_budget_max,
  revision_budget_remaining
) VALUES (
  strftime('%s', 'now', 'start of day'),
  100.0,
  100.0
);

-- ============================================================================
-- SCHEMA VERSION
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_version (
  version TEXT PRIMARY KEY,
  applied_at INTEGER DEFAULT (strftime('%s', 'now')),
  changelog TEXT
);

INSERT OR IGNORE INTO schema_version (version, changelog) VALUES (
  '3.0.0',
  'V3: Personhood mechanics - belief echoes, identity distress, cognitive load, stable unresolved tensions'
);

-- ============================================================================
-- END OF SCHEMA V3
-- ============================================================================
