import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { listUsers, createUser, getUserByAuth0Sub, getUserRoles, setUserRoles } from '@/lib/db/queries/users';
import { getRoleById } from '@/lib/db/queries/roles';
import { createAuth0User, triggerPasswordResetEmail } from '@/lib/auth/management';
import { createLogger } from '@/lib/logger';

const log = createLogger('api.users');

const CreateUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  role_ids: z.array(z.string().uuid()).optional().default([]),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.ADMIN);

    const { searchParams } = req.nextUrl;
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);
    const isActiveParam = searchParams.get('is_active');
    const is_active = isActiveParam === null ? undefined : isActiveParam === 'true';

    const { data, total } = await listUsers({ page, limit, is_active });

    return NextResponse.json({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.ADMIN);

    const body = await req.json();
    const parsed = CreateUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    const { email, full_name, role_ids } = parsed.data;

    // Validate role IDs exist
    for (const roleId of role_ids) {
      const role = await getRoleById(roleId);
      if (!role) {
        throw new ApiError(404, 'ROLE_NOT_FOUND', `Role ${roleId} not found`);
      }
    }

    // Provision in Auth0 first
    const auth0User = await createAuth0User(email, full_name);
    log.info('Auth0 user created', { auth0Sub: auth0User.user_id, email });

    // Check for duplicate auth0_sub (shouldn't happen but be safe)
    const existing = await getUserByAuth0Sub(auth0User.user_id);
    if (existing) {
      throw new ApiError(409, 'CONFLICT', `User with Auth0 sub ${auth0User.user_id} already exists`);
    }

    // Persist in DB
    const user = await createUser({
      auth0_sub: auth0User.user_id,
      email,
      full_name,
    });

    // Look up the creating admin's DB record to use as assignedById
    const { getUserByAuth0Sub: getAdminUser } = await import('@/lib/db/queries/users');
    const adminUser = await getAdminUser(ctx.sub);

    if (role_ids.length > 0) {
      await setUserRoles(user.id, role_ids, adminUser?.id ?? null);
    }

    // Send password-set email
    await triggerPasswordResetEmail(email);
    log.info('Password reset email triggered', { email });

    const roles = await getUserRoles(user.id);
    return NextResponse.json({ data: { ...user, roles } }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
