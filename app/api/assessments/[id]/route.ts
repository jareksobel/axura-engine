import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { getAssessmentById } from '@/lib/db/queries/assessments';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.VEHICLE_READ);

    const { id } = await params;
    const assessment = await getAssessmentById(id);
    if (!assessment) {
      throw new ApiError(404, 'ASSESSMENT_NOT_FOUND', `Assessment ${id} not found`);
    }

    return NextResponse.json({ data: assessment });
  } catch (err) {
    return errorResponse(err);
  }
}
