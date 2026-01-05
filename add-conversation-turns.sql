-- ============================================================================
-- Add Missing conversation_turns Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversation_turns (
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
  is_memory_anchor BOOLEAN DEFAULT 0,
  is_correction BOOLEAN DEFAULT 0,
  spawned_memories INTEGER DEFAULT 0,
  spawned_beliefs INTEGER DEFAULT 0,
  
  -- Metadata
  tokens_in INTEGER,
  tokens_out INTEGER,
  model_used TEXT,
  
  FOREIGN KEY(session_id) REFERENCES conversation_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(thinking_log_id) REFERENCES thinking_log(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_turn_session 
  ON conversation_turns(session_id, turn_number);
  
CREATE INDEX IF NOT EXISTS idx_turn_timestamp 
  ON conversation_turns(timestamp DESC);
  
CREATE INDEX IF NOT EXISTS idx_turn_memory_anchor 
  ON conversation_turns(is_memory_anchor) WHERE is_memory_anchor = 1;
  
CREATE INDEX IF NOT EXISTS idx_turn_correction 
  ON conversation_turns(is_correction) WHERE is_correction = 1;
