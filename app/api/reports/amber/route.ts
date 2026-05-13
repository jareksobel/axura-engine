import { NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse } from '@/lib/errors';
import { sql } from '@/lib/db/client';

export async function GET() {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.REPORTS_READ);

    const queueRows = await sql`
      SELECT COUNT(*) AS queue_size
      FROM vehicle_assessments a
      WHERE a.verdict = 'AMBER'
        AND NOT EXISTS (
          SELECT 1 FROM vehicle_assessments r
          WHERE r.parent_assessment_id = a.id
        )
    `;

    const avgRows = await sql`
      SELECT AVG(
        EXTRACT(EPOCH FROM (r.created_at::timestamptz - a.created_at::timestamptz)) / 86400.0
      ) AS avg_days
      FROM vehicle_assessments a
      JOIN vehicle_assessments r ON r.parent_assessment_id = a.id
      WHERE a.verdict = 'AMBER'
    `;

    return NextResponse.json({
      queueSize:           parseInt(queueRows[0].queue_size as string, 10),
      avgDaysToResolution: avgRows[0].avg_days != null
        ? parseFloat((avgRows[0].avg_days as string))
        : 0,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
