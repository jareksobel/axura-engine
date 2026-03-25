-- updated_at trigger function (shared)
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Insurance policies
CREATE TABLE policies (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_number         TEXT          NOT NULL UNIQUE,        -- AX-YYYY-NNNN

  -- Associations
  dealer_id             UUID          NOT NULL REFERENCES dealers(id),
  dealer_user_id        UUID          NOT NULL REFERENCES dealer_users(id),
  assessment_id         UUID          NOT NULL REFERENCES vehicle_assessments(id),

  -- Vehicle snapshot at purchase (denormalized)
  vin                   CHAR(17)      NOT NULL,
  make                  TEXT          NOT NULL,
  model                 TEXT          NOT NULL,
  year                  INT           NOT NULL,
  engine_type           TEXT,
  fuel_type             TEXT,
  odo_at_inspection_km  INT           NOT NULL,
  odo_at_policy_km      INT           NOT NULL,
  license_plate         TEXT,
  annual_mileage_tier   TEXT          NOT NULL
                        CHECK (annual_mileage_tier IN ('low', 'mid', 'high')),

  -- Customer snapshot (denormalized)
  customer_first_name   TEXT          NOT NULL,
  customer_last_name    TEXT          NOT NULL,
  customer_pesel        CHAR(11)      NOT NULL,   -- plaintext for pilot; encrypt post-pilot
  customer_address      TEXT          NOT NULL,
  customer_email        TEXT          NOT NULL,
  customer_phone        CHAR(9)       NOT NULL,

  -- Premium
  base_rate_pln         NUMERIC(10,2) NOT NULL,
  assessment_multiplier NUMERIC(5,4)  NOT NULL,
  mileage_multiplier    NUMERIC(5,4)  NOT NULL,
  premium_gross_pln     NUMERIC(10,2) NOT NULL,

  -- Policy period
  start_date            DATE          NOT NULL,
  end_date              DATE          NOT NULL,   -- start_date + 12 months

  -- Status
  status                TEXT          NOT NULL DEFAULT 'pending_payment'
                        CHECK (status IN (
                          'pending_payment',
                          'active',
                          'cancelled',
                          'expired',
                          'review_required'
                        )),

  -- Flags
  odo_delta_flag        BOOLEAN       NOT NULL DEFAULT false,

  -- Payment (Przelewy24)
  p24_order_id          TEXT,
  p24_transaction_id    TEXT,
  payment_status        TEXT          NOT NULL DEFAULT 'unpaid'
                        CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
  paid_at               TIMESTAMPTZ,

  -- PDF
  pdf_r2_key            TEXT,
  pdf_generated_at      TIMESTAMPTZ,

  -- Audit
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_policies_vin        ON policies(vin);
CREATE INDEX idx_policies_dealer_id  ON policies(dealer_id);
CREATE INDEX idx_policies_status     ON policies(status);
CREATE INDEX idx_policies_pesel      ON policies(customer_pesel);

CREATE TRIGGER policies_updated_at
  BEFORE UPDATE ON policies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
