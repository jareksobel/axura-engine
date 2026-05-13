import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse } from '@/lib/errors';
import { sql } from '@/lib/db/client';

export async function GET() {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.REPORTS_READ);

    const rows = await sql`
      SELECT
        COUNT(*)                                                               AS total_count,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('month', now()))      AS month_count
      FROM vehicles
    `;

    return NextResponse.json({
      totalCount: parseInt(rows[0].total_count as string, 10),
      monthCount: parseInt(rows[0].month_count as string, 10),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
