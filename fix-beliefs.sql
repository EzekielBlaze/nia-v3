-- ============================================================================
-- Fix Beliefs Table - Simple SQLite Version
-- Run this to add missing columns (ignores errors if they already exist)
-- ============================================================================

-- These commands will error if columns exist - THAT'S OK!
-- SQLite doesn't have "IF NOT EXISTS" for ALTER COLUMN
-- Just ignore the errors

ALTER TABLE beliefs ADD COLUMN maturity_state TEXT DEFAULT 'probation';
ALTER TABLE beliefs ADD COLUMN probation_until INTEGER;
ALTER TABLE beliefs ADD COLUMN correction_count INTEGER DEFAULT 0;
ALTER TABLE beliefs ADD COLUMN last_correction INTEGER;
ALTER TABLE beliefs ADD COLUMN reinforcement_count INTEGER DEFAULT 1;
ALTER TABLE beliefs ADD COLUMN vector_id TEXT;
ALTER TABLE beliefs ADD COLUMN embedding_model TEXT DEFAULT 'poincare-v1';
ALTER TABLE beliefs ADD COLUMN poincare_norm REAL;
ALTER TABLE beliefs ADD COLUMN hierarchy_level INTEGER;

-- Now create the constraints (new tables, will work fine)

CREATE TABLE IF NOT EXISTS belief_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  belief_a_id INTEGER NOT NULL,
  belief_b_id INTEGER NOT NULL,
  relationship_type TEXT NOT NULL,
  strength REAL DEFAULT 0.5,
  discovered_at INTEGER NOT NULL,
  poincare_distance REAL,
  FOREIGN KEY(belief_a_id) REFERENCES beliefs(id) ON DELETE CASCADE,
  FOREIGN KEY(belief_b_id) REFERENCES beliefs(id) ON DELETE CASCADE,
  UNIQUE(belief_a_id, belief_b_id, relationship_type)
);

CREATE TABLE IF NOT EXISTS belief_formation_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_name TEXT NOT NULL UNIQUE,
  belief_type TEXT NOT NULL,
  min_memory_count INTEGER DEFAULT 3,
  min_time_span_days INTEGER DEFAULT 7,
  min_confidence REAL DEFAULT 0.65,
  emotional_intensity_multiplier REAL DEFAULT 1.5,
  requires_consistency BOOLEAN DEFAULT 1,
  consistency_threshold REAL DEFAULT 0.8,
  is_active BOOLEAN DEFAULT 1
);

-- Add default rules
INSERT OR IGNORE INTO belief_formation_rules 
  (rule_name, belief_type, min_memory_count, min_time_span_days, min_confidence) 
VALUES
  ('preference_formation', 'preference', 2, 1, 0.6),
  ('value_formation', 'value', 5, 14, 0.7),
  ('principle_formation', 'principle', 8, 30, 0.75),
  ('fact_formation', 'fact', 3, 3, 0.8);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_belief_rel_a ON belief_relationships(belief_a_id);
CREATE INDEX IF NOT EXISTS idx_belief_rel_b ON belief_relationships(belief_b_id);
CREATE INDEX IF NOT EXISTS idx_belief_rel_type ON belief_relationships(relationship_type);
