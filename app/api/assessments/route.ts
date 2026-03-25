import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse } from '@/lib/errors';
import { listAssessments } from '@/lib/db/queries/assessments';
import type { Verdict, AssessmentSource } from '@/lib/types';

export async function GET(req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.VEHICLE_READ);

    const { searchParams } = req.nextUrl;
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);
    const vehicleId = searchParams.get('vehicle_id') ?? undefined;
    const vin = searchParams.get('vin') ?? undefined;
    const verdict = searchParams.get('verdict') as Verdict | undefined;
    const source = searchParams.get('source') as AssessmentSource | undefined;

    const { data, total } = await listAssessments({ page, limit, vehicleId, vin, verdict, source });

    return NextResponse.json({
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
