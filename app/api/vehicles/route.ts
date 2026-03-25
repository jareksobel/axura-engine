import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { listVehicles, createVehicle, getVehicleByVin } from '@/lib/db/queries/vehicles';
import { isValidVin, extractWmi, decodeVin } from '@/lib/vin/decoder';
import { createLogger } from '@/lib/logger';

const log = createLogger('api.vehicles');

const CreateVehicleSchema = z.object({
  vin: z.string().length(17).toUpperCase(),
  usage: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.VEHICLE_READ);

    const { searchParams } = req.nextUrl;
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);
    const make = searchParams.get('make') ?? undefined;
    const model = searchParams.get('model') ?? undefined;

    const { data, total } = await listVehicles({ page, limit, make, model });

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

export async function POST(req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.VEHICLE_WRITE);

    const body = await req.json();
    const parsed = CreateVehicleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    const { vin, usage } = parsed.data;

    if (!isValidVin(vin)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid VIN format');
    }

    // Check for existing vehicle
    const existing = await getVehicleByVin(vin);
    if (existing) {
      throw new ApiError(409, 'VIN_ALREADY_REGISTERED', `VIN ${vin} is already registered`);
    }

    // NHTSA decode (best-effort)
    const nhtsa = await decodeVin(vin);
    log.info('VIN decoded', { vin, make: nhtsa?.make, model: nhtsa?.model });

    const vehicle = await createVehicle({
      vin,
      wmi: extractWmi(vin),
      make: nhtsa?.make ?? null,
      model: nhtsa?.model ?? null,
      year: nhtsa?.year ?? null,
      engine_type: nhtsa?.engine_type ?? null,
      fuel_type: nhtsa?.fuel_type ?? null,
      nhtsa_raw: nhtsa?.raw ?? null,
      registered_by: ctx.sub,
    });

    return NextResponse.json({ data: vehicle }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
