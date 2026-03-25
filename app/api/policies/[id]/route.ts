import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { getPolicyById } from '@/lib/db/queries/policies';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.VEHICLE_READ);

    const { id } = await params;
    const policy = await getPolicyById(id);
    if (!policy) {
      throw new ApiError(404, 'POLICY_NOT_FOUND', `Policy ${id} not found`);
    }

    // Dealer users can only see their own dealer's policies
    if (ctx.dealerId && policy.dealer_id !== ctx.dealerId) {
      throw new ApiError(403, 'FORBIDDEN', 'Access denied to this policy');
    }

    return NextResponse.json({ data: policy });
  } catch (err) {
    return errorResponse(err);
  }
}
