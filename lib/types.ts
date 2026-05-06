// ── Auth context attached to every authenticated request ─────────────────────

export interface RequestContext {
  /** Auth0 subject claim — used to look up the user in our DB */
  sub: string;
  /** Permission codes extracted from JWT claims */
  permissions: string[];
  /** Present for dealer users (from Auth0 organization metadata) */
  dealerId?: string;
}

// ── Domain types ──────────────────────────────────────────────────────────────

export type Verdict = 'GREEN' | 'AMBER' | 'RED';
export type RateAction = 'BIND' | 'HARD_INSPECTION' | 'DECLINE';
export type AssessmentSource = 'esi' | 'obd' | 'manual_review';
export type PolicyStatus = 'pending_payment' | 'active' | 'cancelled' | 'expired' | 'review_required';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';
export type MileageTier = 'low' | 'mid' | 'high';

// ── Pagination ────────────────────────────────────────────────────────────────

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ── Assessment result shapes ──────────────────────────────────────────────────

export interface DtcEntry {
  code: string;
  status: 'active' | 'stored' | 'static' | 'confirmed' | 'permanent' | 'unknown';
  description?: string;
  classification?: 'RED' | 'AMBER' | 'GREEN' | 'UNKNOWN';
  controller?: string;
}

export interface AssessmentFlags {
  RECENT_CODE_CLEARING?: boolean;
  ODO_DELTA_HIGH?: boolean;
  ODO_DELTA_MODERATE?: boolean;
  FUEL_TRIM_HIGH?: boolean;
  SENSOR_OUT_OF_RANGE?: boolean;
  [key: string]: boolean | undefined;
}

export interface AssessmentResult {
  verdict: Verdict;
  reason: string;
  score_pct?: number;
  rate_action?: RateAction;
  assessment_multiplier?: number;
  dtcs: DtcEntry[];
  flags: AssessmentFlags;
  rule_set_version?: string;
  details?: Record<string, unknown>;
}

// ── Premium calculation ───────────────────────────────────────────────────────

export interface PremiumBreakdown {
  base_rate_pln: number;
  assessment_multiplier: number;
  mileage_multiplier: number;
  premium_gross_pln: number;
  vat_factor: number;
}
