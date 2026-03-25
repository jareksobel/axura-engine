import type { EligibilityRules } from '@/lib/rules/types';

export interface EligibilityResult {
  eligible: boolean;
  issues: string[];
}

export interface EligibilityInput {
  vin?: string;
  wmi?: string;
  age_years?: number;
  odo_km?: number;
  usage?: string;
  engine_type?: string; // BEV, HEV, PHEV, ICE
}

export function checkEligibility(data: EligibilityInput, rules: EligibilityRules): EligibilityResult {
  const issues: string[] = [];

  // WMI decline check (first character of WMI)
  const wmi = data.wmi ?? data.vin?.substring(0, 3);
  if (wmi && rules.decline_wmi.includes(wmi[0])) {
    issues.push('VIN_US_CAN');
  }

  // Engine type (EV/HEV/PHEV) decline check
  if (data.engine_type) {
    const et = data.engine_type.toUpperCase();
    if (rules.decline_engine_types.some(d => et.includes(d.toUpperCase()))) {
      issues.push('EV_HEV_PHEV');
    }
  }

  // Usage type decline check
  if (data.usage) {
    if (rules.decline_usage_types.includes(data.usage.toLowerCase())) {
      issues.push('USAGE_EXCLUDED');
    }
  }

  // Age/mileage check — qualifies if ANY rule passes
  if (data.age_years !== undefined && data.odo_km !== undefined) {
    const qualifies = rules.age_odometer_rules.some(rule => {
      const minAge = rule.min_age_years ?? 0;
      const maxAge = rule.max_age_years ?? Infinity;
      return data.age_years! >= minAge && data.age_years! < maxAge && data.odo_km! < rule.max_odometer_km;
    });
    if (!qualifies) {
      issues.push('AGE_MILEAGE_OUT_OF_RANGE');
    }
  }

  return { eligible: issues.length === 0, issues };
}
