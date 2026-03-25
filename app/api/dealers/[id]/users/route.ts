import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import {
  getDealerById,
  listDealerUsers,
  createDealerUser,
  getDealerUserByAuth0Sub,
} from '@/lib/db/queries/dealers';
import {
  createAuth0User,
  triggerPasswordResetEmail,
  getAuth0OrganizationByDealerId,
  createAuth0Organization,
  addAuth0UserToOrganization,
} from '@/lib/auth/management';
import { createLogger } from '@/lib/logger';

const log = createLogger('api.dealers.[id].users');

const CreateDealerUserSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  role: z.enum(['agent', 'manager']).optional().default('agent'),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.ADMIN);

    const { id } = await params;
    const dealer = await getDealerById(id);
    if (!dealer) throw new ApiError(404, 'DEALER_NOT_FOUND', `Dealer ${id} not found`);

    const users = await listDealerUsers(id);
    return NextResponse.json({ data: users });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.ADMIN);

    const { id: dealerId } = await params;
    const dealer = await getDealerById(dealerId);
    if (!dealer) throw new ApiError(404, 'DEALER_NOT_FOUND', `Dealer ${dealerId} not found`);

    const body = await req.json();
    const parsed = CreateDealerUserSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    const { email, full_name, role } = parsed.data;

    // Ensure the dealer's Auth0 Organization exists
    let org = await getAuth0OrganizationByDealerId(dealerId);
    if (!org) {
      org = await createAuth0Organization(dealerId, dealer.company_name);
      log.info('Auth0 organization created', { orgId: org.id, dealerId });
    }

    // Provision Auth0 user
    const auth0User = await createAuth0User(email, full_name);
    log.info('Auth0 dealer user created', { auth0Sub: auth0User.user_id, dealerId });

    // Add user to the dealer's Auth0 organization
    await addAuth0UserToOrganization(org.id, auth0User.user_id);

    // Guard against duplicate
    const existing = await getDealerUserByAuth0Sub(auth0User.user_id);
    if (existing) {
      throw new ApiError(409, 'CONFLICT', `Dealer user with Auth0 sub ${auth0User.user_id} already exists`);
    }

    // Persist in DB
    const dealerUser = await createDealerUser({
      dealer_id: dealerId,
      auth0_sub: auth0User.user_id,
      email,
      full_name,
      role,
    });

    // Send password-set email
    await triggerPasswordResetEmail(email);
    log.info('Password reset email triggered', { email });

    return NextResponse.json({ data: dealerUser }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
