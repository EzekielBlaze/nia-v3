-- ============================================================================
-- NIA Memory System: Memories Schema
-- Episodic memory storage with Euclidean embeddings
-- ~108 lines (Target: <110)
-- ============================================================================

-- ============================================================================
-- MEMORY COMMITS (episodic memories, NOT hierarchical)
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_commits (
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
  FOREIGN KEY(superseded_by) REFERENCES memory_commits(id),
  FOREIGN KEY(was_corrected_from) REFERENCES memory_commits(id)
);

CREATE INDEX IF NOT EXISTS idx_memory_temporal 
  ON memory_commits(committed_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_active 
  ON memory_commits(is_active) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_memory_strength 
  ON memory_commits(strength DESC);
CREATE INDEX IF NOT EXISTS idx_memory_vector 
  ON memory_commits(vector_id);

-- ============================================================================
-- MEMORY ACCESS LOG (tracks when memories are recalled)
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_access_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id INTEGER NOT NULL,
  accessed_at INTEGER NOT NULL,
  access_context TEXT CHECK(access_context IN (
    'conversation_recall',   -- Recalled during chat
    'user_query',           -- User asked about it
    'related_trigger',      -- Related memory triggered
    'periodic_review'       -- Background processing
  )) NOT NULL,
  triggered_by_turn_id INTEGER,
  
  FOREIGN KEY(memory_id) REFERENCES memory_commits(id) ON DELETE CASCADE,
  FOREIGN KEY(triggered_by_turn_id) REFERENCES conversation_turns(id)
);

CREATE INDEX IF NOT EXISTS idx_access_memory 
  ON memory_access_log(memory_id, accessed_at DESC);

-- ============================================================================
-- FULL-TEXT SEARCH (for fast keyword matching)
-- ============================================================================

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  memory_statement,
  topics,
  subjects,
  content=memory_commits,
  content_rowid=id
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS memory_fts_insert AFTER INSERT ON memory_commits BEGIN
  INSERT INTO memory_fts(rowid, memory_statement, topics, subjects)
  VALUES (new.id, new.memory_statement, new.topics_json, new.subjects_json);
END;

CREATE TRIGGER IF NOT EXISTS memory_fts_delete AFTER DELETE ON memory_commits BEGIN
  DELETE FROM memory_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS memory_fts_update AFTER UPDATE ON memory_commits BEGIN
  UPDATE memory_fts 
  SET memory_statement = new.memory_statement,
      topics = new.topics_json,
      subjects = new.subjects_json
  WHERE rowid = new.id;
END;
