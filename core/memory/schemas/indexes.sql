-- ============================================================================
-- NIA Memory System: Performance Indexes
-- Additional indexes for common query patterns
-- ~35 lines (Target: <50)
-- ============================================================================

-- NOTE: Most indexes are already created in individual schema files.
-- This file contains only additional composite/specialized indexes.

-- ============================================================================
-- COMPOSITE INDEXES (multi-column for common queries)
-- ============================================================================

-- Memory recall by topic + time
CREATE INDEX IF NOT EXISTS idx_memory_topic_time 
  ON memory_commits(committed_at DESC, topics_json) 
  WHERE is_active = 1;

-- Belief relationships by type + strength
CREATE INDEX IF NOT EXISTS idx_belief_rel_type_strength 
  ON belief_relationships(relationship_type, strength DESC);

-- Evidence by belief + type (for counting support)
CREATE INDEX IF NOT EXISTS idx_evidence_belief_type 
  ON memory_belief_evidence(belief_id, evidence_type);

-- Corrections by session (for session summaries)
CREATE INDEX IF NOT EXISTS idx_corrections_session 
  ON belief_corrections(session_id, correction_date DESC);

-- ============================================================================
-- PARTIAL INDEXES (filtered for specific queries)
-- ============================================================================

-- Pending belief candidates only
CREATE INDEX IF NOT EXISTS idx_candidates_pending 
  ON belief_formation_candidates(detected_at DESC) 
  WHERE status = 'pending';

-- High-strength memories only (for prioritization)
CREATE INDEX IF NOT EXISTS idx_memory_high_strength 
  ON memory_commits(strength DESC, committed_at DESC) 
  WHERE is_active = 1 AND strength >= 0.7;

-- Recent clarifications only (for analysis)
CREATE INDEX IF NOT EXISTS idx_recent_clarifications 
  ON clarification_requests(requested_at DESC) 
  WHERE user_responded = 1;
