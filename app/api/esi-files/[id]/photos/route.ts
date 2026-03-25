import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { getEsiFileById, createEsiFile } from '@/lib/db/queries/esi-files';
import { buildPhotoKey, getPresignedUploadUrl } from '@/lib/r2/client';

const AddPhotoSchema = z.object({
  filename: z.string().min(1),
  size_bytes: z.number().int().positive().optional(),
  content_type: z.string().default('image/jpeg'),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.VEHICLE_WRITE);

    const { id } = await params;
    const parent = await getEsiFileById(id);
    if (!parent) {
      throw new ApiError(404, 'ESI_FILE_NOT_FOUND', `ESI file ${id} not found`);
    }

    const body = await req.json();
    const parsed = AddPhotoSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    const { filename, size_bytes, content_type } = parsed.data;

    // Generate photo key and presigned upload URL
    const photoId = crypto.randomUUID();
    const r2Key = buildPhotoKey(`${photoId}-${filename}`);
    const uploadUrl = await getPresignedUploadUrl(r2Key, content_type);

    // Register the photo file record
    const photo = await createEsiFile({
      vehicleId: parent.vehicle_id,
      fileType: 'inspection_photo',
      filename,
      sizeBytes: size_bytes ?? null,
      r2Key,
      uploadedBy: ctx.sub,
    });

    return NextResponse.json({ data: { ...photo, uploadUrl } }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
