import { sql } from '@/lib/db/client';
import type { PolicyStatus, PaymentStatus, MileageTier } from '@/lib/types';

// ── Row type (matches policies table exactly) ─────────────────────────────────

export interface PolicyRow {
  id: string;
  policy_number: string;

  dealer_id: string;
  dealer_user_id: string;
  assessment_id: string;

  vin: string;
  make: string;
  model: string;
  year: number;
  engine_type: string | null;
  fuel_type: string | null;
  odo_at_inspection_km: number;
  odo_at_policy_km: number;
  license_plate: string | null;
  annual_mileage_tier: MileageTier;

  customer_first_name: string;
  customer_last_name: string;
  customer_pesel: string;
  customer_address: string;
  customer_email: string;
  customer_phone: string;

  base_rate_pln: string;         // NUMERIC → string from neon
  assessment_multiplier: string;
  mileage_multiplier: string;
  premium_gross_pln: string;

  start_date: string;
  end_date: string;

  status: PolicyStatus;
  odo_delta_flag: boolean;

  p24_order_id: string | null;
  p24_transaction_id: string | null;
  payment_status: PaymentStatus;
  paid_at: string | null;

  pdf_r2_key: string | null;
  pdf_generated_at: string | null;

  created_at: string;
  updated_at: string;
}

// ── Insert ────────────────────────────────────────────────────────────────────

export interface InsertPolicyInput {
  policyNumber: string;
  dealerId: string;
  dealerUserId: string;
  assessmentId: string;

  vin: string;
  make: string;
  model: string;
  year: number;
  engineType?: string | null;
  fuelType?: string | null;
  odoAtInspectionKm: number;
  odoAtPolicyKm: number;
  licensePlate?: string | null;
  annualMileageTier: MileageTier;

  customerFirstName: string;
  customerLastName: string;
  customerPesel: string;
  customerAddress: string;
  customerEmail: string;
  customerPhone: string;

  baseRatePln: number;
  assessmentMultiplier: number;
  mileageMultiplier: number;
  premiumGrossPln: number;

  startDate: string;  // ISO date e.g. '2026-04-01'
  endDate: string;

  odoDeltaFlag?: boolean;
}

export async function insertPolicy(input: InsertPolicyInput): Promise<string> {
  const rows = await sql`
    INSERT INTO policies (
      policy_number,
      dealer_id, dealer_user_id, assessment_id,
      vin, make, model, year, engine_type, fuel_type,
      odo_at_inspection_km, odo_at_policy_km, license_plate, annual_mileage_tier,
      customer_first_name, customer_last_name, customer_pesel,
      customer_address, customer_email, customer_phone,
      base_rate_pln, assessment_multiplier, mileage_multiplier, premium_gross_pln,
      start_date, end_date,
      odo_delta_flag,
      status, payment_status
    ) VALUES (
      ${input.policyNumber},
      ${input.dealerId}, ${input.dealerUserId}, ${input.assessmentId},
      ${input.vin.toUpperCase()}, ${input.make}, ${input.model}, ${input.year},
      ${input.engineType ?? null}, ${input.fuelType ?? null},
      ${input.odoAtInspectionKm}, ${input.odoAtPolicyKm},
      ${input.licensePlate ?? null}, ${input.annualMileageTier},
      ${input.customerFirstName}, ${input.customerLastName}, ${input.customerPesel},
      ${input.customerAddress}, ${input.customerEmail}, ${input.customerPhone},
      ${input.baseRatePln}, ${input.assessmentMultiplier}, ${input.mileageMultiplier}, ${input.premiumGrossPln},
      ${input.startDate}, ${input.endDate},
      ${input.odoDeltaFlag ?? false},
      'pending_payment', 'unpaid'
    )
    RETURNING id
  `;
  return rows[0].id as string;
}

// ── Fetch ─────────────────────────────────────────────────────────────────────

export async function getPolicyById(id: string): Promise<PolicyRow | null> {
  const rows = await sql`SELECT * FROM policies WHERE id = ${id} LIMIT 1`;
  return (rows[0] as PolicyRow) ?? null;
}

export async function getPolicyByNumber(policyNumber: string): Promise<PolicyRow | null> {
  const rows = await sql`SELECT * FROM policies WHERE policy_number = ${policyNumber} LIMIT 1`;
  return (rows[0] as PolicyRow) ?? null;
}

// ── List ──────────────────────────────────────────────────────────────────────

export interface ListPoliciesFilter {
  dealerId?: string;
  vin?: string;
  status?: PolicyStatus;
  customerPesel?: string;
  page?: number;
  limit?: number;
}

export async function listPolicies(
  filter: ListPoliciesFilter = {},
): Promise<{ data: PolicyRow[]; total: number }> {
  const page   = filter.page ?? 1;
  const limit  = Math.min(filter.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const rows = await sql`
    SELECT * FROM policies
    WHERE
      (${filter.dealerId ?? null} IS NULL OR dealer_id = ${filter.dealerId ?? null})
      AND (${filter.vin ?? null} IS NULL OR vin = ${filter.vin ? filter.vin.toUpperCase() : null})
      AND (${filter.status ?? null} IS NULL OR status = ${filter.status ?? null})
      AND (${filter.customerPesel ?? null} IS NULL OR customer_pesel = ${filter.customerPesel ?? null})
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countRows = await sql`
    SELECT COUNT(*) AS total FROM policies
    WHERE
      (${filter.dealerId ?? null} IS NULL OR dealer_id = ${filter.dealerId ?? null})
      AND (${filter.vin ?? null} IS NULL OR vin = ${filter.vin ? filter.vin.toUpperCase() : null})
      AND (${filter.status ?? null} IS NULL OR status = ${filter.status ?? null})
      AND (${filter.customerPesel ?? null} IS NULL OR customer_pesel = ${filter.customerPesel ?? null})
  `;

  return {
    data: rows as PolicyRow[],
    total: parseInt(countRows[0].total as string, 10),
  };
}

// ── Updates ───────────────────────────────────────────────────────────────────

/** Activate policy after confirmed payment */
export async function activatePolicy(
  id: string,
  p24OrderId: string,
  p24TransactionId: string,
): Promise<void> {
  await sql`
    UPDATE policies
    SET
      status             = 'active',
      payment_status     = 'paid',
      p24_order_id       = ${p24OrderId},
      p24_transaction_id = ${p24TransactionId},
      paid_at            = now()
    WHERE id = ${id}
  `;
}

/** Store the R2 key after PDF has been generated and uploaded */
export async function setPolicyPdfKey(id: string, r2Key: string): Promise<void> {
  await sql`
    UPDATE policies
    SET
      pdf_r2_key       = ${r2Key},
      pdf_generated_at = now()
    WHERE id = ${id}
  `;
}

/** Cancel a policy */
export async function cancelPolicy(id: string): Promise<void> {
  await sql`
    UPDATE policies
    SET status = 'cancelled'
    WHERE id = ${id}
  `;
}

/** Checks whether an active policy already exists for the given VIN */
export async function getActivePolicyForVin(vin: string): Promise<PolicyRow | null> {
  const rows = await sql`
    SELECT * FROM policies
    WHERE vin = ${vin.toUpperCase()}
      AND status = 'active'
    LIMIT 1
  `;
  return (rows[0] as PolicyRow) ?? null;
}
