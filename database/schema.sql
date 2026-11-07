-- ============================================================
-- Guard Rostering and Patrol Verification System
-- PostgreSQL schema, version 0.1 (Task 2: Database Design)
-- Run order: schema.sql first, then seed.sql
-- ============================================================

DROP TABLE IF EXISTS notifications, audit_logs, incident_photos, incidents, anomaly_settings,
  flags, scans, patrol_rounds, leave_requests, swap_requests, attendance, shifts, rosters,
  shift_templates, route_round_times, route_checkpoints, routes, checkpoints, site_guards,
  site_supervisors, sites, clients, users CASCADE;

-- ---------- Task 3: users and roles ----------
CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  full_name     TEXT        NOT NULL,
  email         TEXT        NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT        NOT NULL,                 -- bcrypt/argon2 hash, never plain text
  role          TEXT        NOT NULL
                CHECK (role IN ('admin','ops_manager','supervisor','guard','client')),
  client_id     INTEGER,                              -- set only for role = 'client' (FK added below)
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,                          -- e.g. 'CREATE', 'UPDATE', 'DELETE', 'LOGIN'
  entity_type TEXT NOT NULL,                          -- e.g. 'roster', 'user'
  entity_id   INTEGER,
  details     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_user_time ON audit_logs (user_id, created_at DESC);

-- ---------- Task 4: clients, sites, checkpoints, routes ----------
CREATE TABLE clients (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  contact_name  TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE users
  ADD CONSTRAINT fk_users_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;

CREATE TABLE sites (
  id                   SERIAL PRIMARY KEY,
  client_id            INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  name                 TEXT NOT NULL,
  address              TEXT,
  latitude             NUMERIC(9,6) NOT NULL,
  longitude            NUMERIC(9,6) NOT NULL,
  geofence_radius_m    INTEGER NOT NULL DEFAULT 150 CHECK (geofence_radius_m > 0),
  guards_required_day  INTEGER NOT NULL DEFAULT 1 CHECK (guards_required_day >= 0),
  guards_required_night INTEGER NOT NULL DEFAULT 1 CHECK (guards_required_night >= 0),
  patrols_per_night    INTEGER NOT NULL DEFAULT 0 CHECK (patrols_per_night >= 0),
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sites_client ON sites (client_id);

-- Which supervisors look after which sites (controls what a supervisor can see)
CREATE TABLE site_supervisors (
  site_id INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (site_id, user_id)
);

-- Which guards are eligible to work at which sites
CREATE TABLE site_guards (
  site_id  INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  guard_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (site_id, guard_id)
);

CREATE TABLE checkpoints (
  id        SERIAL PRIMARY KEY,
  site_id   INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  tag_code  TEXT NOT NULL UNIQUE,                     -- text stored in the QR code
  latitude  NUMERIC(9,6) NOT NULL,
  longitude NUMERIC(9,6) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_checkpoints_site ON checkpoints (site_id);

CREATE TABLE routes (
  id                        SERIAL PRIMARY KEY,
  site_id                   INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name                      TEXT NOT NULL,
  max_round_minutes         INTEGER NOT NULL DEFAULT 45 CHECK (max_round_minutes > 0),
  min_seconds_between_scans INTEGER NOT NULL DEFAULT 60 CHECK (min_seconds_between_scans >= 0),
  is_active                 BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_routes_site ON routes (site_id);

-- The ordered list of checkpoints in a route
CREATE TABLE route_checkpoints (
  route_id      INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  checkpoint_id INTEGER NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
  sequence      INTEGER NOT NULL CHECK (sequence > 0),
  PRIMARY KEY (route_id, checkpoint_id),
  UNIQUE (route_id, sequence)
);

-- The times each round should start (e.g. 20:00, 22:00)
CREATE TABLE route_round_times (
  id         SERIAL PRIMARY KEY,
  route_id   INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  start_time TIME NOT NULL,
  UNIQUE (route_id, start_time)
);

-- ---------- Task 5: rostering ----------
CREATE TABLE shift_templates (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,                    -- 'Day', 'Night'
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL                            -- if end_time <= start_time the shift crosses midnight
);

CREATE TABLE rosters (
  id           SERIAL PRIMARY KEY,
  site_id      INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  week_start   DATE NOT NULL,                         -- the Monday of the roster week
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, week_start)
);

CREATE TABLE shifts (
  id                SERIAL PRIMARY KEY,
  roster_id         INTEGER NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  guard_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  shift_template_id INTEGER NOT NULL REFERENCES shift_templates(id) ON DELETE RESTRICT,
  shift_date        DATE NOT NULL,
  start_at          TIMESTAMPTZ NOT NULL,             -- full timestamps so night shifts compare correctly
  end_at            TIMESTAMPTZ NOT NULL,
  status            TEXT NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  CHECK (end_at > start_at),
  UNIQUE (guard_id, shift_date, shift_template_id)    -- same guard cannot be given the same shift twice
);
CREATE INDEX idx_shifts_guard_time ON shifts (guard_id, start_at);
CREATE INDEX idx_shifts_roster ON shifts (roster_id);

-- ---------- Task 6: attendance, swaps, leave ----------
CREATE TABLE attendance (
  id                    SERIAL PRIMARY KEY,
  shift_id              INTEGER NOT NULL UNIQUE REFERENCES shifts(id) ON DELETE CASCADE,
  checked_in_at         TIMESTAMPTZ,
  check_in_latitude     NUMERIC(9,6),
  check_in_longitude    NUMERIC(9,6),
  distance_from_site_m  INTEGER,
  checked_out_at        TIMESTAMPTZ,
  check_out_latitude    NUMERIC(9,6),
  check_out_longitude   NUMERIC(9,6),
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','on_time','late','no_show','completed')),
  CHECK (checked_out_at IS NULL OR checked_in_at IS NULL OR checked_out_at >= checked_in_at)
);

-- Stretch goals
CREATE TABLE swap_requests (
  id                SERIAL PRIMARY KEY,
  shift_id          INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  requested_by      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposed_guard_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason            TEXT,
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE leave_requests (
  id          SERIAL PRIMARY KEY,
  guard_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  reason      TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

-- ---------- Task 7: patrol rounds and scans ----------
CREATE TABLE patrol_rounds (
  id             SERIAL PRIMARY KEY,
  shift_id       INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  route_id       INTEGER NOT NULL REFERENCES routes(id) ON DELETE RESTRICT,
  round_index    INTEGER NOT NULL CHECK (round_index > 0),
  window_start   TIMESTAMPTZ NOT NULL,
  window_end     TIMESTAMPTZ NOT NULL,
  scans_expected INTEGER NOT NULL CHECK (scans_expected >= 0),
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','in_progress','complete','missed','flagged')),
  UNIQUE (shift_id, route_id, round_index),
  CHECK (window_end > window_start)
);
CREATE INDEX idx_rounds_window ON patrol_rounds (window_start);

CREATE TABLE scans (
  id                BIGSERIAL PRIMARY KEY,
  client_scan_id    UUID NOT NULL UNIQUE,             -- made on the phone; prevents duplicates when a batch is resent
  shift_id          INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  guard_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  checkpoint_id     INTEGER REFERENCES checkpoints(id) ON DELETE SET NULL,   -- set by server after matching tag_code
  round_id          INTEGER REFERENCES patrol_rounds(id) ON DELETE SET NULL, -- set by server after matching time window
  tag_code          TEXT NOT NULL,                    -- exactly what the phone read from the QR code
  scanned_at        TIMESTAMPTZ NOT NULL,             -- phone clock
  received_at       TIMESTAMPTZ NOT NULL DEFAULT now(), -- server clock
  latitude          NUMERIC(9,6),
  longitude         NUMERIC(9,6),
  accuracy_m        INTEGER,
  device_id         TEXT,
  validation_status TEXT NOT NULL DEFAULT 'accepted' CHECK (validation_status IN ('accepted','rejected')),
  reject_reason     TEXT                              -- e.g. 'UNKNOWN_TAG'
);
CREATE INDEX idx_scans_shift_time ON scans (shift_id, scanned_at);
CREATE INDEX idx_scans_round ON scans (round_id);

-- ---------- Task 8: anomaly detection ----------
CREATE TABLE flags (
  id          SERIAL PRIMARY KEY,
  round_id    INTEGER REFERENCES patrol_rounds(id) ON DELETE CASCADE,
  shift_id    INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  guard_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  site_id     INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  rule        TEXT NOT NULL CHECK (rule IN
              ('MISSED_CHECKPOINT','LATE_ROUND','TOO_FAST','OUT_OF_SEQUENCE','WRONG_LOCATION','CLOCK_MISMATCH')),
  severity    TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high')),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','confirmed','dismissed')),
  details     JSONB,                                  -- evidence: scan ids, seconds apart, distances
  note        TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_flags_site_status ON flags (site_id, status);

CREATE TABLE anomaly_settings (
  key        TEXT PRIMARY KEY,                        -- e.g. 'late_round_minutes'
  value      NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Task 10: incidents and notifications ----------
CREATE TABLE incidents (
  id              SERIAL PRIMARY KEY,
  site_id         INTEGER NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  shift_id        INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
  reported_by     INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  category        TEXT NOT NULL,
  description     TEXT NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL,
  latitude        NUMERIC(9,6),
  longitude       NUMERIC(9,6),
  status          TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved')),
  resolution_note TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_incidents_site_status ON incidents (site_id, status);

CREATE TABLE incident_photos (                        -- stretch goal
  id          SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  file_path   TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,                           -- 'shift_no_show', 'flag_created', ...
  message    TEXT NOT NULL,
  link       TEXT,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON notifications (user_id, is_read, created_at DESC);
