import type { MileageTier, PremiumCalculation, PremiumPreview, MileageMultipliers } from './types';

const DEFAULT_BASE_RATE_PLN = 1200.00;
const VAT_FACTOR = 1.0; // insurance products are VAT-exempt in Poland

const DEFAULT_MILEAGE_MULTIPLIERS: MileageMultipliers = {
  low:  1.00,  // ≤ 15 000 km/year
  mid:  1.15,  // 15 001 – 25 000 km/year
  high: 1.35,  // > 25 000 km/year
};

function roundToGrosze(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function resolveBaseRate(): number {
  const env = process.env.POLICY_BASE_RATE_PLN;
  return env ? parseFloat(env) : DEFAULT_BASE_RATE_PLN;
}

/**
 * Calculates the gross premium for a given assessment multiplier and mileage tier.
 * Base rate is read from POLICY_BASE_RATE_PLN env or defaults to 1200.00 PLN.
 * Can be overridden by passing an explicit baseRate (from active rule set).
 */
export function calculatePremium(
  assessmentMultiplier: number,
  tier: MileageTier,
  baseRate?: number,
): PremiumCalculation {
  const base = baseRate ?? resolveBaseRate();
  const mileageMultiplier = DEFAULT_MILEAGE_MULTIPLIERS[tier];
  const premium_gross_pln = roundToGrosze(base * assessmentMultiplier * mileageMultiplier * VAT_FACTOR);

  return {
    base_rate_pln: base,
    assessment_multiplier: assessmentMultiplier,
    mileage_multiplier: mileageMultiplier,
    vat_factor: VAT_FACTOR,
    premium_gross_pln,
  };
}

/**
 * Returns a preview of all three mileage tiers without persisting anything.
 * Used by POST /api/policies/preview.
 */
export function buildPremiumPreview(
  assessmentMultiplier: number,
  baseRate?: number,
): PremiumPreview {
  const base = baseRate ?? resolveBaseRate();

  return {
    base_rate_pln: base,
    assessment_multiplier: assessmentMultiplier,
    tiers: {
      low: {
        multiplier: DEFAULT_MILEAGE_MULTIPLIERS.low,
        gross: roundToGrosze(base * assessmentMultiplier * DEFAULT_MILEAGE_MULTIPLIERS.low * VAT_FACTOR),
      },
      mid: {
        multiplier: DEFAULT_MILEAGE_MULTIPLIERS.mid,
        gross: roundToGrosze(base * assessmentMultiplier * DEFAULT_MILEAGE_MULTIPLIERS.mid * VAT_FACTOR),
      },
      high: {
        multiplier: DEFAULT_MILEAGE_MULTIPLIERS.high,
        gross: roundToGrosze(base * assessmentMultiplier * DEFAULT_MILEAGE_MULTIPLIERS.high * VAT_FACTOR),
      },
    },
  };
}

export { DEFAULT_MILEAGE_MULTIPLIERS, VAT_FACTOR };
