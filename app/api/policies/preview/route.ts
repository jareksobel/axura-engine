import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { getAssessmentById } from '@/lib/db/queries/assessments';
import { buildPremiumPreview } from '@/lib/pricing/calculator';

const PreviewSchema = z.union([
  z.object({ assessment_id: z.string().uuid() }),
  z.object({ assessmentId:  z.string().uuid() }),
]).transform((v) => ({
  assessment_id: 'assessment_id' in v ? v.assessment_id : v.assessmentId,
}));

export async function POST(req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.INSURANCE_SIMULATE);

    const body   = await req.json();
    const parsed = PreviewSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    const assessment = await getAssessmentById(parsed.data.assessment_id);
    if (!assessment) {
      throw new ApiError(404, 'ASSESSMENT_NOT_FOUND', `Assessment ${parsed.data.assessment_id} not found`);
    }
    if (assessment.verdict !== 'GREEN') {
      throw new ApiError(422, 'ASSESSMENT_NOT_GREEN', 'Assessment must be GREEN for a premium preview');
    }

    const assessmentMultiplier = assessment.assessment_multiplier
      ? parseFloat(assessment.assessment_multiplier)
      : 1.0;

    const preview = buildPremiumPreview(assessmentMultiplier);

    return NextResponse.json({
      baseRate:             preview.base_rate_pln,
      assessmentMultiplier: preview.assessment_multiplier,
      tiers:                preview.tiers,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
