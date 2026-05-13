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
        d.id           AS dealer_id,
        d.company_name AS dealer_name,
        COUNT(p.id)    AS policy_count
      FROM dealers d
      LEFT JOIN policies p ON p.dealer_id = d.id
      GROUP BY d.id, d.company_name
      ORDER BY policy_count DESC
      LIMIT 10
    `;

    return NextResponse.json({
      dealers: rows.map((r) => ({
        dealerId:    r.dealer_id    as string,
        dealerName:  r.dealer_name  as string,
        policyCount: parseInt(r.policy_count as string, 10),
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
