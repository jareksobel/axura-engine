-- Vehicle assessments — IMMUTABLE LEDGER
-- No UPDATE, no DELETE. Every record is permanent.
CREATE TABLE vehicle_assessments (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id            UUID        NOT NULL REFERENCES vehicles(id),
  vin                   CHAR(17)    NOT NULL,

  -- Source
  source                TEXT        NOT NULL CHECK (source IN ('esi', 'obd', 'manual_review')),
  parent_assessment_id  UUID        REFERENCES vehicle_assessments(id),  -- set on manual_review

  -- ESI-specific
  esi_file_id           UUID        REFERENCES esi_files(id),
  technician_note       TEXT,

  -- Verdict
  verdict               TEXT        NOT NULL CHECK (verdict IN ('GREEN', 'AMBER', 'RED')),
  score_pct             NUMERIC(5,2),
  rate_action           TEXT        CHECK (rate_action IN ('BIND', 'HARD_INSPECTION', 'DECLINE')),
  assessment_multiplier NUMERIC(5,4),
  reason                TEXT        NOT NULL,

  -- Rule set used
  rule_set_version      TEXT,

  -- Full pipeline output (JSONB)
  payload               JSONB       NOT NULL,

  -- Audit
  assessed_by           UUID        REFERENCES users(id),   -- null = system
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
  -- NO updated_at — this table is immutable
);

CREATE INDEX idx_assessments_vehicle_id ON vehicle_assessments(vehicle_id);
CREATE INDEX idx_assessments_verdict    ON vehicle_assessments(verdict);
CREATE INDEX idx_assessments_created_at ON vehicle_assessments(created_at DESC);
CREATE INDEX idx_assessments_vin        ON vehicle_assessments(vin);

-- ── Immutability enforcement via Row Level Security ───────────────────────────
ALTER TABLE vehicle_assessments ENABLE ROW LEVEL SECURITY;

-- Block UPDATE for everyone (including service role)
CREATE POLICY no_update_assessments
  ON vehicle_assessments
  FOR UPDATE
  USING (false);

-- Block DELETE for everyone
CREATE POLICY no_delete_assessments
  ON vehicle_assessments
  FOR DELETE
  USING (false);
