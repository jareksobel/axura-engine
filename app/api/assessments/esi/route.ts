import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { getVehicleByVin } from '@/lib/db/queries/vehicles';
import { getEsiFileById } from '@/lib/db/queries/esi-files';
import { runEsiExtraction } from '@/lib/pdf/esi-extract';
import { createLogger } from '@/lib/logger';

const log = createLogger('api.assessments.esi');

const TriggerEsiSchema = z.object({
  vin: z.string().length(17).toUpperCase(),
  esi_file_id: z.string().uuid(),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.VEHICLE_WRITE);

    const body = await req.json();
    const parsed = TriggerEsiSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    const { vin, esi_file_id } = parsed.data;

    // Verify vehicle exists
    const vehicle = await getVehicleByVin(vin);
    if (!vehicle) {
      throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle ${vin} not found`);
    }

    // Verify ESI file exists
    const file = await getEsiFileById(esi_file_id);
    if (!file) {
      throw new ApiError(404, 'ESI_FILE_NOT_FOUND', `ESI file ${esi_file_id} not found`);
    }

    log.info('Triggering ESI assessment', { vin, esiFileId: esi_file_id });

    const { assessmentId, result } = await runEsiExtraction({
      esiFileId: esi_file_id,
      vehicleId: vehicle.id,
      vin,
      assessedBy: ctx.sub,
    });

    return NextResponse.json({
      data: {
        assessment_id: assessmentId,
        verdict: result.verdict,
        score_pct: result.score_pct,
        rate_action: result.rate_action,
        reason: result.reason,
      },
    }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
