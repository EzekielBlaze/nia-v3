-- ============================================================================
-- NIA Memory System: Corrections Schema
-- Guilt-free correction handling based on maturity
-- ~85 lines (Target: <90)
-- ============================================================================

-- ============================================================================
-- BELIEF CORRECTIONS (track all corrections to beliefs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS belief_corrections (
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

CREATE INDEX IF NOT EXISTS idx_corrections_belief 
  ON belief_corrections(belief_id);
CREATE INDEX IF NOT EXISTS idx_corrections_date 
  ON belief_corrections(correction_date DESC);
CREATE INDEX IF NOT EXISTS idx_corrections_exempt 
  ON belief_corrections(was_exempt) WHERE was_exempt = 1;

-- ============================================================================
-- MEMORY CORRECTIONS (simpler than beliefs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS memory_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  memory_id INTEGER NOT NULL,
  correction_date INTEGER NOT NULL,
  correction_type TEXT NOT NULL,
  
  old_statement TEXT NOT NULL,
  new_statement TEXT,
  new_memory_id INTEGER,
  
  user_explanation TEXT,
  session_id INTEGER,
  
  FOREIGN KEY(memory_id) REFERENCES memory_commits(id) ON DELETE CASCADE,
  FOREIGN KEY(new_memory_id) REFERENCES memory_commits(id) ON DELETE SET NULL,
  FOREIGN KEY(session_id) REFERENCES conversation_sessions(id)
);

CREATE INDEX IF NOT EXISTS idx_mem_corrections 
  ON memory_corrections(memory_id);

-- ============================================================================
-- CLARIFICATION REQUESTS (when NIA asks for clarity)
-- ============================================================================

CREATE TABLE IF NOT EXISTS clarification_requests (
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

CREATE INDEX IF NOT EXISTS idx_clarifications 
  ON clarification_requests(requested_at DESC);
