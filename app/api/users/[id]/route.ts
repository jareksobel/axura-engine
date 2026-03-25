import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import {
  getUserById,
  getUserByAuth0Sub,
  updateUser,
  getUserRoles,
  setUserRoles,
} from '@/lib/db/queries/users';
import { getRoleById } from '@/lib/db/queries/roles';
import { setAuth0UserBlocked } from '@/lib/auth/management';
import { createLogger } from '@/lib/logger';

const log = createLogger('api.users.[id]');

const UpdateUserSchema = z.object({
  full_name: z.string().min(1).optional(),
  is_active: z.boolean().optional(),
  role_ids: z.array(z.string().uuid()).optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.ADMIN);

    const { id } = await params;
    const user = await getUserById(id);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', `User ${id} not found`);

    const roles = await getUserRoles(id);
    return NextResponse.json({ data: { ...user, roles } });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.ADMIN);

    const { id } = await params;
    const user = await getUserById(id);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', `User ${id} not found`);

    const body = await req.json();
    const parsed = UpdateUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    const { full_name, is_active, role_ids } = parsed.data;

    // Validate roles if provided
    if (role_ids) {
      for (const roleId of role_ids) {
        const role = await getRoleById(roleId);
        if (!role) throw new ApiError(404, 'ROLE_NOT_FOUND', `Role ${roleId} not found`);
      }
    }

    // Sync Auth0 blocked status if is_active changes
    if (typeof is_active === 'boolean' && is_active !== user.is_active) {
      await setAuth0UserBlocked(user.auth0_sub, !is_active);
      log.info('Auth0 user blocked status updated', { auth0Sub: user.auth0_sub, blocked: !is_active });
    }

    const updated = await updateUser(id, { full_name, is_active });
    if (!updated) throw new ApiError(404, 'USER_NOT_FOUND', `User ${id} not found`);

    if (role_ids !== undefined) {
      const adminUser = await getUserByAuth0Sub(ctx.sub);
      await setUserRoles(id, role_ids, adminUser?.id ?? null);
    }

    const roles = await getUserRoles(id);
    return NextResponse.json({ data: { ...updated, roles } });
  } catch (err) {
    return errorResponse(err);
  }
}
