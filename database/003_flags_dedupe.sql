-- 003_flags_dedupe.sql (additive, safe to run twice)
-- Lets the anomaly engine run many times without creating the same flag twice.
ALTER TABLE flags ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS flags_round_dedupe_key ON flags (round_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
-- Faster dashboard and report queries
CREATE INDEX IF NOT EXISTS idx_attendance_checked_in ON attendance (checked_in_at);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts (shift_date);
