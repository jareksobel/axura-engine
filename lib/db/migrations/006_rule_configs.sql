-- Versioned YAML rule sets
CREATE TABLE rule_configs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  version       TEXT        NOT NULL UNIQUE,           -- e.g. 'v1.0', 'v1.1'
  label         TEXT,                                  -- human-readable description
  content_yaml  TEXT        NOT NULL,                  -- full YAML rule set document
  is_active     BOOLEAN     NOT NULL DEFAULT false,    -- only one active at a time
  created_by    UUID        REFERENCES users(id),
  activated_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rule_configs_active ON rule_configs(is_active) WHERE is_active = true;

-- Enforce only one active rule set at a time
CREATE UNIQUE INDEX idx_rule_configs_one_active
  ON rule_configs(is_active)
  WHERE is_active = true;
