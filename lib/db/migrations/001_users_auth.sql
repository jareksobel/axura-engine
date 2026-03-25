-- Axura staff users
CREATE TABLE users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth0_sub     TEXT        NOT NULL UNIQUE,   -- Auth0 subject claim (e.g. auth0|abc123)
  email         TEXT        NOT NULL UNIQUE,
  full_name     TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dealer companies
CREATE TABLE dealers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name  TEXT        NOT NULL,
  nip           CHAR(10)    NOT NULL UNIQUE,
  address       TEXT,
  email         TEXT        NOT NULL,
  phone         TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dealer staff accounts
CREATE TABLE dealer_users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dealer_id     UUID        NOT NULL REFERENCES dealers(id) ON DELETE CASCADE,
  auth0_sub     TEXT        NOT NULL UNIQUE,
  email         TEXT        NOT NULL UNIQUE,
  full_name     TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'agent'
                            CHECK (role IN ('agent', 'manager')),
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dealer_users_dealer_id ON dealer_users(dealer_id);
