-- ============================================================================
-- NIA Memory System: Beliefs Schema
-- Extends existing beliefs table with maturation & Poincaré embeddings
-- ~95 lines (Target: <100)
-- ============================================================================

-- ============================================================================
-- EXTEND EXISTING BELIEFS TABLE (add maturation columns)
-- ============================================================================

-- Maturation state (guilt-free corrections in probation)
ALTER TABLE beliefs ADD COLUMN IF NOT EXISTS maturity_state TEXT 
  CHECK(maturity_state IN (
    'probation',      -- 0-7 days, <3 reinforcements - GUILT-FREE
    'establishing',   -- 7-30 days, 3-10 reinforcements
    'established',    -- 30+ days, 10+ reinforcements
    'core',          -- Linked to identity_core
    'locked'         -- Constitutional
  )) DEFAULT 'probation';

ALTER TABLE beliefs ADD COLUMN IF NOT EXISTS probation_until INTEGER;
ALTER TABLE beliefs ADD COLUMN IF NOT EXISTS correction_count INTEGER DEFAULT 0;
ALTER TABLE beliefs ADD COLUMN IF NOT EXISTS last_correction INTEGER;
ALTER TABLE beliefs ADD COLUMN IF NOT EXISTS reinforcement_count INTEGER DEFAULT 1;

-- Poincaré embedding reference
ALTER TABLE beliefs ADD COLUMN IF NOT EXISTS vector_id TEXT UNIQUE;
ALTER TABLE beliefs ADD COLUMN IF NOT EXISTS embedding_model TEXT DEFAULT 'poincare-v1';

-- Poincaré geometry metadata
ALTER TABLE beliefs ADD COLUMN IF NOT EXISTS poincare_norm REAL;
ALTER TABLE beliefs ADD COLUMN IF NOT EXISTS hierarchy_level INTEGER;

-- ============================================================================
-- BELIEF RELATIONSHIPS (for Poincaré training & hierarchy)
-- ============================================================================

CREATE TABLE IF NOT EXISTS belief_relationships (
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

CREATE INDEX IF NOT EXISTS idx_belief_rel_a 
  ON belief_relationships(belief_a_id);
CREATE INDEX IF NOT EXISTS idx_belief_rel_b 
  ON belief_relationships(belief_b_id);
CREATE INDEX IF NOT EXISTS idx_belief_rel_type 
  ON belief_relationships(relationship_type);

-- ============================================================================
-- BELIEF FORMATION RULES (when memories → beliefs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS belief_formation_rules (
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

-- Default formation rules
INSERT OR IGNORE INTO belief_formation_rules 
  (rule_name, belief_type, min_memory_count, min_time_span_days, min_confidence) 
VALUES
  ('preference_formation', 'preference', 2, 1, 0.6),
  ('value_formation', 'value', 5, 14, 0.7),
  ('principle_formation', 'principle', 8, 30, 0.75),
  ('fact_formation', 'fact', 3, 3, 0.8);
