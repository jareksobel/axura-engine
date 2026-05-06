import { sql } from '@/lib/db/client';
import type { Verdict, RateAction, AssessmentSource } from '@/lib/types';

export interface AssessmentRow {
  id: string;
  vehicle_id: string;
  vin: string;
  source: AssessmentSource;
  parent_assessment_id: string | null;
  esi_file_id: string | null;
  technician_note: string | null;
  verdict: Verdict;
  score_pct: string | null; // NUMERIC comes back as string from neon
  rate_action: RateAction | null;
  assessment_multiplier: string | null;
  reason: string;
  rule_set_version: string | null;
  payload: Record<string, unknown>;
  assessed_by: string | null;
  created_at: string;
}

export interface InsertAssessmentInput {
  vehicleId: string;
  vin: string;
  source: AssessmentSource;
  esiFileId?: string | null;
  parentAssessmentId?: string | null;
  technicianNote?: string | null;
  verdict: Verdict;
  scorePct?: number | null;
  rateAction?: RateAction | null;
  assessmentMultiplier?: number | null;
  reason: string;
  ruleSetVersion?: string | null;
  payload: Record<string, unknown>;
  assessedBy?: string | null;
}

export interface ListAssessmentsFilter {
  vehicleId?: string;
  vin?: string;
  verdict?: Verdict;
  source?: AssessmentSource;
  page?: number;
  limit?: number;
}

export async function insertAssessment(input: InsertAssessmentInput): Promise<string> {
  const rows = await sql`
    INSERT INTO vehicle_assessments (
      vehicle_id, vin, source, esi_file_id, parent_assessment_id,
      technician_note, verdict, score_pct, rate_action, assessment_multiplier,
      reason, rule_set_version, payload, assessed_by
    ) VALUES (
      ${input.vehicleId},
      ${input.vin.toUpperCase()},
      ${input.source},
      ${input.esiFileId ?? null},
      ${input.parentAssessmentId ?? null},
      ${input.technicianNote ?? null},
      ${input.verdict},
      ${input.scorePct ?? null},
      ${input.rateAction ?? null},
      ${input.assessmentMultiplier ?? null},
      ${input.reason},
      ${input.ruleSetVersion ?? null},
      ${JSON.stringify(input.payload)},
      ${input.assessedBy ?? null}
    )
    RETURNING id
  `;
  return rows[0].id as string;
}

export async function getAssessmentById(id: string): Promise<AssessmentRow | null> {
  const rows = await sql`
    SELECT * FROM vehicle_assessments WHERE id = ${id} LIMIT 1
  `;
  return (rows[0] as AssessmentRow) ?? null;
}

export async function listAssessments(filter: ListAssessmentsFilter = {}): Promise<{ data: AssessmentRow[]; total: number }> {
  const page = filter.page ?? 1;
  const limit = Math.min(filter.limit ?? 20, 100);
  const offset = (page - 1) * limit;

  const rows = await sql`
    SELECT * FROM vehicle_assessments
    WHERE
      (${filter.vehicleId ?? null}::text IS NULL OR vehicle_id = ${filter.vehicleId ?? null}::uuid)
      AND (${filter.vin ?? null}::text IS NULL OR vin = ${filter.vin ? filter.vin.toUpperCase() : null})
      AND (${filter.verdict ?? null}::text IS NULL OR verdict = ${filter.verdict ?? null})
      AND (${filter.source ?? null}::text IS NULL OR source = ${filter.source ?? null})
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const countRows = await sql`
    SELECT COUNT(*) AS total FROM vehicle_assessments
    WHERE
      (${filter.vehicleId ?? null}::text IS NULL OR vehicle_id = ${filter.vehicleId ?? null}::uuid)
      AND (${filter.vin ?? null}::text IS NULL OR vin = ${filter.vin ? filter.vin.toUpperCase() : null})
      AND (${filter.verdict ?? null}::text IS NULL OR verdict = ${filter.verdict ?? null})
      AND (${filter.source ?? null}::text IS NULL OR source = ${filter.source ?? null})
  `;

  return {
    data: rows as AssessmentRow[],
    total: parseInt(countRows[0].total as string, 10),
  };
}

/** Returns the most recent GREEN assessment for a VIN */
export async function getLatestGreenAssessment(vin: string): Promise<AssessmentRow | null> {
  const rows = await sql`
    SELECT * FROM vehicle_assessments
    WHERE vin = ${vin.toUpperCase()} AND verdict = 'GREEN'
    ORDER BY created_at DESC
    LIMIT 1
  `;
  return (rows[0] as AssessmentRow) ?? null;
}

/** Returns all assessments for a vehicle, newest first */
export async function getAssessmentsByVehicleId(vehicleId: string): Promise<AssessmentRow[]> {
  const rows = await sql`
    SELECT * FROM vehicle_assessments
    WHERE vehicle_id = ${vehicleId}
    ORDER BY created_at DESC
  `;
  return rows as AssessmentRow[];
}
