import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { getVehicleByVin } from '@/lib/db/queries/vehicles';
import { getLatestGreenAssessment } from '@/lib/db/queries/assessments';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ vin: string }> },
) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.VEHICLE_READ);

    const { vin } = await params;
    const vehicle = await getVehicleByVin(vin.toUpperCase());
    if (!vehicle) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle ${vin} not found`);
    }

    const assessment = await getLatestGreenAssessment(vin.toUpperCase());
    if (!assessment) {
      throw new ApiError(404, 'ASSESSMENT_NOT_FOUND', `No GREEN assessment found for ${vin}`);
    }

    return NextResponse.json({ data: assessment });
  } catch (err) {
    return errorResponse(err);
  }
}
