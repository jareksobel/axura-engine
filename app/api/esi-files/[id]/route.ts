import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { getEsiFileById } from '@/lib/db/queries/esi-files';
import { getPresignedDownloadUrl } from '@/lib/r2/client';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.VEHICLE_READ);

    const { id } = await params;
    const file = await getEsiFileById(id);
    if (!file) {
      throw new ApiError(404, 'ESI_FILE_NOT_FOUND', `ESI file ${id} not found`);
    }

    const downloadUrl = await getPresignedDownloadUrl(file.r2_key);

    return NextResponse.json({ data: { ...file, downloadUrl } });
  } catch (err) {
    return errorResponse(err);
  }
}
