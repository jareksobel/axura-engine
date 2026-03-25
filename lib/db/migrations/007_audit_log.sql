-- Immutable action log
CREATE TABLE audit_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        REFERENCES users(id),
  dealer_user_id  UUID        REFERENCES dealer_users(id),
  action          TEXT        NOT NULL,                  -- e.g. 'POLICY_CREATED', 'RULE_SET_ACTIVATED'
  resource_type   TEXT        NOT NULL,                  -- e.g. 'policy', 'assessment', 'rule_config'
  resource_id     UUID,
  metadata        JSONB,                                 -- action-specific context
  ip_address      INET,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_user_id    ON audit_log(user_id);
CREATE INDEX idx_audit_log_resource   ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
