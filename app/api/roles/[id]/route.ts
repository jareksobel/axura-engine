import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import {
  getRoleById,
  updateRole,
  deleteRole,
  isRoleInUse,
  setRolePermissions,
} from '@/lib/db/queries/roles';
import { createLogger } from '@/lib/logger';

const log = createLogger('api.roles.[id]');

const UpdateRoleSchema = z.object({
  name: z.string().min(1).regex(/^[a-z_]+$/, 'Role name must be lowercase letters and underscores only').optional(),
  description: z.string().nullable().optional(),
  permissions: z.array(z.string().min(1)).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.ADMIN);

    const { id } = await params;
    const role = await getRoleById(id);
    if (!role) throw new ApiError(404, 'ROLE_NOT_FOUND', `Role ${id} not found`);

    const body = await req.json();
    const parsed = UpdateRoleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    const { name, description, permissions } = parsed.data;

    const updated = await updateRole(id, { name, description });
    if (!updated) throw new ApiError(404, 'ROLE_NOT_FOUND', `Role ${id} not found`);

    if (permissions !== undefined) {
      await setRolePermissions(id, permissions);
    }

    const refreshed = await getRoleById(id);
    log.info('Role updated', { roleId: id });
    return NextResponse.json({ data: refreshed });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.ADMIN);

    const { id } = await params;
    const role = await getRoleById(id);
    if (!role) throw new ApiError(404, 'ROLE_NOT_FOUND', `Role ${id} not found`);

    const inUse = await isRoleInUse(id);
    if (inUse) {
      throw new ApiError(
        409,
        'ROLE_IN_USE',
        `Role "${role.name}" is assigned to one or more users and cannot be deleted`,
      );
    }

    await deleteRole(id);
    log.info('Role deleted', { roleId: id, name: role.name });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
