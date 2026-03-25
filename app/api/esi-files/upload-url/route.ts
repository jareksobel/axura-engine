import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { buildEsiKey, getPresignedUploadUrl } from '@/lib/r2/client';

const UploadUrlSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().default('application/pdf'),
});

export async function POST(req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.VEHICLE_WRITE);

    const body = await req.json();
    const parsed = UploadUrlSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    const { contentType } = parsed.data;
    const fileId = crypto.randomUUID();
    const r2Key = buildEsiKey(fileId);
    const uploadUrl = await getPresignedUploadUrl(r2Key, contentType);

    return NextResponse.json({ data: { fileId, r2Key, uploadUrl } });
  } catch (err) {
    return errorResponse(err);
  }
}
