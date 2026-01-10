.dbconfig defensive off
BEGIN;
PRAGMA writable_schema = on;
PRAGMA foreign_keys = off;
PRAGMA encoding = 'UTF-8';
PRAGMA page_size = '4096';
PRAGMA auto_vacuum = '0';
PRAGMA user_version = '0';
PRAGMA application_id = '0';
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE beliefs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    belief_statement TEXT NOT NULL,
    belief_type TEXT DEFAULT 'value',
    conviction_score REAL DEFAULT 50,
    evidence_count INTEGER DEFAULT 1,
    valid_from INTEGER NOT NULL,
    valid_to INTEGER,
    is_active BOOLEAN GENERATED ALWAYS AS (valid_to IS NULL) VIRTUAL,
    caused_by_identity_anchor_id INTEGER,
    formation_reasoning TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
, last_reinforced INTEGER, last_challenged INTEGER, times_reinforced INTEGER DEFAULT 0, times_challenged INTEGER DEFAULT 0, confidence_trend TEXT DEFAULT 'stable', subject TEXT DEFAULT 'user', belief_class TEXT, decay_rate REAL DEFAULT 0.1, updated_at INTEGER, superseded_by_belief_id INTEGER, revision_reasoning TEXT, maturity_state TEXT DEFAULT 'probation', probation_until INTEGER, correction_count INTEGER DEFAULT 0, last_correction INTEGER, reinforcement_count INTEGER DEFAULT 1, vector_id TEXT, embedding_model TEXT DEFAULT 'poincare-v1', poincare_norm REAL, hierarchy_level INTEGER);
CREATE TABLE identity_scars (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scar_type TEXT,
    scar_description TEXT,
    emotional_valence REAL,
    emotional_intensity REAL,
    is_permanent INTEGER DEFAULT 1,
    integration_status TEXT DEFAULT 'integrated',
    formed_at INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
, behavioral_impact TEXT, value_shift TEXT, capability_change TEXT, acceptance_level REAL DEFAULT 0.0);
CREATE TABLE thinking_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    user_message TEXT NOT NULL,
    thinking_content TEXT NOT NULL,
    thinking_length INTEGER,
    response_summary TEXT,
    processed_for_beliefs INTEGER DEFAULT 0,
    model_used TEXT
, processed_at INTEGER, beliefs_extracted INTEGER DEFAULT 0);
CREATE TABLE identity_anchors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anchor_category TEXT NOT NULL,
    anchor_statement TEXT NOT NULL UNIQUE,
    anchor_priority INTEGER DEFAULT 10,
    immutable INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    notes TEXT
);
CREATE TABLE belief_extraction_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thinking_log_id INTEGER NOT NULL,
        extraction_timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        raw_llm_output TEXT,
        candidates_extracted INTEGER,
        candidates_valid INTEGER,
        candidates_rejected INTEGER,
        beliefs_created INTEGER,
        beliefs_updated INTEGER,
        conflicts_detected INTEGER,
        processing_time_ms INTEGER,
        errors TEXT, pass_a_output TEXT, pass_b_output TEXT, subjects_extracted INTEGER DEFAULT 0,
        FOREIGN KEY (thinking_log_id) REFERENCES thinking_log(id)
      );
CREATE TABLE belief_causality (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        belief_id INTEGER NOT NULL,
        thinking_log_id INTEGER NOT NULL,
        causality_type TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (belief_id) REFERENCES beliefs(id),
        FOREIGN KEY (thinking_log_id) REFERENCES thinking_log(id)
      );
CREATE TABLE concepts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  concept_name TEXT UNIQUE NOT NULL, -- "memory_safety", "bugs", "trust"
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  last_updated INTEGER DEFAULT (strftime('%s', 'now'))
);
CREATE TABLE concept_connotations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  concept_id INTEGER NOT NULL,
  
  -- Emotional properties
  valence REAL DEFAULT 0.0,           -- -1.0 (negative) to +1.0 (positive)
  intensity REAL DEFAULT 0.5,         -- 0.0 (weak) to 1.0 (strong)
  
  -- Emotion tags (JSON array)
  emotion_tags TEXT,                  -- ["safety", "anxiety", "warmth"]
  
  -- Origin and stability
  origin TEXT NOT NULL,               -- 'experience' | 'user' | 'self' | 'observation'
  stability TEXT DEFAULT 'transient', -- 'transient' | 'persistent'
  
  -- Temporal tracking
  formed_at INTEGER DEFAULT (strftime('%s', 'now')),
  reinforced_count INTEGER DEFAULT 0,
  last_reinforced INTEGER,
  decay_rate REAL DEFAULT 0.01,      -- How fast it fades without reinforcement
  
  -- Contextual
  context_note TEXT,                  -- Why this connotation exists
  
  FOREIGN KEY (concept_id) REFERENCES concepts(id)
);
CREATE TABLE belief_concepts (
  belief_id INTEGER NOT NULL,
  concept_id INTEGER NOT NULL,
  weight REAL DEFAULT 1.0,           -- How strongly belief relates to concept
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  PRIMARY KEY (belief_id, concept_id),
  FOREIGN KEY (belief_id) REFERENCES beliefs(id),
  FOREIGN KEY (concept_id) REFERENCES concepts(id)
);
CREATE TABLE connotation_evolution (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  concept_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,          -- 'reinforced' | 'challenged' | 'decayed' | 'formed'
  valence_before REAL,
  valence_after REAL,
  intensity_before REAL,
  intensity_after REAL,
  trigger_source TEXT,               -- What caused the change
  timestamp INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY (concept_id) REFERENCES concepts(id)
);
CREATE TABLE cognitive_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        energy INTEGER DEFAULT 100,           -- 0-100
        state TEXT DEFAULT 'normal',          -- normal, tired, overwhelmed, recovering
        extractions_today INTEGER DEFAULT 0,
        extractions_declined INTEGER DEFAULT 0,
        last_extraction INTEGER,
        last_recovery INTEGER,
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      , revision_budget_used_today INTEGER DEFAULT 0, behavioral_impact TEXT, load_date TEXT);
CREATE TABLE extraction_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thinking_log_id INTEGER NOT NULL,
        reason TEXT NOT NULL,                 -- deferred, low_energy, identity_sensitive
        priority INTEGER DEFAULT 5,           -- 1-10 (10 = highest)
        estimated_cost INTEGER,
        identity_impact TEXT,                 -- low, medium, high
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        processed_at INTEGER,
        FOREIGN KEY (thinking_log_id) REFERENCES thinking_log(id)
      );
CREATE TABLE cognitive_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,             -- declined, deferred, overwhelmed, recovered
        thinking_log_id INTEGER,
        energy_before INTEGER,
        energy_after INTEGER,
        reason TEXT,
        timestamp INTEGER DEFAULT (strftime('%s', 'now'))
      );
CREATE TABLE cognitive_load (
        load_date TEXT PRIMARY KEY,
        revision_budget_max INTEGER DEFAULT 100,
        revision_budget_remaining INTEGER DEFAULT 100,
        last_updated INTEGER
      , revision_budget_used_today INTEGER DEFAULT 0, active_tension_count INTEGER DEFAULT 0, active_distress_count INTEGER DEFAULT 0, fatigue_level REAL DEFAULT 0.0, is_overwhelmed INTEGER DEFAULT 0, can_process_new_beliefs INTEGER DEFAULT 1, can_revise_existing_beliefs INTEGER DEFAULT 1, can_resolve_tensions INTEGER DEFAULT 1, can_engage_complex_topics INTEGER DEFAULT 1);
CREATE TABLE identity_core (
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
CREATE TABLE formative_events (
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
CREATE TABLE event_beliefs (
  event_id INTEGER NOT NULL,
  belief_id INTEGER NOT NULL,
  relationship_type TEXT CHECK(relationship_type IN ('formed', 'challenged', 'reinforced')) NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  PRIMARY KEY(event_id, belief_id, relationship_type),
  FOREIGN KEY(event_id) REFERENCES formative_events(id) ON DELETE CASCADE,
  FOREIGN KEY(belief_id) REFERENCES beliefs(id) ON DELETE CASCADE
);
CREATE TABLE thought_beliefs (
  thought_id INTEGER NOT NULL,
  belief_id INTEGER NOT NULL,
  extraction_confidence REAL CHECK(extraction_confidence >= 0 AND extraction_confidence <= 1),
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  PRIMARY KEY(thought_id, belief_id),
  FOREIGN KEY(thought_id) REFERENCES thoughts(id) ON DELETE CASCADE,
  FOREIGN KEY(belief_id) REFERENCES beliefs(id) ON DELETE CASCADE
);
CREATE TABLE belief_echoes (
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
CREATE TABLE identity_distress (
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
CREATE TABLE cognitive_tension (
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
CREATE TABLE tension_activations (
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
CREATE TABLE revisions (
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
CREATE TABLE thoughts (
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
CREATE TABLE extraction_quarantine (
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
CREATE TABLE scar_effects (
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
CREATE TABLE scar_acknowledgements (
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
CREATE TABLE scar_activations (
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
CREATE TABLE identity_metrics (
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
CREATE TABLE hyperbolic_embeddings (
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
CREATE TABLE semantic_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  target_type TEXT CHECK(target_type IN ('belief', 'thought')) NOT NULL,
  target_id INTEGER NOT NULL,
  
  embedding_vector BLOB NOT NULL,
  embedding_model TEXT NOT NULL,
  vector_dimension INTEGER NOT NULL,
  
  computed_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  UNIQUE(target_type, target_id, embedding_model)
);
CREATE TABLE schema_version (
  version TEXT PRIMARY KEY,
  applied_at INTEGER DEFAULT (strftime('%s', 'now')),
  changelog TEXT
);
CREATE TABLE daemon_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  uptime_ms INTEGER,
  status TEXT CHECK(status IN ('online', 'offline', 'crashed')) DEFAULT 'online',
  crash_reason TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);
CREATE TABLE conversation_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Boundaries
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  is_active BOOLEAN DEFAULT 1,
  
  -- Context
  daemon_session_id INTEGER,
  session_trigger TEXT CHECK(session_trigger IN (
    'daemon_start',
    'user_initiated', 
    'timeout_boundary',
    'explicit_new_chat'
  )) DEFAULT 'user_initiated',
  
  -- Temporal awareness
  date_bucket TEXT NOT NULL,              -- '2025-01-03'
  time_of_day TEXT CHECK(time_of_day IN ('morning', 'afternoon', 'evening', 'night')),
  day_of_week TEXT,
  
  -- Summary (generated when session ends)
  topic_summary TEXT,
  topics_json TEXT,                       -- JSON: ['whales', 'ocean']
  key_moments_json TEXT,                  -- JSON: [turn_ids]
  
  -- Metrics
  turn_count INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  memory_commits INTEGER DEFAULT 0,
  belief_formations INTEGER DEFAULT 0,
  corrections_made INTEGER DEFAULT 0,
  
  FOREIGN KEY(daemon_session_id) REFERENCES daemon_sessions(id)
);
CREATE TABLE conversation_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Session membership
  session_id INTEGER NOT NULL,
  turn_number INTEGER NOT NULL,
  
  -- Content
  role TEXT CHECK(role IN ('user', 'assistant', 'system')) NOT NULL,
  message TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  response_time_ms INTEGER,
  
  -- Links to other systems
  thinking_log_id INTEGER,
  
  -- Flags
  is_memory_anchor BOOLEAN DEFAULT 0,     -- Manual commit happened
  is_correction BOOLEAN DEFAULT 0,        -- Correction happened
  spawned_memories INTEGER DEFAULT 0,
  spawned_beliefs INTEGER DEFAULT 0,
  
  -- Metadata
  tokens_in INTEGER,
  tokens_out INTEGER,
  model_used TEXT,
  
  FOREIGN KEY(session_id) REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(thinking_log_id) REFERENCES thinking_log(id) ON DELETE SET NULL
);
CREATE TABLE "memory_commits_old" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Content
  memory_statement TEXT NOT NULL,
  memory_type TEXT CHECK(memory_type IN (
    'fact',              -- Direct fact
    'preference',        -- User preference
    'event',            -- Something that happened
    'realization',      -- Insight/learning
    'context',          -- Background info
    'observation'       -- Neutral observation
  )) NOT NULL,
  
  -- Temporal context
  committed_at INTEGER NOT NULL,
  temporal_bucket TEXT NOT NULL,           -- '2025-01-03'
  relative_time_description TEXT,          -- "3 days ago"
  
  -- Source tracking (lineage)
  source_session_id INTEGER,
  source_turn_id INTEGER,
  source_thinking_log_id INTEGER,
  
  -- How this memory formed
  commit_trigger TEXT CHECK(commit_trigger IN (
    'user_manual',       -- "hey nia remember..."
    'auto_extract',      -- Belief extraction
    'nia_decision',      -- Autonomous decision
    'threshold',         -- Repeated enough
    'manual_button'      -- UI button
  )) NOT NULL,
  
  formation_context TEXT,
  
  -- Semantic associations (fast filtering)
  topics_json TEXT,                        -- JSON: ['whales']
  subjects_json TEXT,                      -- JSON: ['user']
  related_memory_ids TEXT,                 -- JSON: [45, 67]
  
  -- Vector DB reference (Euclidean space)
  vector_id TEXT UNIQUE NOT NULL,
  embedding_model TEXT DEFAULT 'euclidean-minilm-v1',
  
  -- Memory dynamics
  strength REAL DEFAULT 1.0 CHECK(strength >= 0 AND strength <= 1),
  access_count INTEGER DEFAULT 0,
  last_accessed INTEGER,
  decay_rate REAL DEFAULT 0.01,
  
  -- Correction tracking
  correction_count INTEGER DEFAULT 0,
  last_corrected INTEGER,
  was_corrected_from INTEGER,              -- Original memory_id
  
  -- Status
  is_active BOOLEAN DEFAULT 1,
  superseded_by INTEGER,
  
  FOREIGN KEY(source_session_id) REFERENCES conversation_sessions(id),
  FOREIGN KEY(source_turn_id) REFERENCES conversation_turns(id),
  FOREIGN KEY(source_thinking_log_id) REFERENCES thinking_log(id),
  FOREIGN KEY(superseded_by) REFERENCES "memory_commits_old"(id),
  FOREIGN KEY(was_corrected_from) REFERENCES "memory_commits_old"(id)
);
CREATE TABLE belief_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  belief_a_id INTEGER NOT NULL,
  belief_b_id INTEGER NOT NULL,
  
  relationship_type TEXT CHECK(relationship_type IN (
    'derives_from',    -- A derives from B (hierarchical)
    'implies',         -- A implies B
    'contradicts',     -- A contradicts B
    'supports',        -- A supports B
    'causal'          -- A causes B
  )) NOT NULL,
  
  strength REAL DEFAULT 0.5 CHECK(strength >= 0 AND strength <= 1),
  discovered_at INTEGER NOT NULL,
  
  -- Poincaré distance between embeddings
  poincare_distance REAL,
  
  FOREIGN KEY(belief_a_id) REFERENCES beliefs(id) ON DELETE CASCADE,
  FOREIGN KEY(belief_b_id) REFERENCES beliefs(id) ON DELETE CASCADE,
  
  UNIQUE(belief_a_id, belief_b_id, relationship_type)
);
CREATE TABLE belief_formation_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  rule_name TEXT NOT NULL UNIQUE,
  belief_type TEXT NOT NULL,
  
  -- Threshold requirements
  min_memory_count INTEGER DEFAULT 3,
  min_time_span_days INTEGER DEFAULT 7,
  min_confidence REAL DEFAULT 0.65,
  
  -- Emotional weighting
  emotional_intensity_multiplier REAL DEFAULT 1.5,
  
  -- Pattern detection
  requires_consistency BOOLEAN DEFAULT 1,
  consistency_threshold REAL DEFAULT 0.8,
  
  is_active BOOLEAN DEFAULT 1
);
CREATE TABLE belief_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  belief_id INTEGER NOT NULL,
  correction_date INTEGER NOT NULL,
  
  correction_type TEXT CHECK(correction_type IN (
    'typo',              -- "I meant Wales not whales"
    'misunderstanding',  -- "That's not what I meant"
    'clarification',     -- "To clarify..."
    'changed_mind',      -- Genuine belief change
    'context_missing',   -- "I was joking"
    'user_error'         -- "My bad, ignore that"
  )) NOT NULL,
  
  -- What changed
  old_statement TEXT NOT NULL,
  new_statement TEXT,
  new_belief_id INTEGER,               -- If new belief created
  correction_reasoning TEXT,
  
  -- Impact (depends on maturity_state)
  caused_distress BOOLEAN DEFAULT 0,
  distress_level REAL DEFAULT 0,
  was_exempt BOOLEAN DEFAULT 0,
  exemption_reason TEXT,
  
  -- User metadata
  user_initiated BOOLEAN DEFAULT 1,
  user_explanation TEXT,
  
  -- Context
  session_id INTEGER,
  turn_id INTEGER,
  
  FOREIGN KEY(belief_id) REFERENCES beliefs(id) ON DELETE CASCADE,
  FOREIGN KEY(new_belief_id) REFERENCES beliefs(id) ON DELETE SET NULL,
  FOREIGN KEY(session_id) REFERENCES conversation_sessions(id),
  FOREIGN KEY(turn_id) REFERENCES conversation_turns(id)
);
CREATE TABLE memory_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  memory_id INTEGER NOT NULL,
  correction_date INTEGER NOT NULL,
  correction_type TEXT NOT NULL,
  
  old_statement TEXT NOT NULL,
  new_statement TEXT,
  new_memory_id INTEGER,
  
  user_explanation TEXT,
  session_id INTEGER,
  
  FOREIGN KEY(memory_id) REFERENCES "memory_commits_old"(id) ON DELETE CASCADE,
  FOREIGN KEY(new_memory_id) REFERENCES "memory_commits_old"(id) ON DELETE SET NULL,
  FOREIGN KEY(session_id) REFERENCES conversation_sessions(id)
);
CREATE TABLE clarification_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  requested_at INTEGER NOT NULL,
  turn_id INTEGER NOT NULL,
  
  -- What triggered uncertainty
  trigger_type TEXT CHECK(trigger_type IN (
    'ambiguous_reference',
    'potential_typo',
    'contradiction',
    'parsing_uncertainty',
    'low_confidence'
  )) NOT NULL,
  
  uncertainty_score REAL NOT NULL,
  question_asked TEXT NOT NULL,
  
  -- User response
  user_responded BOOLEAN DEFAULT 0,
  user_response TEXT,
  response_timestamp INTEGER,
  
  -- Outcome
  prevented_incorrect_belief BOOLEAN DEFAULT 0,
  resulted_in_correction BOOLEAN DEFAULT 0,
  
  FOREIGN KEY(turn_id) REFERENCES conversation_turns(id)
);
CREATE TABLE memory_belief_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  memory_id INTEGER NOT NULL,
  belief_id INTEGER NOT NULL,
  
  evidence_type TEXT CHECK(evidence_type IN (
    'supports',        -- Memory confirms belief
    'contradicts',     -- Memory challenges belief
    'formed_from',     -- Belief derived from this
    'reinforces'       -- Memory strengthens belief
  )) NOT NULL,
  
  -- Strength of evidence
  weight REAL DEFAULT 1.0 CHECK(weight >= 0 AND weight <= 1),
  
  -- Context
  discovered_at INTEGER NOT NULL,
  last_reinforced INTEGER,
  reinforcement_count INTEGER DEFAULT 1,
  
  -- Formation flags
  contributed_to_formation BOOLEAN DEFAULT 0,
  is_primary_evidence BOOLEAN DEFAULT 0,
  
  FOREIGN KEY(memory_id) REFERENCES "memory_commits_old"(id) ON DELETE CASCADE,
  FOREIGN KEY(belief_id) REFERENCES beliefs(id) ON DELETE CASCADE,
  
  UNIQUE(memory_id, belief_id, evidence_type)
);
CREATE TABLE belief_formation_candidates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  candidate_statement TEXT NOT NULL,
  candidate_type TEXT NOT NULL,
  
  -- Supporting memories
  supporting_memory_ids TEXT NOT NULL,    -- JSON: [12, 34, 56]
  memory_count INTEGER NOT NULL,
  
  -- Pattern detection
  first_memory_date INTEGER NOT NULL,
  last_memory_date INTEGER NOT NULL,
  time_span_days INTEGER NOT NULL,
  
  consistency_score REAL NOT NULL,
  confidence REAL NOT NULL,
  
  -- Status
  status TEXT CHECK(status IN (
    'pending',
    'approved',
    'rejected',
    'formed'
  )) DEFAULT 'pending',
  
  formed_belief_id INTEGER,
  
  detected_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  
  FOREIGN KEY(formed_belief_id) REFERENCES beliefs(id)
);
CREATE TABLE memory_commits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      
      -- Content
      memory_statement TEXT NOT NULL,
      memory_type TEXT CHECK(memory_type IN (
        'fact', 'preference', 'event', 'realization', 'context', 'observation'
      )) NOT NULL,
      
      -- Temporal
      committed_at INTEGER NOT NULL,
      temporal_bucket TEXT NOT NULL,
      relative_time_description TEXT,
      
      -- Source tracking (NO FOREIGN KEYS - just store the IDs)
      source_session_id INTEGER,
      source_turn_id INTEGER,
      source_thinking_log_id INTEGER,
      
      -- Formation
      commit_trigger TEXT CHECK(commit_trigger IN (
        'user_manual', 'auto_extract', 'nia_decision', 'threshold', 'manual_button'
      )) NOT NULL,
      formation_context TEXT,
      
      -- Semantic associations
      topics_json TEXT,
      subjects_json TEXT,
      related_memory_ids TEXT,
      
      -- Vector DB reference
      vector_id TEXT UNIQUE NOT NULL,
      embedding_model TEXT DEFAULT 'local-minilm',
      
      -- Memory dynamics
      strength REAL DEFAULT 1.0 CHECK(strength >= 0 AND strength <= 1),
      access_count INTEGER DEFAULT 0,
      last_accessed INTEGER,
      decay_rate REAL DEFAULT 0.01,
      
      -- Correction tracking
      correction_count INTEGER DEFAULT 0,
      last_corrected INTEGER,
      was_corrected_from INTEGER,
      
      -- Status
      is_active INTEGER DEFAULT 1,
      superseded_by INTEGER
    );
CREATE TABLE memory_extraction_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turn_id INTEGER,
        user_message TEXT,
        pass_a_output TEXT,
        pass_b_output TEXT,
        entities_extracted INTEGER DEFAULT 0,
        facts_extracted INTEGER DEFAULT 0,
        facts_valid INTEGER DEFAULT 0,
        facts_rejected INTEGER DEFAULT 0,
        memories_created INTEGER DEFAULT 0,
        memories_reinforced INTEGER DEFAULT 0,
        processing_time_ms INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
      );
CREATE TABLE "memory_access_log" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memory_id INTEGER NOT NULL,
        accessed_at INTEGER NOT NULL,
        access_context TEXT,
        triggered_by_turn_id INTEGER
      );
INSERT INTO sqlite_schema VALUES('table', 'memory_fts', 'memory_fts', 0, 'CREATE VIRTUAL TABLE memory_fts USING fts5(
    memory_statement,
    topics,
    subjects
  )');
CREATE TABLE 'memory_fts_data'(id INTEGER PRIMARY KEY, block BLOB);
CREATE TABLE 'memory_fts_idx'(segid, term, pgno, PRIMARY KEY(segid, term)) WITHOUT ROWID;
CREATE TABLE 'memory_fts_content'(id INTEGER PRIMARY KEY, c0, c1, c2);
CREATE TABLE 'memory_fts_docsize'(id INTEGER PRIMARY KEY, sz BLOB);
CREATE TABLE 'memory_fts_config'(k PRIMARY KEY, v) WITHOUT ROWID;
CREATE TABLE session_summaries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL DEFAULT 'blaze',
          session_id TEXT,
          summary_type TEXT CHECK(summary_type IN ('turn', 'hourly', 'daily', 'weekly', 'session')) DEFAULT 'turn',
          summary_text TEXT NOT NULL,
          topics_json TEXT,
          mood TEXT,
          turn_count INTEGER,
          turn_range_start INTEGER,
          turn_range_end INTEGER,
          period_start INTEGER,
          period_end INTEGER,
          created_at INTEGER DEFAULT (unixepoch() * 1000)
        );
CREATE TABLE current_activity (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        type TEXT,
        name TEXT,
        started_at INTEGER,
        context TEXT,
        updated_at INTEGER
      );
CREATE TABLE initiative_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        prompt TEXT NOT NULL,
        source_data TEXT,
        created_at INTEGER,
        delivered_at INTEGER,
        status TEXT DEFAULT 'pending'
      );
CREATE UNIQUE INDEX idx_unique_belief_statement ON beliefs(belief_statement);
CREATE UNIQUE INDEX idx_unique_anchors ON identity_anchors(anchor_statement);
