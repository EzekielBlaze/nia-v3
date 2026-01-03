-- NIA V3 - PHASE 2: DATABASE SCHEMA UPDATES
-- Adds evolution tracking columns to beliefs table

BEGIN TRANSACTION;

-- Add evolution tracking columns
ALTER TABLE beliefs ADD COLUMN last_reinforced INTEGER;
ALTER TABLE beliefs ADD COLUMN last_challenged INTEGER;
ALTER TABLE beliefs ADD COLUMN times_reinforced INTEGER DEFAULT 0;
ALTER TABLE beliefs ADD COLUMN times_challenged INTEGER DEFAULT 0;
ALTER TABLE beliefs ADD COLUMN confidence_trend TEXT DEFAULT 'stable';

-- Create index for trend queries
CREATE INDEX IF NOT EXISTS idx_belief_trend ON beliefs(confidence_trend, conviction_score);
CREATE INDEX IF NOT EXISTS idx_belief_activity ON beliefs(last_reinforced, last_challenged);

COMMIT;

-- Verify
SELECT '=== PHASE 2 SCHEMA UPDATES COMPLETE ===' as info;
SELECT '' as info;
SELECT 'Added columns:' as info;
PRAGMA table_info(beliefs);
