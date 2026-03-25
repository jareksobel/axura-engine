import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { getVehicleByVin, upsertVehicle } from '@/lib/db/queries/vehicles';
import { insertAssessment } from '@/lib/db/queries/assessments';
import { loadActiveRuleSet } from '@/lib/rules/loader';
import { assessMobileOBDScan, isMobileScanRequest } from '@/lib/assessment/obd';
import { isValidVin, extractWmi } from '@/lib/vin/decoder';
import { createLogger } from '@/lib/logger';

const log = createLogger('api.assessments.obd');

// Minimal schema validation — MobileScanRequest is flexible, full shape validated by isMobileScanRequest
const OBDSubmitSchema = z.object({
  vehicle_metadata: z.object({
    vin: z.string().length(17),
  }).passthrough(),
}).passthrough();

export async function POST(req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.VEHICLE_WRITE);

    const body = await req.json();

    // Validate basic shape
    const schemaResult = OBDSubmitSchema.safeParse(body);
    if (!schemaResult.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid OBD request', schemaResult.error.flatten());
    }

    if (!isMobileScanRequest(body)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Payload is not a valid MobileScanRequest format');
    }

    const vin = body.vehicle_metadata.vin.toUpperCase();
    if (!isValidVin(vin)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid VIN format');
    }

    // Upsert vehicle (auto-register if not known)
    const vehicle = await upsertVehicle({
      vin,
      wmi: extractWmi(vin),
      make: body.vehicle_metadata.vehicle_make ?? null,
      model: body.vehicle_metadata.vehicle_model ?? null,
      year: body.vehicle_metadata.vehicle_year ?? null,
      registered_by: ctx.sub,
    });

    // Load rule set and run assessment
    const rules = await loadActiveRuleSet();
    const result = assessMobileOBDScan(body, rules);

    log.info('OBD assessment complete', { vin, verdict: result.verdict });

    // Persist to immutable ledger
    const assessmentId = await insertAssessment({
      vehicleId: vehicle.id,
      vin,
      source: 'obd',
      verdict: result.verdict,
      reason: result.reason,
      ruleSetVersion: rules.meta.version,
      payload: body as unknown as Record<string, unknown>,
      assessedBy: ctx.sub,
    });

    return NextResponse.json({
      data: {
        assessment_id: assessmentId,
        verdict: result.verdict,
        reason: result.reason,
        dtcs: result.dtcs,
        flags: result.flags,
      },
    }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
