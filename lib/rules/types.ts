export interface RuleSetMeta {
  version: string;
  label: string;
  effective_from: string;
}

export interface AgeOdometerRule {
  max_age_years?: number;
  min_age_years?: number;
  max_odometer_km: number;
}

export interface SegmentHardInspectionRule {
  max_age_years: number;
  max_odometer_km: number;
}

export interface EligibilityRules {
  decline_wmi: string[];
  decline_usage_types: string[];
  decline_engine_types: string[];
  age_odometer_rules: AgeOdometerRule[];
  odo_delta_decline_pct: number;
  odo_delta_amber_pct: number;
  segment_d_suv_hard_inspection: SegmentHardInspectionRule;
  suv_premium_always_hard_inspection: boolean;
}

export interface AssessmentThresholds {
  // OBD2 path
  dtc_count_red: number;
  dtc_count_mil_red: number;
  incomplete_monitors_red: number;
  fuel_trim_sum_amber: number;
  fuel_trim_sum_green: number;
  km_since_clear_min: number;
  warmups_since_clear_min: number;
  km_since_clear_fraud: number;
  // Sensor ranges
  ect_min_c: number;
  ect_max_c: number;
  map_idle_min_kpa: number;
  map_idle_max_kpa: number;
  tps_idle_max_pct: number;
}

export interface ScoringCategoryRules {
  weight: number;
  rules: Record<string, number>;
}

export interface ScoringRubric {
  categories: Record<string, ScoringCategoryRules>;
}

export interface AssessmentMultiplierBand {
  min_score_pct: number;
  max_score_pct: number;
  multiplier: number | null;
  action: 'BIND' | 'HARD_INSPECTION' | 'DECLINE';
}

export interface PricingRules {
  base_rate_pln: number;
  assessment_multipliers: AssessmentMultiplierBand[];
  mileage_multipliers: { low: number; mid: number; high: number };
  vat_factor: number;
}

export interface RuleSet {
  meta: RuleSetMeta;
  triage: {
    eligibility: EligibilityRules;
    red_dtcs: string[];
    amber_dtcs: string[];
    green_allowed_dtcs: string[];
    thresholds: AssessmentThresholds;
    scoring: ScoringRubric;
  };
  pricing: PricingRules;
}
