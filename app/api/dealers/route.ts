import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { listDealers, createDealer, getDealerByNip } from '@/lib/db/queries/dealers';
import { createLogger } from '@/lib/logger';

const log = createLogger('api.dealers');

const CreateDealerSchema = z.object({
  company_name: z.string().min(1),
  nip: z.string().length(10).regex(/^\d{10}$/, 'NIP must be 10 digits'),
  address: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.ADMIN);

    const { searchParams } = req.nextUrl;
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const limit = parseInt(searchParams.get('limit') ?? '20', 10);
    const isActiveParam = searchParams.get('is_active');
    const is_active = isActiveParam === null ? undefined : isActiveParam === 'true';

    const { data, total } = await listDealers({ page, limit, is_active });

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
    requirePermission(ctx, PERMISSIONS.ADMIN);

    const body = await req.json();
    const parsed = CreateDealerSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    const { company_name, nip, address, email, phone } = parsed.data;

    const existing = await getDealerByNip(nip);
    if (existing) {
      throw new ApiError(409, 'CONFLICT', `Dealer with NIP ${nip} already exists`);
    }

    const dealer = await createDealer({ company_name, nip, address, email, phone });
    log.info('Dealer created', { dealerId: dealer.id, nip });

    return NextResponse.json({ data: dealer }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
