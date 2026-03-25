import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import {
  getUserById,
  getUserByAuth0Sub,
  getUserEffectivePermissions,
  getUserDirectPermissions,
  setUserDirectPermissions,
  getUserRoles,
} from '@/lib/db/queries/users';

const SetPermissionsSchema = z.object({
  permissions: z.array(
    z.object({
      code: z.string().min(1),
      granted: z.boolean(),
    }),
  ),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.ADMIN);

    const { id } = await params;
    const user = await getUserById(id);
    if (!user) throw new ApiError(404, 'USER_NOT_FOUND', `User ${id} not found`);

    const [effective, direct, roles] = await Promise.all([
      getUserEffectivePermissions(id),
      getUserDirectPermissions(id),
      getUserRoles(id),
    ]);

    return NextResponse.json({
      data: {
        user_id: id,
        effective_permissions: effective,
        roles,
        direct_overrides: direct,
      },
    });
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
    const parsed = SetPermissionsSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    const adminUser = await getUserByAuth0Sub(ctx.sub);
    await setUserDirectPermissions(id, parsed.data.permissions, adminUser?.id ?? null);

    const [effective, direct] = await Promise.all([
      getUserEffectivePermissions(id),
      getUserDirectPermissions(id),
    ]);

    return NextResponse.json({
      data: {
        user_id: id,
        effective_permissions: effective,
        direct_overrides: direct,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
