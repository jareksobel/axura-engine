import { z } from 'zod';
import type { RuleSet } from './types';

const AgeOdometerRuleSchema = z.object({
  max_age_years: z.number().optional(),
  min_age_years: z.number().optional(),
  max_odometer_km: z.number().positive(),
});

const EligibilityRulesSchema = z.object({
  decline_wmi: z.array(z.string()),
  decline_usage_types: z.array(z.string()),
  decline_engine_types: z.array(z.string()),
  age_odometer_rules: z.array(AgeOdometerRuleSchema),
  odo_delta_decline_pct: z.number().positive(),
  odo_delta_amber_pct: z.number().positive(),
  segment_d_suv_hard_inspection: z.object({
    max_age_years: z.number().positive(),
    max_odometer_km: z.number().positive(),
  }),
  suv_premium_always_hard_inspection: z.boolean(),
});

const AssessmentThresholdsSchema = z.object({
  dtc_count_red: z.number().int().positive(),
  dtc_count_mil_red: z.number().int().positive(),
  incomplete_monitors_red: z.number().int().positive(),
  fuel_trim_sum_amber: z.number().positive(),
  fuel_trim_sum_green: z.number().positive(),
  km_since_clear_min: z.number().positive(),
  warmups_since_clear_min: z.number().positive(),
  km_since_clear_fraud: z.number().positive(),
  ect_min_c: z.number(),
  ect_max_c: z.number(),
  map_idle_min_kpa: z.number(),
  map_idle_max_kpa: z.number(),
  tps_idle_max_pct: z.number(),
});

const AssessmentMultiplierBandSchema = z.object({
  min_score_pct: z.number().min(0).max(100),
  max_score_pct: z.number().min(0).max(100),
  multiplier: z.number().positive().nullable(),
  action: z.enum(['BIND', 'HARD_INSPECTION', 'DECLINE']),
});

export const RuleSetSchema = z.object({
  meta: z.object({
    version: z.string().min(1),
    label: z.string(),
    effective_from: z.string(),
  }),
  triage: z.object({
    eligibility: EligibilityRulesSchema,
    red_dtcs: z.array(z.string()).min(1),
    amber_dtcs: z.array(z.string()).min(1),
    green_allowed_dtcs: z.array(z.string()),
    thresholds: AssessmentThresholdsSchema,
    scoring: z.object({
      categories: z.record(
        z.string(),
        z.object({
          weight: z.number(),
          rules: z.record(z.string(), z.number()),
        }),
      ),
    }),
  }),
  pricing: z.object({
    base_rate_pln: z.number().positive(),
    assessment_multipliers: z.array(AssessmentMultiplierBandSchema).min(1),
    mileage_multipliers: z.object({
      low: z.number().positive(),
      mid: z.number().positive(),
      high: z.number().positive(),
    }),
    vat_factor: z.number().positive(),
  }),
});

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateRuleSet(data: unknown): ValidationResult {
  const errors: string[] = [];

  // Rule 1: YAML parses + Rule 2: Zod schema validates
  const parseResult = RuleSetSchema.safeParse(data);
  if (!parseResult.success) {
    return {
      valid: false,
      errors: parseResult.error.issues.map(e => `${e.path.join('.')}: ${e.message}`),
    };
  }

  const rs = parseResult.data as RuleSet;

  // Rule 3: No overlapping RED/AMBER DTC lists
  const redSet = new Set(rs.triage.red_dtcs);
  const ambOverlap = rs.triage.amber_dtcs.filter(c => redSet.has(c));
  if (ambOverlap.length > 0) {
    errors.push(`DTC codes appear in both RED and AMBER lists: ${ambOverlap.join(', ')}`);
  }

  // Rule 4: Green-allowed codes must be in AMBER list
  const amberSet = new Set(rs.triage.amber_dtcs);
  const greenNotInAmber = rs.triage.green_allowed_dtcs.filter(c => !amberSet.has(c));
  if (greenNotInAmber.length > 0) {
    errors.push(`Green-allowed codes not in AMBER list: ${greenNotInAmber.join(', ')}`);
  }

  // Rule 5: Score bands are contiguous (cover 0–100 without gaps)
  const bands = [...rs.pricing.assessment_multipliers].sort((a, b) => a.min_score_pct - b.min_score_pct);
  if (bands.length > 0) {
    let expected = 0;
    for (const band of bands) {
      if (band.min_score_pct !== expected) {
        errors.push(`Score band gap: expected min_score_pct=${expected}, got ${band.min_score_pct}`);
        break;
      }
      expected = band.max_score_pct;
    }
    if (bands[bands.length - 1].max_score_pct !== 100) {
      errors.push(`Score bands do not cover up to 100 (last max_score_pct=${bands[bands.length - 1].max_score_pct})`);
    }
  }

  // Rule 6: Non-DECLINE bands must have a multiplier
  for (const band of rs.pricing.assessment_multipliers) {
    if (band.action !== 'DECLINE' && band.multiplier === null) {
      errors.push(`Band [${band.min_score_pct}–${band.max_score_pct}] has action ${band.action} but null multiplier`);
    }
  }

  // Rule 7: Base rate > 0 (enforced by Zod .positive())
  // Rule 8: No empty DTC lists (enforced by Zod .min(1))

  // Rule 9: Threshold ordering — decline must be stricter than amber
  const { odo_delta_decline_pct, odo_delta_amber_pct } = rs.triage.eligibility;
  if (odo_delta_decline_pct <= odo_delta_amber_pct) {
    errors.push(
      `odo_delta_decline_pct (${odo_delta_decline_pct}) must be greater than odo_delta_amber_pct (${odo_delta_amber_pct})`,
    );
  }

  // Rule 10: fuel_trim_sum_amber must be less than fuel_trim_sum_green (amber fires before green)
  const { fuel_trim_sum_amber, fuel_trim_sum_green } = rs.triage.thresholds;
  if (fuel_trim_sum_amber >= fuel_trim_sum_green) {
    errors.push(
      `fuel_trim_sum_amber (${fuel_trim_sum_amber}) must be less than fuel_trim_sum_green (${fuel_trim_sum_green})`,
    );
  }

  return { valid: errors.length === 0, errors };
}
