import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { getAssessmentById, insertAssessment } from '@/lib/db/queries/assessments';
import { loadActiveRuleSet } from '@/lib/rules/loader';

const ReviewSchema = z.object({
  verdict: z.enum(['GREEN', 'AMBER', 'RED']),
  reason: z.string().min(1),
  technician_note: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.RULES_TRIAGE_ADMIN);

    const { id } = await params;
    const original = await getAssessmentById(id);
    if (!original) {
      throw new ApiError(404, 'ASSESSMENT_NOT_FOUND', `Assessment ${id} not found`);
    }

    const body = await req.json();
    const parsed = ReviewSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    const { verdict, reason, technician_note } = parsed.data;
    const rules = await loadActiveRuleSet();

    // Manual review = new immutable record with parent_assessment_id
    const reviewId = await insertAssessment({
      vehicleId: original.vehicle_id,
      vin: original.vin,
      source: 'manual_review',
      parentAssessmentId: original.id,
      esiFileId: original.esi_file_id,
      technicianNote: technician_note ?? null,
      verdict,
      reason,
      ruleSetVersion: rules.meta.version,
      payload: { original_assessment_id: original.id, override_reason: reason },
      assessedBy: ctx.sub,
    });

    return NextResponse.json({
      data: { review_id: reviewId, verdict, reason },
    }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
