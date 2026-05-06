import { sql } from '@/lib/db/client';

export interface VehicleRow {
  id: string;
  vin: string;
  wmi: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  engine_type: string | null;
  fuel_type: string | null;
  nhtsa_raw: Record<string, unknown> | null;
  registered_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateVehicleInput {
  vin: string;
  wmi?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  engine_type?: string | null;
  fuel_type?: string | null;
  nhtsa_raw?: Record<string, unknown> | null;
  registered_by?: string | null;
}

export interface ListVehiclesFilter {
  make?: string;
  model?: string;
  page?: number;
  limit?: number;
}

export async function listVehicles(filter: ListVehiclesFilter = {}): Promise<{ data: VehicleRow[]; total: number }> {
  const page = filter.page ?? 1;
  const limit = Math.min(filter.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const rows = await sql`
    SELECT *
    FROM vehicles
    WHERE
      (${filter.make ?? null}::text IS NULL OR make ILIKE ${filter.make ? `%${filter.make}%` : ''})
      AND (${filter.model ?? null}::text IS NULL OR model ILIKE ${filter.model ? `%${filter.model}%` : ''})
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countRows = await sql`
    SELECT COUNT(*) AS total
    FROM vehicles
    WHERE
      (${filter.make ?? null}::text IS NULL OR make ILIKE ${filter.make ? `%${filter.make}%` : ''})
      AND (${filter.model ?? null}::text IS NULL OR model ILIKE ${filter.model ? `%${filter.model}%` : ''})
  `;

  return {
    data: rows as VehicleRow[],
    total: parseInt(countRows[0].total as string, 10),
  };
}

export async function getVehicleByVin(vin: string): Promise<VehicleRow | null> {
  const rows = await sql`
    SELECT * FROM vehicles WHERE vin = ${vin.toUpperCase()} LIMIT 1
  `;
  return (rows[0] as VehicleRow) ?? null;
}

export async function getVehicleById(id: string): Promise<VehicleRow | null> {
  const rows = await sql`
    SELECT * FROM vehicles WHERE id = ${id} LIMIT 1
  `;
  return (rows[0] as VehicleRow) ?? null;
}

export async function createVehicle(input: CreateVehicleInput): Promise<VehicleRow> {
  const rows = await sql`
    INSERT INTO vehicles (vin, wmi, make, model, year, engine_type, fuel_type, nhtsa_raw, registered_by)
    VALUES (
      ${input.vin.toUpperCase()},
      ${input.wmi ?? null},
      ${input.make ?? null},
      ${input.model ?? null},
      ${input.year ?? null},
      ${input.engine_type ?? null},
      ${input.fuel_type ?? null},
      ${input.nhtsa_raw ?? null},
      ${input.registered_by ?? null}
    )
    RETURNING *
  `;
  return rows[0] as VehicleRow;
}

export async function upsertVehicle(input: CreateVehicleInput): Promise<VehicleRow> {
  const rows = await sql`
    INSERT INTO vehicles (vin, wmi, make, model, year, engine_type, fuel_type, nhtsa_raw, registered_by)
    VALUES (
      ${input.vin.toUpperCase()},
      ${input.wmi ?? null},
      ${input.make ?? null},
      ${input.model ?? null},
      ${input.year ?? null},
      ${input.engine_type ?? null},
      ${input.fuel_type ?? null},
      ${input.nhtsa_raw ?? null},
      ${input.registered_by ?? null}
    )
    ON CONFLICT (vin) DO UPDATE SET
      make        = COALESCE(EXCLUDED.make, vehicles.make),
      model       = COALESCE(EXCLUDED.model, vehicles.model),
      year        = COALESCE(EXCLUDED.year, vehicles.year),
      engine_type = COALESCE(EXCLUDED.engine_type, vehicles.engine_type),
      fuel_type   = COALESCE(EXCLUDED.fuel_type, vehicles.fuel_type),
      nhtsa_raw   = COALESCE(EXCLUDED.nhtsa_raw, vehicles.nhtsa_raw),
      updated_at  = now()
    RETURNING *
  `;
  return rows[0] as VehicleRow;
}
