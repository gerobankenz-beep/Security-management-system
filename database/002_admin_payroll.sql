-- ============================================================
-- 002_admin_payroll.sql   (additive: safe on the existing schema, safe to run twice)
-- Adds: guard employee numbers, pay profiles, settings, public holidays,
--       payroll adjustments and runs, attendance idempotency and review columns.
-- Run:  psql -U postgres -d patrol_dev -f database/migrations/002_admin_payroll.sql
-- ============================================================

-- Guards get an employee number (unique when present)
ALTER TABLE users ADD COLUMN IF NOT EXISTS employee_no TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_employee_no_key ON users (employee_no) WHERE employee_no IS NOT NULL;

-- Night shifts earn a night allowance
ALTER TABLE shift_templates ADD COLUMN IF NOT EXISTS is_night BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE shift_templates SET is_night = TRUE WHERE lower(name) = 'night';

-- Pay profile per guard. A new row is added when pay changes, so history is kept.
-- A shift uses the profile with the latest effective_from on or before its date.
CREATE TABLE IF NOT EXISTS pay_profiles (
  id                  SERIAL PRIMARY KEY,
  guard_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hourly_rate_ugx     INTEGER NOT NULL CHECK (hourly_rate_ugx >= 0),
  night_allowance_ugx INTEGER NOT NULL DEFAULT 0 CHECK (night_allowance_ugx >= 0),
  overtime_multiplier NUMERIC(3,2) CHECK (overtime_multiplier IS NULL OR overtime_multiplier >= 1),
  effective_from      DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (guard_id, effective_from)
);

-- Company settings (thresholds and payroll rules). Values are JSON numbers or booleans.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Defaults are PLACEHOLDERS: confirm them with the company.
INSERT INTO settings (key, value) VALUES
  ('default_geofence_radius_m', '150'),
  ('late_checkin_minutes', '10'),
  ('no_show_minutes', '30'),
  ('min_rest_hours', '10'),
  ('max_consecutive_days', '6'),
  ('late_round_minutes', '15'),
  ('wrong_location_metres', '50'),
  ('overtime_weekly_threshold_hours', '48'),
  ('overtime_multiplier', '1.5'),
  ('holiday_multiplier', '2.0'),
  ('paid_early_arrival', 'false')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public_holidays (
  id           SERIAL PRIMARY KEY,
  holiday_date DATE NOT NULL UNIQUE,
  name         TEXT NOT NULL
);

-- Payroll
CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id         SERIAL PRIMARY KEY,
  guard_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  month      TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  type       TEXT NOT NULL CHECK (type IN ('addition', 'deduction')),
  amount_ugx INTEGER NOT NULL CHECK (amount_ugx > 0),
  reason     TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payroll_adj_month ON payroll_adjustments (month, guard_id);

CREATE TABLE IF NOT EXISTS payroll_runs (
  month        TEXT PRIMARY KEY CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reviewed', 'finalised')),
  reviewed_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  finalised_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  finalised_at TIMESTAMPTZ,
  snapshot     JSONB,                       -- the calculated lines, frozen when finalised
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Attendance: safe re-sending (event ids) and review of records made offline
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in_event_id  UUID;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out_event_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_check_in_event_key  ON attendance (check_in_event_id)  WHERE check_in_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS attendance_check_out_event_key ON attendance (check_out_event_id) WHERE check_out_event_id IS NOT NULL;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_in_device_time TIMESTAMPTZ;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS check_out_device_time TIMESTAMPTZ;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'verified';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS overtime_approved BOOLEAN NOT NULL DEFAULT FALSE;
DO $$ BEGIN
  ALTER TABLE attendance ADD CONSTRAINT attendance_verification_check
    CHECK (verification_status IN ('verified', 'pending_review', 'accepted', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS attendance_corrections (
  id            SERIAL PRIMARY KEY,
  attendance_id INTEGER NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
  changes       JSONB NOT NULL,
  reason        TEXT NOT NULL CHECK (length(trim(reason)) > 0),
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---- Sample data for development (placeholders, safe to run twice) ----
UPDATE users SET employee_no = 'G' || lpad(id::text, 3, '0') WHERE role = 'guard' AND employee_no IS NULL;
INSERT INTO pay_profiles (guard_id, hourly_rate_ugx, night_allowance_ugx, overtime_multiplier)
  SELECT id, 5000, 3000, NULL FROM users WHERE role = 'guard'
ON CONFLICT (guard_id, effective_from) DO NOTHING;
INSERT INTO public_holidays (holiday_date, name) VALUES ('2026-12-25', 'Christmas Day (example)')
ON CONFLICT (holiday_date) DO NOTHING;
