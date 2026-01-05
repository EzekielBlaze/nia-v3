-- ============================================================================
-- NIA Memory System: Belief Maturation
-- Auto-update maturity states based on age & reinforcement
-- ~45 lines (Target: <60)
-- ============================================================================

-- ============================================================================
-- MATURATION TRIGGER (auto-update states)
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS belief_maturation_check 
AFTER UPDATE ON beliefs
WHEN NEW.reinforcement_count != OLD.reinforcement_count 
  OR (unixepoch() - NEW.valid_from) > 604800  -- 7 days
BEGIN
  UPDATE beliefs
  SET maturity_state = CASE
    -- Probation: 0-7 days OR <3 reinforcements
    WHEN (unixepoch() - valid_from) < 604800 
      AND reinforcement_count < 3 
      THEN 'probation'
    
    -- Establishing: 7-30 days, 3-10 reinforcements
    WHEN (unixepoch() - valid_from) BETWEEN 604800 AND 2592000 
      AND reinforcement_count BETWEEN 3 AND 10 
      THEN 'establishing'
    
    -- Established: 30+ days, 10+ reinforcements
    WHEN (unixepoch() - valid_from) >= 2592000 
      AND reinforcement_count >= 10 
      THEN 'established'
    
    -- Core: linked to identity_core
    WHEN caused_by_identity_anchor_id IS NOT NULL 
      THEN 'core'
    
    ELSE maturity_state
  END,
  
  probation_until = CASE
    WHEN maturity_state = 'probation' 
      THEN valid_from + 604800  -- 7 days
    ELSE probation_until
  END
  
  WHERE id = NEW.id;
END;

-- ============================================================================
-- HELPER: Set initial probation period on belief creation
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS belief_set_probation 
AFTER INSERT ON beliefs
BEGIN
  UPDATE beliefs
  SET probation_until = valid_from + 604800  -- 7 days from creation
  WHERE id = NEW.id AND maturity_state = 'probation';
END;
