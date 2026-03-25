import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { listRoles, createRole, getRoleByName, setRolePermissions } from '@/lib/db/queries/roles';
import { createLogger } from '@/lib/logger';

const log = createLogger('api.roles');

const CreateRoleSchema = z.object({
  name: z.string().min(1).regex(/^[a-z_]+$/, 'Role name must be lowercase letters and underscores only'),
  description: z.string().nullable().optional(),
  permissions: z.array(z.string().min(1)).optional().default([]),
});

export async function GET(_req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.ADMIN);

    const roles = await listRoles();
    return NextResponse.json({ data: roles });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.ADMIN);

    const body = await req.json();
    const parsed = CreateRoleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    const { name, description, permissions } = parsed.data;

    const existing = await getRoleByName(name);
    if (existing) {
      throw new ApiError(409, 'CONFLICT', `Role "${name}" already exists`);
    }

    const role = await createRole({ name, description });
    log.info('Role created', { roleId: role.id, name });

    if (permissions.length > 0) {
      await setRolePermissions(role.id, permissions);
    }

    return NextResponse.json({ data: { ...role, permissions } }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
