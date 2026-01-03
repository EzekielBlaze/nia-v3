-- CONCEPT CONNOTATION SYSTEM
-- Emotional layer separate from beliefs

-- Concepts that can carry connotations
CREATE TABLE IF NOT EXISTS concepts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  concept_name TEXT UNIQUE NOT NULL, -- "memory_safety", "bugs", "trust"
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  last_updated INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_concepts_name ON concepts(concept_name);

-- Connotations attached to concepts (NOT beliefs)
CREATE TABLE IF NOT EXISTS concept_connotations (
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

CREATE INDEX IF NOT EXISTS idx_connotation_concept ON concept_connotations(concept_id);
CREATE INDEX IF NOT EXISTS idx_connotation_stability ON concept_connotations(stability);

-- Link beliefs to concepts (many-to-many)
CREATE TABLE IF NOT EXISTS belief_concepts (
  belief_id INTEGER NOT NULL,
  concept_id INTEGER NOT NULL,
  weight REAL DEFAULT 1.0,           -- How strongly belief relates to concept
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  PRIMARY KEY (belief_id, concept_id),
  FOREIGN KEY (belief_id) REFERENCES beliefs(id),
  FOREIGN KEY (concept_id) REFERENCES concepts(id)
);

CREATE INDEX IF NOT EXISTS idx_belief_concepts_belief ON belief_concepts(belief_id);
CREATE INDEX IF NOT EXISTS idx_belief_concepts_concept ON belief_concepts(concept_id);

-- Connotation evolution log
CREATE TABLE IF NOT EXISTS connotation_evolution (
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

CREATE INDEX IF NOT EXISTS idx_connotation_evolution_concept ON connotation_evolution(concept_id);
CREATE INDEX IF NOT EXISTS idx_connotation_evolution_timestamp ON connotation_evolution(timestamp);

-- Example connotations:
--
-- INSERT INTO concepts (concept_name) VALUES ('memory_safety');
-- INSERT INTO concept_connotations (concept_id, valence, intensity, emotion_tags, origin, stability)
-- VALUES (
--   (SELECT id FROM concepts WHERE concept_name = 'memory_safety'),
--   0.7,  -- positive
--   0.8,  -- high intensity
--   '["safety", "reliability", "protection"]',
--   'observation',
--   'persistent'
-- );
--
-- INSERT INTO concepts (concept_name) VALUES ('approval_seeking');
-- INSERT INTO concept_connotations (concept_id, valence, intensity, emotion_tags, origin, stability)
-- VALUES (
--   (SELECT id FROM concepts WHERE concept_name = 'approval_seeking'),
--   -0.4,  -- slightly negative
--   0.7,   -- medium-high intensity
--   '["anxiety", "neediness", "insecurity"]',
--   'self',
--   'persistent'
-- );
