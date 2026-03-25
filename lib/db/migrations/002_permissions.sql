-- Role definitions
CREATE TABLE roles (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL UNIQUE,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Permission definitions
CREATE TABLE permissions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT        NOT NULL UNIQUE,
  description   TEXT
);

-- Role → Permission mapping
CREATE TABLE role_permissions (
  role_id       UUID        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID        NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- User → Role assignments (Axura staff)
CREATE TABLE user_roles (
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id       UUID        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by   UUID        REFERENCES users(id),
  PRIMARY KEY (user_id, role_id)
);

-- Direct permission overrides per user (grant or deny independent of roles)
CREATE TABLE user_permissions (
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_id UUID        NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted       BOOLEAN     NOT NULL DEFAULT true,    -- false = explicit deny
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by   UUID        REFERENCES users(id),
  PRIMARY KEY (user_id, permission_id)
);

-- Effective permissions = (role permissions UNION direct grants) MINUS explicit denies
