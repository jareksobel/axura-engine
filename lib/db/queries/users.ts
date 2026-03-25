import { sql } from '@/lib/db/client';

export interface UserRow {
  id: string;
  auth0_sub: string;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  auth0_sub: string;
  email: string;
  full_name: string;
}

export interface UpdateUserInput {
  full_name?: string;
  is_active?: boolean;
}

export interface ListUsersFilter {
  is_active?: boolean;
  page?: number;
  limit?: number;
}

export async function listUsers(filter: ListUsersFilter = {}): Promise<{ data: UserRow[]; total: number }> {
  const page = filter.page ?? 1;
  const limit = Math.min(filter.limit ?? 20, 100);
  const offset = (page - 1) * limit;
  const isActive = filter.is_active ?? null;

  const rows = await sql`
    SELECT * FROM users
    WHERE (${isActive}::boolean IS NULL OR is_active = ${isActive}::boolean)
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countRows = await sql`
    SELECT COUNT(*) AS total FROM users
    WHERE (${isActive}::boolean IS NULL OR is_active = ${isActive}::boolean)
  `;

  return {
    data: rows as UserRow[],
    total: parseInt(countRows[0].total as string, 10),
  };
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const rows = await sql`SELECT * FROM users WHERE id = ${id} LIMIT 1`;
  return (rows[0] as UserRow) ?? null;
}

export async function getUserByAuth0Sub(sub: string): Promise<UserRow | null> {
  const rows = await sql`SELECT * FROM users WHERE auth0_sub = ${sub} LIMIT 1`;
  return (rows[0] as UserRow) ?? null;
}

export async function createUser(input: CreateUserInput): Promise<UserRow> {
  const rows = await sql`
    INSERT INTO users (auth0_sub, email, full_name)
    VALUES (${input.auth0_sub}, ${input.email}, ${input.full_name})
    RETURNING *
  `;
  return rows[0] as UserRow;
}

export async function updateUser(id: string, input: UpdateUserInput): Promise<UserRow | null> {
  const rows = await sql`
    UPDATE users SET
      full_name  = COALESCE(${input.full_name ?? null}, full_name),
      is_active  = COALESCE(${input.is_active ?? null}::boolean, is_active),
      updated_at = now()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as UserRow) ?? null;
}

// ── Roles ──────────────────────────────────────────────────────────────────────

export interface UserRoleRow {
  role_id: string;
  name: string;
  description: string | null;
  assigned_at: string;
}

export async function getUserRoles(userId: string): Promise<UserRoleRow[]> {
  const rows = await sql`
    SELECT r.id AS role_id, r.name, r.description, ur.assigned_at
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = ${userId}
    ORDER BY r.name
  `;
  return rows as UserRoleRow[];
}

export async function setUserRoles(
  userId: string,
  roleIds: string[],
  assignedById: string | null,
): Promise<void> {
  await sql`DELETE FROM user_roles WHERE user_id = ${userId}`;
  for (const roleId of roleIds) {
    await sql`
      INSERT INTO user_roles (user_id, role_id, assigned_by)
      VALUES (${userId}, ${roleId}, ${assignedById})
      ON CONFLICT (user_id, role_id) DO NOTHING
    `;
  }
}

// ── Permissions ────────────────────────────────────────────────────────────────

export async function getUserEffectivePermissions(userId: string): Promise<string[]> {
  const rows = await sql`
    SELECT DISTINCT p.code
    FROM permissions p
    WHERE p.id IN (
      SELECT rp.permission_id
      FROM user_roles ur
      JOIN role_permissions rp ON rp.role_id = ur.role_id
      WHERE ur.user_id = ${userId}
      UNION
      SELECT up.permission_id
      FROM user_permissions up
      WHERE up.user_id = ${userId} AND up.granted = true
    )
    AND p.id NOT IN (
      SELECT up.permission_id
      FROM user_permissions up
      WHERE up.user_id = ${userId} AND up.granted = false
    )
    ORDER BY p.code
  `;
  return rows.map((r: { code: string }) => r.code);
}

export interface DirectPermissionRow {
  permission_id: string;
  code: string;
  granted: boolean;
}

export async function getUserDirectPermissions(userId: string): Promise<DirectPermissionRow[]> {
  const rows = await sql`
    SELECT p.id AS permission_id, p.code, up.granted
    FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = ${userId}
    ORDER BY p.code
  `;
  return rows as DirectPermissionRow[];
}

export async function setUserDirectPermissions(
  userId: string,
  permissions: Array<{ code: string; granted: boolean }>,
  assignedById: string | null,
): Promise<void> {
  await sql`DELETE FROM user_permissions WHERE user_id = ${userId}`;
  for (const perm of permissions) {
    await sql`
      INSERT INTO user_permissions (user_id, permission_id, granted, assigned_by)
      SELECT ${userId}, p.id, ${perm.granted}, ${assignedById}
      FROM permissions WHERE code = ${perm.code}
      ON CONFLICT (user_id, permission_id) DO UPDATE SET granted = EXCLUDED.granted
    `;
  }
}
