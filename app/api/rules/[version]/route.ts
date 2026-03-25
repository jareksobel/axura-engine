import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { getRuleConfigByVersion } from '@/lib/db/queries/rules';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ version: string }> },
) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.RULES_TRIAGE_ADMIN);

    const { version } = await params;
    const config = await getRuleConfigByVersion(version);
    if (!config) {
      throw new ApiError(404, 'RULE_SET_NOT_FOUND', `Rule set version '${version}' not found`);
    }

    return NextResponse.json({ data: config });
  } catch (err) {
    return errorResponse(err);
  }
}
