import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { getVehicleByVin } from '@/lib/db/queries/vehicles';
import { getLatestGreenAssessment } from '@/lib/db/queries/assessments';

const ASSESSMENT_VALIDITY_DAYS = 60;

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

    const payload = assessment.payload as Record<string, unknown>;
    const inspectedAt = new Date(assessment.created_at);
    const expiresAt   = new Date(inspectedAt);
    expiresAt.setDate(expiresAt.getDate() + ASSESSMENT_VALIDITY_DAYS);

    return NextResponse.json({
      id:              assessment.id,
      vin:             assessment.vin,
      make:            vehicle.make ?? null,
      model:           vehicle.model ?? null,
      year:            vehicle.year ?? null,
      engine:          vehicle.engine_type ?? null,
      transmission:    (payload.transmission as string) ?? null,
      odoKm:           payload.odometer_km != null ? Number(payload.odometer_km) : null,
      inspectionDate:  inspectedAt.toISOString().split('T')[0],
      expiresAt:       expiresAt.toISOString().split('T')[0],
      rateMultiplier:  assessment.assessment_multiplier != null
                         ? parseFloat(assessment.assessment_multiplier)
                         : 1.0,
      verdict:         assessment.verdict,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
