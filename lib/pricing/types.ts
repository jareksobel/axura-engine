import type { MileageTier } from '@/lib/types';

export type { MileageTier };

export interface MileageMultipliers {
  low: number;
  mid: number;
  high: number;
}

export interface PricingConfig {
  baseRatePln: number;
  mileageMultipliers: MileageMultipliers;
}

export interface PremiumCalculation {
  base_rate_pln: number;
  assessment_multiplier: number;
  mileage_multiplier: number;
  vat_factor: number;
  premium_gross_pln: number;
}

export interface PremiumPreview {
  base_rate_pln: number;
  assessment_multiplier: number;
  tiers: {
    low:  { multiplier: number; gross: number };
    mid:  { multiplier: number; gross: number };
    high: { multiplier: number; gross: number };
  };
}
