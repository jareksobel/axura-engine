import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { listPolicies, insertPolicy, getActivePolicyForVin } from '@/lib/db/queries/policies';
import { getAssessmentById } from '@/lib/db/queries/assessments';
import { calculatePremium } from '@/lib/pricing/calculator';
import { generatePolicyNumber } from '@/lib/policies/number';
import { sql } from '@/lib/db/client';
import { createLogger } from '@/lib/logger';
import type { MileageTier, PolicyStatus } from '@/lib/types';

const log = createLogger('api.policies');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Look up the internal dealer_users row by Auth0 sub */
async function resolveDealerUser(
  sub: string,
): Promise<{ id: string; dealer_id: string } | null> {
  const rows = await sql`
    SELECT id, dealer_id FROM dealer_users WHERE auth0_sub = ${sub} AND is_active = true LIMIT 1
  `;
  if (!rows[0]) return null;
  return rows[0] as { id: string; dealer_id: string };
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const CreatePolicySchema = z.union([
  // camelCase flat (Showroom format)
  z.object({
    assessmentId:       z.string().uuid(),
    vin:                z.string().length(17).toUpperCase(),
    odoPolicyKm:        z.number().int().positive(),
    licensePlate:       z.string().optional(),
    annualMileageTier:  z.enum(['low', 'mid', 'high']),
    startDate:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    customerFirstName:  z.string().min(1),
    customerLastName:   z.string().min(1),
    customerPesel:      z.string().length(11).regex(/^\d{11}$/),
    customerAddress:    z.string().min(1),
    customerEmail:      z.email(),
    customerPhone:      z.string().length(9).regex(/^\d{9}$/),
  }).transform((v) => ({
    assessment_id:       v.assessmentId,
    vin:                 v.vin,
    odo_at_policy_km:    v.odoPolicyKm,
    license_plate:       v.licensePlate,
    annual_mileage_tier: v.annualMileageTier,
    start_date:          v.startDate,
    customer: {
      first_name: v.customerFirstName,
      last_name:  v.customerLastName,
      pesel:      v.customerPesel,
      address:    v.customerAddress,
      email:      v.customerEmail,
      phone:      v.customerPhone,
    },
  })),
  // snake_case nested (original / Command format)
  z.object({
    assessment_id:        z.string().uuid(),
    vin:                  z.string().length(17).toUpperCase(),
    odo_at_policy_km:     z.number().int().positive(),
    license_plate:        z.string().optional(),
    annual_mileage_tier:  z.enum(['low', 'mid', 'high']),
    start_date:           z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    customer: z.object({
      first_name: z.string().min(1),
      last_name:  z.string().min(1),
      pesel:      z.string().length(11).regex(/^\d{11}$/),
      address:    z.string().min(1),
      email:      z.email(),
      phone:      z.string().length(9).regex(/^\d{9}$/),
    }),
  }),
]);

// ── GET /api/policies ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.VEHICLE_READ);

    const { searchParams } = req.nextUrl;
    const page    = parseInt(searchParams.get('page')  ?? '1',  10);
    const limit   = parseInt(searchParams.get('limit') ?? '20', 10);
    const vin     = searchParams.get('vin')     ?? undefined;
    const status  = searchParams.get('status')  as PolicyStatus | undefined;

    // Dealer users can only see their own dealer's policies
    const dealerId = ctx.dealerId ?? searchParams.get('dealer_id') ?? undefined;

    const { data: rows, total } = await listPolicies({ page, limit, vin, status, dealerId });

    const items = rows.map((p) => ({
      id:                p.id,
      policyNumber:      p.policy_number,
      vin:               p.vin,
      make:              p.make,
      model:             p.model,
      year:              p.year,
      customerFirstName: p.customer_first_name,
      customerLastName:  p.customer_last_name,
      premiumGrossPln:   parseFloat(p.premium_gross_pln),
      status:            p.status,
      odoDeltaFlag:      p.odo_delta_flag,
      startDate:         p.start_date,
      endDate:           p.end_date,
      createdAt:         p.created_at,
    }));

    return NextResponse.json({
      data: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// ── POST /api/policies ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.INSURANCE_SIMULATE);

    const body   = await req.json();
    const parsed = CreatePolicySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    const {
      assessment_id,
      vin,
      odo_at_policy_km,
      license_plate,
      annual_mileage_tier,
      start_date,
      customer,
    } = parsed.data;

    // Resolve dealer user
    const dealerUser = await resolveDealerUser(ctx.sub);
    if (!dealerUser) {
      throw new ApiError(403, 'FORBIDDEN', 'Only active dealer users can create policies');
    }

    // Fetch assessment — must be GREEN
    const assessment = await getAssessmentById(assessment_id);
    if (!assessment) {
      throw new ApiError(404, 'ASSESSMENT_NOT_FOUND', `Assessment ${assessment_id} not found`);
    }
    if (assessment.verdict !== 'GREEN') {
      throw new ApiError(422, 'ASSESSMENT_NOT_GREEN', 'Assessment must be GREEN to create a policy');
    }
    // Assessment must be ≤ 60 days old
    const ageMs = Date.now() - new Date(assessment.created_at).getTime();
    if (ageMs > 60 * 24 * 60 * 60 * 1000) {
      throw new ApiError(422, 'ASSESSMENT_TOO_OLD', 'Assessment is older than 60 days');
    }
    // VIN must match assessment
    if (assessment.vin !== vin) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'VIN does not match assessment');
    }

    // Guard: no active policy already exists for this VIN
    const existingActive = await getActivePolicyForVin(vin);
    if (existingActive) {
      throw new ApiError(409, 'POLICY_ALREADY_ACTIVE', `An active policy already exists for VIN ${vin}`);
    }

    // Calculate premium
    const assessmentMultiplier = assessment.assessment_multiplier
      ? parseFloat(assessment.assessment_multiplier)
      : 1.0;

    const premium = calculatePremium(
      assessmentMultiplier,
      annual_mileage_tier as MileageTier,
    );

    // Odo delta check: flag if policy odo significantly exceeds assessment odo
    const odoAtInspection = (assessment.payload as Record<string, unknown>)?.odometer_km
      ? Number((assessment.payload as Record<string, unknown>).odometer_km)
      : 0;
    const odoDeltaFlag = odo_at_policy_km - odoAtInspection > 1000;

    // Calculate end date (start + 12 months)
    const startDateObj = new Date(start_date);
    const endDateObj   = new Date(startDateObj);
    endDateObj.setFullYear(endDateObj.getFullYear() + 1);
    const end_date = endDateObj.toISOString().split('T')[0];

    // Generate policy number
    const policyNumber = await generatePolicyNumber(startDateObj.getFullYear());

    log.info('Creating policy', { policyNumber, vin, dealerId: dealerUser.dealer_id });

    const policyId = await insertPolicy({
      policyNumber,
      dealerId:         dealerUser.dealer_id,
      dealerUserId:     dealerUser.id,
      assessmentId:     assessment_id,
      vin,
      make:             String((assessment.payload as Record<string, unknown>)?.make ?? ''),
      model:            String((assessment.payload as Record<string, unknown>)?.model ?? ''),
      year:             Number((assessment.payload as Record<string, unknown>)?.year ?? 0),
      engineType:       String((assessment.payload as Record<string, unknown>)?.engine_type ?? '') || null,
      fuelType:         String((assessment.payload as Record<string, unknown>)?.fuel_type ?? '') || null,
      odoAtInspectionKm: odoAtInspection,
      odoAtPolicyKm:    odo_at_policy_km,
      licensePlate:     license_plate ?? null,
      annualMileageTier: annual_mileage_tier as MileageTier,
      customerFirstName: customer.first_name,
      customerLastName:  customer.last_name,
      customerPesel:     customer.pesel,
      customerAddress:   customer.address,
      customerEmail:     customer.email,
      customerPhone:     customer.phone,
      baseRatePln:        premium.base_rate_pln,
      assessmentMultiplier: premium.assessment_multiplier,
      mileageMultiplier:   premium.mileage_multiplier,
      premiumGrossPln:     premium.premium_gross_pln,
      startDate: start_date,
      endDate:   end_date,
      odoDeltaFlag,
    });

    return NextResponse.json(
      {
        id:              policyId,
        policyNumber:    policyNumber,
        status:          'pending_payment',
        premiumGrossPln: premium.premium_gross_pln,
        startDate:       start_date,
        endDate:         end_date,
        odoDeltaFlag:    odoDeltaFlag,
      },
      { status: 201 },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
