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
        COUNT(*) FILTER (WHERE verdict = 'GREEN') AS green,
        COUNT(*) FILTER (WHERE verdict = 'AMBER') AS amber,
        COUNT(*) FILTER (WHERE verdict = 'RED')   AS red,
        COUNT(*)                                  AS total
      FROM vehicle_assessments
    `;

    return NextResponse.json({
      green: parseInt(rows[0].green as string, 10),
      amber: parseInt(rows[0].amber as string, 10),
      red:   parseInt(rows[0].red   as string, 10),
      total: parseInt(rows[0].total as string, 10),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
