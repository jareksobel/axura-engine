import { sql } from '@/lib/db/client';

export interface RoleRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface RoleWithPermissionsRow extends RoleRow {
  permissions: string[];
}

export async function listRoles(): Promise<RoleWithPermissionsRow[]> {
  const roles = await sql`SELECT * FROM roles ORDER BY name`;

  const perms = await sql`
    SELECT rp.role_id, p.code
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    ORDER BY p.code
  `;

  const permMap = new Map<string, string[]>();
  for (const row of perms as { role_id: string; code: string }[]) {
    const existing = permMap.get(row.role_id) ?? [];
    existing.push(row.code);
    permMap.set(row.role_id, existing);
  }

  return (roles as RoleRow[]).map((r) => ({
    ...r,
    permissions: permMap.get(r.id) ?? [],
  }));
}

export async function getRoleById(id: string): Promise<RoleWithPermissionsRow | null> {
  const roles = await sql`SELECT * FROM roles WHERE id = ${id} LIMIT 1`;
  if (!roles[0]) return null;

  const perms = await sql`
    SELECT p.code
    FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    WHERE rp.role_id = ${id}
    ORDER BY p.code
  `;

  return {
    ...(roles[0] as RoleRow),
    permissions: (perms as { code: string }[]).map((p) => p.code),
  };
}

export async function getRoleByName(name: string): Promise<RoleRow | null> {
  const rows = await sql`SELECT * FROM roles WHERE name = ${name} LIMIT 1`;
  return (rows[0] as RoleRow) ?? null;
}

export async function createRole(input: { name: string; description?: string | null }): Promise<RoleRow> {
  const rows = await sql`
    INSERT INTO roles (name, description)
    VALUES (${input.name}, ${input.description ?? null})
    RETURNING *
  `;
  return rows[0] as RoleRow;
}

export async function updateRole(
  id: string,
  input: { name?: string; description?: string | null },
): Promise<RoleRow | null> {
  const rows = await sql`
    UPDATE roles SET
      name        = COALESCE(${input.name ?? null}, name),
      description = CASE WHEN ${Object.prototype.hasOwnProperty.call(input, 'description')} THEN ${input.description ?? null} ELSE description END
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as RoleRow) ?? null;
}

export async function deleteRole(id: string): Promise<boolean> {
  const result = await sql`DELETE FROM roles WHERE id = ${id}`;
  return (result as unknown as { rowCount: number }).rowCount > 0;
}

export async function isRoleInUse(id: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM user_roles WHERE role_id = ${id} LIMIT 1`;
  return rows.length > 0;
}

export async function setRolePermissions(roleId: string, permissionCodes: string[]): Promise<void> {
  await sql`DELETE FROM role_permissions WHERE role_id = ${roleId}`;
  for (const code of permissionCodes) {
    await sql`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT ${roleId}, p.id FROM permissions WHERE code = ${code}
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `;
  }
}

export async function getAllPermissions(): Promise<{ id: string; code: string; description: string | null }[]> {
  const rows = await sql`SELECT id, code, description FROM permissions ORDER BY code`;
  return rows as { id: string; code: string; description: string | null }[];
}
