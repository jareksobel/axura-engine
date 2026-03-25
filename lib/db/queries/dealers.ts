import { sql } from '@/lib/db/client';

export interface DealerRow {
  id: string;
  company_name: string;
  nip: string;
  address: string | null;
  email: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DealerUserRow {
  id: string;
  dealer_id: string;
  auth0_sub: string;
  email: string;
  full_name: string;
  role: 'agent' | 'manager';
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateDealerInput {
  company_name: string;
  nip: string;
  address?: string | null;
  email: string;
  phone?: string | null;
}

export interface UpdateDealerInput {
  company_name?: string;
  address?: string | null;
  email?: string;
  phone?: string | null;
  is_active?: boolean;
}

export interface CreateDealerUserInput {
  dealer_id: string;
  auth0_sub: string;
  email: string;
  full_name: string;
  role?: 'agent' | 'manager';
}

export interface ListDealersFilter {
  is_active?: boolean;
  page?: number;
  limit?: number;
}

export async function listDealers(filter: ListDealersFilter = {}): Promise<{ data: DealerRow[]; total: number }> {
  const page = filter.page ?? 1;
  const limit = Math.min(filter.limit ?? 20, 100);
  const offset = (page - 1) * limit;
  const isActive = filter.is_active ?? null;

  const rows = await sql`
    SELECT * FROM dealers
    WHERE (${isActive}::boolean IS NULL OR is_active = ${isActive}::boolean)
    ORDER BY company_name ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countRows = await sql`
    SELECT COUNT(*) AS total FROM dealers
    WHERE (${isActive}::boolean IS NULL OR is_active = ${isActive}::boolean)
  `;

  return {
    data: rows as DealerRow[],
    total: parseInt(countRows[0].total as string, 10),
  };
}

export async function getDealerById(id: string): Promise<DealerRow | null> {
  const rows = await sql`SELECT * FROM dealers WHERE id = ${id} LIMIT 1`;
  return (rows[0] as DealerRow) ?? null;
}

export async function getDealerByNip(nip: string): Promise<DealerRow | null> {
  const rows = await sql`SELECT * FROM dealers WHERE nip = ${nip} LIMIT 1`;
  return (rows[0] as DealerRow) ?? null;
}

export async function createDealer(input: CreateDealerInput): Promise<DealerRow> {
  const rows = await sql`
    INSERT INTO dealers (company_name, nip, address, email, phone)
    VALUES (
      ${input.company_name},
      ${input.nip},
      ${input.address ?? null},
      ${input.email},
      ${input.phone ?? null}
    )
    RETURNING *
  `;
  return rows[0] as DealerRow;
}

export async function updateDealer(id: string, input: UpdateDealerInput): Promise<DealerRow | null> {
  const rows = await sql`
    UPDATE dealers SET
      company_name = COALESCE(${input.company_name ?? null}, company_name),
      address      = CASE WHEN ${Object.prototype.hasOwnProperty.call(input, 'address')} THEN ${input.address ?? null} ELSE address END,
      email        = COALESCE(${input.email ?? null}, email),
      phone        = CASE WHEN ${Object.prototype.hasOwnProperty.call(input, 'phone')} THEN ${input.phone ?? null} ELSE phone END,
      is_active    = COALESCE(${input.is_active ?? null}::boolean, is_active),
      updated_at   = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as DealerRow) ?? null;
}

// ── Dealer users ───────────────────────────────────────────────────────────────

export async function listDealerUsers(dealerId: string): Promise<DealerUserRow[]> {
  const rows = await sql`
    SELECT * FROM dealer_users
    WHERE dealer_id = ${dealerId}
    ORDER BY created_at DESC
  `;
  return rows as DealerUserRow[];
}

export async function getDealerUserById(id: string): Promise<DealerUserRow | null> {
  const rows = await sql`SELECT * FROM dealer_users WHERE id = ${id} LIMIT 1`;
  return (rows[0] as DealerUserRow) ?? null;
}

export async function getDealerUserByAuth0Sub(sub: string): Promise<DealerUserRow | null> {
  const rows = await sql`SELECT * FROM dealer_users WHERE auth0_sub = ${sub} LIMIT 1`;
  return (rows[0] as DealerUserRow) ?? null;
}

export async function createDealerUser(input: CreateDealerUserInput): Promise<DealerUserRow> {
  const rows = await sql`
    INSERT INTO dealer_users (dealer_id, auth0_sub, email, full_name, role)
    VALUES (
      ${input.dealer_id},
      ${input.auth0_sub},
      ${input.email},
      ${input.full_name},
      ${input.role ?? 'agent'}
    )
    RETURNING *
  `;
  return rows[0] as DealerUserRow;
}

export async function updateDealerUser(
  id: string,
  input: { full_name?: string; role?: 'agent' | 'manager'; is_active?: boolean },
): Promise<DealerUserRow | null> {
  const rows = await sql`
    UPDATE dealer_users SET
      full_name  = COALESCE(${input.full_name ?? null}, full_name),
      role       = COALESCE(${input.role ?? null}, role),
      is_active  = COALESCE(${input.is_active ?? null}::boolean, is_active),
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as DealerUserRow) ?? null;
}
