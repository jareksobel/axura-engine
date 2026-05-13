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
        COALESCE(SUM(premium_gross_pln) FILTER (WHERE payment_status = 'paid'), 0)                                                   AS total_gross_pln,
        COALESCE(SUM(premium_gross_pln) FILTER (WHERE payment_status = 'paid' AND paid_at >= date_trunc('month', now())), 0)         AS month_gross_pln
      FROM policies
    `;

    return NextResponse.json({
      totalGrossPln: parseFloat(rows[0].total_gross_pln as string),
      monthGrossPln: parseFloat(rows[0].month_gross_pln as string),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
