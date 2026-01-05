-- ============================================================================
-- NIA Memory System: Conversations Schema
-- Tracks conversation sessions and individual turns
-- ~78 lines (Target: <100)
-- ============================================================================

-- ============================================================================
-- DAEMON SESSIONS (when NIA is online/offline)
-- ============================================================================

CREATE TABLE IF NOT EXISTS daemon_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  uptime_ms INTEGER,
  status TEXT CHECK(status IN ('online', 'offline', 'crashed')) DEFAULT 'online',
  crash_reason TEXT,
  created_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_daemon_status 
  ON daemon_sessions(status, started_at DESC);

-- ============================================================================
-- CONVERSATION SESSIONS (groups of related turns)
-- ============================================================================

CREATE TABLE IF NOT EXISTS conversation_sessions (
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

CREATE INDEX IF NOT EXISTS idx_session_active 
  ON conversation_sessions(is_active) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_session_date 
  ON conversation_sessions(date_bucket DESC);

-- ============================================================================
-- CONVERSATION TURNS (individual messages)
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

CREATE INDEX IF NOT EXISTS idx_turn_session 
  ON conversation_turns(session_id, turn_number);
CREATE INDEX IF NOT EXISTS idx_turn_timestamp 
  ON conversation_turns(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_turn_memory_anchor 
  ON conversation_turns(is_memory_anchor) WHERE is_memory_anchor = 1;
CREATE INDEX IF NOT EXISTS idx_turn_correction 
  ON conversation_turns(is_correction) WHERE is_correction = 1;
