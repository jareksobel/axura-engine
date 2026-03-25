-- Vehicle registry
CREATE TABLE vehicles (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vin             CHAR(17)    NOT NULL UNIQUE,
  wmi             CHAR(3),                           -- WMI from VIN (first 3 chars)
  make            TEXT,
  model           TEXT,
  year            SMALLINT,
  engine_type     TEXT,                              -- from NHTSA: BEV, HEV, PHEV, ICE…
  fuel_type       TEXT,                              -- petrol, diesel, electric, hybrid
  nhtsa_raw       JSONB,                             -- full NHTSA API response
  registered_by   UUID        REFERENCES users(id),  -- Axura technician
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehicles_vin  ON vehicles(vin);
CREATE INDEX idx_vehicles_make ON vehicles(make);

-- Uploaded ESI PDFs and inspection photos
CREATE TABLE esi_files (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id      UUID        REFERENCES vehicles(id),
  file_type       TEXT        NOT NULL CHECK (file_type IN ('esi_pdf', 'inspection_photo')),
  filename        TEXT        NOT NULL,
  size_bytes      INT,
  r2_key          TEXT        NOT NULL UNIQUE,       -- path in R2 bucket
  uploaded_by     UUID        REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_esi_files_vehicle_id ON esi_files(vehicle_id);
