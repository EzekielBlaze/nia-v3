-- ============================================================================
-- NIA Memory System: Memory↔Belief Bridge
-- How memories aggregate into beliefs
-- ~75 lines (Target: <80)
-- ============================================================================

-- ============================================================================
-- MEMORY→BELIEF EVIDENCE (how memories support beliefs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_belief_evidence (
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
  
  FOREIGN KEY(memory_id) REFERENCES memory_commits(id) ON DELETE CASCADE,
  FOREIGN KEY(belief_id) REFERENCES beliefs(id) ON DELETE CASCADE,
  
  UNIQUE(memory_id, belief_id, evidence_type)
);

CREATE INDEX IF NOT EXISTS idx_evidence_memory 
  ON memory_belief_evidence(memory_id);
CREATE INDEX IF NOT EXISTS idx_evidence_belief 
  ON memory_belief_evidence(belief_id);
CREATE INDEX IF NOT EXISTS idx_evidence_type 
  ON memory_belief_evidence(evidence_type);
CREATE INDEX IF NOT EXISTS idx_evidence_formation 
  ON memory_belief_evidence(contributed_to_formation) 
  WHERE contributed_to_formation = 1;

-- ============================================================================
-- BELIEF FORMATION CANDIDATES (patterns waiting to become beliefs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS belief_formation_candidates (
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

CREATE INDEX IF NOT EXISTS idx_candidates_status 
  ON belief_formation_candidates(status);
CREATE INDEX IF NOT EXISTS idx_candidates_detected 
  ON belief_formation_candidates(detected_at DESC);
