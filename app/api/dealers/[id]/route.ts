import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { getDealerById, updateDealer } from '@/lib/db/queries/dealers';
import { createLogger } from '@/lib/logger';

const log = createLogger('api.dealers.[id]');

const UpdateDealerSchema = z.object({
  company_name: z.string().min(1).optional(),
  address: z.string().nullable().optional(),
  email: z.string().email().optional(),
  phone: z.string().nullable().optional(),
  is_active: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.ADMIN);

    const { id } = await params;
    const dealer = await getDealerById(id);
    if (!dealer) throw new ApiError(404, 'DEALER_NOT_FOUND', `Dealer ${id} not found`);

    return NextResponse.json({ data: dealer });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.ADMIN);

    const { id } = await params;
    const dealer = await getDealerById(id);
    if (!dealer) throw new ApiError(404, 'DEALER_NOT_FOUND', `Dealer ${id} not found`);

    const body = await req.json();
    const parsed = UpdateDealerSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    const updated = await updateDealer(id, parsed.data);
    if (!updated) throw new ApiError(404, 'DEALER_NOT_FOUND', `Dealer ${id} not found`);

    log.info('Dealer updated', { dealerId: id });
    return NextResponse.json({ data: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
