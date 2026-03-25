-- ── Seed permissions ──────────────────────────────────────────────────────────
INSERT INTO permissions (code, description) VALUES
  ('VEHICLE_WRITE',        'Register vehicles, upload ESI files, submit OBD2 scans'),
  ('VEHICLE_READ',         'View vehicles, assessments, policies'),
  ('INSURANCE_SIMULATE',   'Run premium previews, create policies'),
  ('RULES_TRIAGE_ADMIN',   'Edit triage rule sets and thresholds'),
  ('RULES_PRICING_ADMIN',  'Edit pricing parameters and multipliers'),
  ('REPORTS_READ',         'Access operational reports and dashboards'),
  ('ADMIN',                'Full platform administration');

-- ── Seed roles ────────────────────────────────────────────────────────────────
INSERT INTO roles (name, description) VALUES
  ('technician',      'Vehicle registration and ESI inspection'),
  ('operator',        'AMBER queue review and policy visibility'),
  ('admin',           'Full platform administration'),
  ('dealer_agent',    'Policy creation for dealer'),
  ('dealer_manager',  'Policy creation + reporting for dealer');

-- ── Seed role_permissions ─────────────────────────────────────────────────────
-- technician: VEHICLE_WRITE + VEHICLE_READ
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'technician' AND p.code IN ('VEHICLE_WRITE', 'VEHICLE_READ');

-- operator: VEHICLE_READ + INSURANCE_SIMULATE + REPORTS_READ
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'operator' AND p.code IN ('VEHICLE_READ', 'INSURANCE_SIMULATE', 'REPORTS_READ');

-- admin: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'admin';

-- dealer_agent: VEHICLE_READ + INSURANCE_SIMULATE
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'dealer_agent' AND p.code IN ('VEHICLE_READ', 'INSURANCE_SIMULATE');

-- dealer_manager: VEHICLE_READ + INSURANCE_SIMULATE + REPORTS_READ
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.name = 'dealer_manager' AND p.code IN ('VEHICLE_READ', 'INSURANCE_SIMULATE', 'REPORTS_READ');
