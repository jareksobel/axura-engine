import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { getPolicyById, cancelPolicy } from '@/lib/db/queries/policies';
import { createLogger } from '@/lib/logger';

const log = createLogger('api.policies.cancel');

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.ADMIN);

    const { id } = await params;
    const policy = await getPolicyById(id);
    if (!policy) {
      throw new ApiError(404, 'POLICY_NOT_FOUND', `Policy ${id} not found`);
    }

    if (policy.status === 'cancelled') {
      throw new ApiError(409, 'CONFLICT', 'Policy is already cancelled');
    }
    if (policy.status === 'expired') {
      throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'Expired policies cannot be cancelled');
    }

    await cancelPolicy(id);

    log.info('Policy cancelled', { policyId: id, policyNumber: policy.policy_number });

    return NextResponse.json({
      data: {
        id,
        policy_number: policy.policy_number,
        status: 'cancelled',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
