-- Sample data for development and demos. Run AFTER schema.sql.
-- IMPORTANT: password_hash values are placeholders. Replace them with real bcrypt hashes
-- (the Task 3 owner can provide a small script that creates hashes for the test password).

INSERT INTO clients (name, contact_name, contact_phone, contact_email)
VALUES ('Kololo Holdings Ltd', 'Grace Namuli', '+256700000001', 'grace@example.com');

INSERT INTO users (full_name, email, phone, password_hash, role, client_id) VALUES
 ('Sam Admin',      'admin@example.com',      '+256700000010', '$2b$10$REPLACE_WITH_REAL_HASH', 'admin',       NULL),
 ('Olivia Manager', 'manager@example.com',    '+256700000011', '$2b$10$REPLACE_WITH_REAL_HASH', 'ops_manager', NULL),
 ('Peter Supervisor','supervisor@example.com','+256700000012', '$2b$10$REPLACE_WITH_REAL_HASH', 'supervisor',  NULL),
 ('Amina K.',       'amina@example.com',      '+256700000013', '$2b$10$REPLACE_WITH_REAL_HASH', 'guard',       NULL),
 ('John M.',        'john@example.com',       '+256700000014', '$2b$10$REPLACE_WITH_REAL_HASH', 'guard',       NULL),
 ('Ruth N.',        'ruth@example.com',       '+256700000015', '$2b$10$REPLACE_WITH_REAL_HASH', 'guard',       NULL),
 ('Grace Namuli',   'grace@example.com',      '+256700000001', '$2b$10$REPLACE_WITH_REAL_HASH', 'client',      1);

INSERT INTO sites (client_id, name, address, latitude, longitude, geofence_radius_m,
                   guards_required_day, guards_required_night, patrols_per_night)
VALUES (1, 'Kololo Office Park', 'Plot 14, Kololo, Kampala', 0.334500, 32.592100, 150, 2, 2, 4);

INSERT INTO site_supervisors (site_id, user_id) VALUES (1, 3);
INSERT INTO site_guards (site_id, guard_id) VALUES (1, 4), (1, 5), (1, 6);

INSERT INTO checkpoints (site_id, name, tag_code, latitude, longitude) VALUES
 (1, 'Main gate',    'CP-1-1-A1B2', 0.334300, 32.591900),
 (1, 'Back gate',    'CP-1-2-C3D4', 0.334900, 32.592500),
 (1, 'Generator',    'CP-1-3-E5F6', 0.334700, 32.592300),
 (1, 'Roof access',  'CP-1-4-G7H8', 0.334600, 32.592200);

INSERT INTO routes (site_id, name, max_round_minutes, min_seconds_between_scans)
VALUES (1, 'Night perimeter walk', 45, 60);
INSERT INTO route_checkpoints (route_id, checkpoint_id, sequence) VALUES (1,1,1),(1,2,2),(1,3,3),(1,4,4);
INSERT INTO route_round_times (route_id, start_time) VALUES (1,'20:00'),(1,'22:00'),(1,'00:00'),(1,'02:00');

INSERT INTO shift_templates (name, start_time, end_time) VALUES ('Day','06:00','18:00'), ('Night','18:00','06:00');

INSERT INTO rosters (site_id, week_start, status, created_by) VALUES (1, '2026-10-19', 'draft', 2);

-- Times below are UTC; Kampala is UTC+3, so the 18:00 night shift starts at 15:00Z
INSERT INTO shifts (roster_id, guard_id, shift_template_id, shift_date, start_at, end_at) VALUES
 (1, 4, 2, '2026-10-20', '2026-10-20T15:00:00Z', '2026-10-21T03:00:00Z'),
 (1, 5, 2, '2026-10-20', '2026-10-20T15:00:00Z', '2026-10-21T03:00:00Z');

INSERT INTO anomaly_settings (key, value) VALUES
 ('late_round_minutes', 15),
 ('wrong_location_metres', 50),
 ('clock_mismatch_minutes', 10),
 ('late_checkin_minutes', 10),
 ('no_show_minutes', 30);
