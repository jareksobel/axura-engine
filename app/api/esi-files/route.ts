import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { createEsiFile } from '@/lib/db/queries/esi-files';
import { getVehicleByVin } from '@/lib/db/queries/vehicles';

const RegisterEsiFileSchema = z.object({
  r2_key: z.string().min(1),
  filename: z.string().min(1),
  file_type: z.enum(['esi_pdf', 'inspection_photo']).default('esi_pdf'),
  size_bytes: z.number().int().positive().optional(),
  vin: z.string().length(17).toUpperCase().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.VEHICLE_WRITE);

    const body = await req.json();
    const parsed = RegisterEsiFileSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    const { r2_key, filename, file_type, size_bytes, vin } = parsed.data;

    // Resolve vehicle_id if VIN provided
    let vehicleId: string | null = null;
    if (vin) {
      const vehicle = await getVehicleByVin(vin);
      if (!vehicle) {
        throw new ApiError(404, 'VEHICLE_NOT_FOUND', `Vehicle ${vin} not found`);
      }
      vehicleId = vehicle.id;
    }

    const file = await createEsiFile({
      vehicleId,
      fileType: file_type,
      filename,
      sizeBytes: size_bytes ?? null,
      r2Key: r2_key,
      uploadedBy: ctx.sub,
    });

    return NextResponse.json({ data: file }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
