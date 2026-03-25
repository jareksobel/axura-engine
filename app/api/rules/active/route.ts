import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { getActiveRuleConfig } from '@/lib/db/queries/rules';

export async function GET(_req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.RULES_TRIAGE_ADMIN);

    const config = await getActiveRuleConfig();
    if (!config) {
      throw new ApiError(404, 'RULE_SET_NOT_FOUND', 'No active rule set configured');
    }

    return NextResponse.json({ data: config });
  } catch (err) {
    return errorResponse(err);
  }
}
