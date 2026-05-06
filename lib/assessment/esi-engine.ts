/**
 * Axura ESI Assessment Engine
 * parse → eligibility → triage → score → rate
 * All thresholds and DTC lists are loaded from the active RuleSet.
 */

import type { RuleSet } from '@/lib/rules/types';
import type { AssessmentResult } from '@/lib/types';
import {
  parseReport,
  type DtcClass,
  type DtcEntry,
  type ParsedReport,
  type VehicleInfo,
  type ReadinessResult,
  type LivePids,
} from './esi-parsers';

export type { DtcEntry, VehicleInfo, ReadinessResult, LivePids, ParsedReport };

export type EligAction = 'PROCEED_TO_OBD' | 'HARD_INSPECTION' | 'DECLINE';
export type Verdict = 'RED' | 'AMBER' | 'GREEN';
export type RateAction = 'BIND' | 'HARD_INSPECTION' | 'DECLINE';

export interface TriageRule {
  id: string;
  codes?: string[];
  detail?: unknown;
  note?: string;
}

export interface TriageResult {
  verdict: Verdict;
  reason: string;
  triggered: TriageRule[];
}

export interface ScoreBreakdown {
  total: number;
  max: number;
  pct: number;
  breakdown: Record<string, { max: number; score: number; detail: unknown }>;
}

export interface RateResult {
  action: RateAction;
  multiplier?: number;
  premiumIndex?: number;
  tier?: string;
  reason: string;
}

export interface EsiAssessmentResult {
  pipelineVersion: string;
  vehicle: VehicleInfo;
  dtcs: DtcEntry[];
  dtcCount: number;
  milOn: boolean;
  readiness: ReadinessResult;
  livePids: LivePids;
  eligibility: { action: EligAction; reason: string; rules: TriageRule[] };
  triage: TriageResult;
  score: ScoreBreakdown;
  rate: RateResult;
  summary: {
    verdict: Verdict;
    scorePct: number;
    action: RateAction;
    premiumIndex?: number;
    reason: string;
  };
}

// ── Build DTC sets from rule set ──────────────────────────────────────────────

function buildDtcSets(rules: RuleSet) {
  const greenAllowed = new Set(rules.triage.green_allowed_dtcs);
  const redDtcs = new Set(rules.triage.red_dtcs);

  // AMBER excludes green-allowed overrides
  const amberDtcs = new Set(rules.triage.amber_dtcs.filter(c => !greenAllowed.has(c)));

  const tcmSevere = new Set(redDtcs);

  return { redDtcs, amberDtcs, greenAllowed, tcmSevere };
}

function classifyFnFromRules(rules: RuleSet): (code: string) => DtcClass {
  const greenAllowed = new Set(rules.triage.green_allowed_dtcs);
  const redDtcs = new Set(rules.triage.red_dtcs);
  const amberDtcs = new Set(rules.triage.amber_dtcs.filter(c => !greenAllowed.has(c)));

  return (code: string): DtcClass => {
    if (greenAllowed.has(code)) return 'GREEN_ALLOWED';
    if (redDtcs.has(code)) return 'RED';
    if (amberDtcs.has(code)) return 'AMBER';
    if (code.startsWith('P1')) return 'AMBER_P1';
    return 'UNKNOWN';
  };
}

// ── Eligibility ───────────────────────────────────────────────────────────────

export function runEligibility(
  vehicle: VehicleInfo,
  odoKm: number | undefined,
  rules: RuleSet,
): { action: EligAction; reason: string; rules: TriageRule[] } {
  const age = vehicle.ageYears ?? 0;
  const odo = odoKm ?? 0;
  const fuel = (vehicle.fuelType ?? '').toLowerCase();
  const { eligibility } = rules.triage;
  const triggered: TriageRule[] = [];

  // EV/HEV/PHEV decline
  if (eligibility.decline_engine_types.some(d => fuel.includes(d.toLowerCase()))) {
    return { action: 'DECLINE', reason: 'EV/HEV/PHEV out of scope', rules: triggered };
  }

  // Age/mileage check
  const qualifies = eligibility.age_odometer_rules.some(rule => {
    const minAge = rule.min_age_years ?? 0;
    const maxAge = rule.max_age_years ?? Infinity;
    return age >= minAge && age < maxAge && odo < rule.max_odometer_km;
  });

  if (odo > 0 && !qualifies) {
    triggered.push({ id: 'AGE_MILEAGE_OUT_OF_RANGE' });
    return { action: 'DECLINE', reason: 'Outside age/mileage criteria', rules: triggered };
  }

  // D/SUV hard inspection
  const model = (vehicle.model ?? '').toUpperCase();
  const isSuv = /XC|SUV|CROSSOVER|LAND|DISCOVERY|RANGER|EXPLORER/.test(model);
  const { segment_d_suv_hard_inspection } = eligibility;
  if (isSuv && (age > segment_d_suv_hard_inspection.max_age_years || odo > segment_d_suv_hard_inspection.max_odometer_km)) {
    triggered.push({ id: 'DSUV_AGE_OR_MILES' });
    return { action: 'HARD_INSPECTION', reason: 'D/SUV >8yr or >100k km → hard inspection', rules: triggered };
  }

  triggered.push({ id: 'ELIGIBLE_BASE' });
  return { action: 'PROCEED_TO_OBD', reason: 'Initial eligibility OK', rules: triggered };
}

// ── Bind Triage ───────────────────────────────────────────────────────────────

export function runBindTriage(parsed: ParsedReport, rules: RuleSet): TriageResult {
  const { redDtcs, amberDtcs, tcmSevere } = buildDtcSets(rules);
  const dtcs = parsed.dtcs;
  const confirmed = new Set(dtcs.filter(d => d.status === 'active' || d.status === 'static').map(d => d.code));
  const stored = new Set(dtcs.filter(d => d.status === 'stored').map(d => d.code));
  const p1xxx = new Set(dtcs.filter(d => d.code.startsWith('P1')).map(d => d.code));
  const triggered: TriageRule[] = [];

  // ── RED ──────────────────────────────────────────────────────────────────────
  const redHits = [...confirmed].filter(c => redDtcs.has(c));
  if (redHits.length) {
    triggered.push({ id: 'RED_CRITICAL_DTCS', codes: redHits });
    return { verdict: 'RED', reason: 'Critical DTCs (active/static)', triggered };
  }

  if (confirmed.has('P0700') && [...confirmed].some(c => tcmSevere.has(c))) {
    triggered.push({ id: 'TCM_SEVERE' });
    return { verdict: 'RED', reason: 'Transmission — ratio/solenoids', triggered };
  }

  const ecmInternalSet = new Set(['P0601', 'P0602', 'P0603', 'P0604', 'P0605', 'P0606', 'P061B']);
  const ecmHits = [...confirmed].filter(c => ecmInternalSet.has(c));
  if (ecmHits.length) {
    triggered.push({ id: 'ECM_INTERNAL', codes: ecmHits });
    return { verdict: 'RED', reason: 'ECU/PCM internal fault', triggered };
  }

  // Stored RED → AMBER with hard inspection note (pilot mode)
  const redStored = [...stored].filter(c => redDtcs.has(c));
  if (redStored.length) {
    triggered.push({ id: 'RED_STORED_DTCS', codes: redStored, note: 'stored → hard inspection' });
    return { verdict: 'AMBER', reason: `Stored critical DTCs: ${redStored.join(', ')}`, triggered };
  }

  // ── AMBER ────────────────────────────────────────────────────────────────────
  if (!parsed.readiness.coreComplete) {
    triggered.push({ id: 'READINESS_OR_RESET', detail: parsed.readiness.monitors });
    return { verdict: 'AMBER', reason: 'Readiness incomplete', triggered };
  }

  const amberHits = [...new Set([...confirmed, ...stored])].filter(c => amberDtcs.has(c));
  if (amberHits.length) {
    triggered.push({ id: 'AMBER_DTCS', codes: amberHits });
    return { verdict: 'AMBER', reason: 'Medium-severity DTCs', triggered };
  }

  const p1Unknown = [...p1xxx].filter(c => c !== 'P1000');
  if (p1Unknown.length) {
    triggered.push({ id: 'P1XXX_UNKNOWN', codes: p1Unknown });
    return { verdict: 'AMBER', reason: 'Manufacturer-specific DTCs', triggered };
  }

  if (confirmed.has('P0700') && ![...confirmed].some(c => tcmSevere.has(c))) {
    triggered.push({ id: 'TCM_SENSORS_ONLY' });
    return { verdict: 'AMBER', reason: 'Transmission — sensors only', triggered };
  }

  if (confirmed.has('P0299')) {
    triggered.push({ id: 'P0299_AMBER' });
    return { verdict: 'AMBER', reason: 'Underboost — requires verification', triggered };
  }

  const { ectC } = parsed.livePids;
  const { ect_min_c, ect_max_c } = rules.triage.thresholds;
  if (ectC !== undefined && (ectC < ect_min_c || ectC > ect_max_c)) {
    triggered.push({ id: 'ECT_OUT_OF_RANGE', detail: { ectC } });
    return { verdict: 'AMBER', reason: `ECT=${ectC}°C out of range`, triggered };
  }

  // ── GREEN ────────────────────────────────────────────────────────────────────
  const noFaults = confirmed.size === 0 && stored.size === 0 && p1Unknown.length === 0;
  if (noFaults && parsed.readiness.coreComplete) {
    triggered.push({ id: 'ALL_OK' });
    return { verdict: 'GREEN', reason: 'Parameters nominal, no DTCs', triggered };
  }

  triggered.push({ id: 'FALLBACK_AMBER' });
  return { verdict: 'AMBER', reason: 'Unknown codes or incomplete data', triggered };
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export function computeScore(parsed: ParsedReport, triage: TriageResult, rules: RuleSet): ScoreBreakdown {
  const breakdown: Record<string, { max: number; score: number; detail: unknown }> = {};
  const sc = rules.triage.scoring.categories;

  // dtc_severity
  const redCount = parsed.dtcs.filter(d => d.classification === 'RED').length;
  const amberCount = parsed.dtcs.filter(d => d.classification === 'AMBER' || d.classification === 'AMBER_P1').length;
  const dtcSevMax = sc['dtc_severity']?.weight ?? 35;
  const dtcSev = redCount > 0 ? 0 : Math.max(0, dtcSevMax - amberCount * 10);
  breakdown.dtcSeverity = { max: dtcSevMax, score: dtcSev, detail: { red: redCount, amber: amberCount } };

  // readiness_monitors
  const readMax = sc['readiness_monitors']?.weight ?? 20;
  const monitors = parsed.readiness.monitors;
  const readyCount = Object.values(monitors).filter(Boolean).length;
  const totalCore = Object.keys(monitors).length || 3;
  const readScore = parsed.readiness.coreComplete ? readMax : Math.floor(readMax * readyCount / totalCore);
  breakdown.readiness = { max: readMax, score: readScore, detail: { coreComplete: parsed.readiness.coreComplete, monitors } };

  // powertrain_live (live_pids)
  const ptMax = sc['live_pids']?.weight ?? 15;
  let ptScore = ptMax;
  const ptNotes: string[] = [];
  const { ectC } = parsed.livePids;
  const { ect_min_c, ect_max_c } = rules.triage.thresholds;
  if (ectC === undefined) {
    ptNotes.push('ECT not available');
  } else if (ectC < ect_min_c || ectC > ect_max_c) {
    ptScore = Math.max(0, ptScore - 7);
    ptNotes.push(`ECT=${ectC}°C out of range`);
  }
  breakdown.powertrainLive = { max: ptMax, score: ptScore, detail: ptNotes };

  // dtc_count
  const dcMax = 15;
  const dcScore = Math.max(0, dcMax - parsed.dtcCount * 2);
  breakdown.dtcCount = { max: dcMax, score: dcScore, detail: { count: parsed.dtcCount } };

  // mil_status
  breakdown.milStatus = { max: 10, score: parsed.milOn ? 0 : 10, detail: { milOn: parsed.milOn } };

  // odo_integrity (neutral — no ECU vs gauge delta in ESI)
  breakdown.odoIntegrity = { max: 5, score: 3, detail: 'No ECU/gauge delta in ESI PDF' };

  const total = Object.values(breakdown).reduce((s, v) => s + v.score, 0);
  const maxTotal = Object.values(breakdown).reduce((s, v) => s + v.max, 0);

  return { total, max: maxTotal, pct: Math.round((total / maxTotal) * 1000) / 10, breakdown };
}

// ── Insurance Rate ────────────────────────────────────────────────────────────

export function computeRate(verdict: Verdict, scorePct: number, eligAction: EligAction, rules: RuleSet): RateResult {
  if (eligAction === 'DECLINE') {
    return { action: 'DECLINE', reason: 'Vehicle outside eligibility criteria' };
  }
  if (verdict === 'RED') {
    return { action: 'DECLINE', reason: 'Critical faults — cannot insure' };
  }

  // Find the matching pricing band
  const bands = rules.pricing.assessment_multipliers;
  const band = bands.find(b => scorePct >= b.min_score_pct && scorePct < b.max_score_pct) ?? bands[0];

  if (band.action === 'DECLINE' || band.multiplier === null) {
    return { action: 'DECLINE', reason: `Score ${scorePct}% below minimum threshold` };
  }

  if (eligAction === 'HARD_INSPECTION' || verdict === 'AMBER' || band.action === 'HARD_INSPECTION') {
    const mult = band.multiplier;
    return {
      action: 'HARD_INSPECTION',
      multiplier: mult,
      premiumIndex: Math.round(100 * mult * 10) / 10,
      reason: `Inspection required; loading ${Math.round((mult - 1) * 100)}%`,
    };
  }

  // GREEN — use BIND tier
  const mult = band.multiplier;
  return {
    action: 'BIND',
    multiplier: mult,
    premiumIndex: Math.round(100 * mult * 10) / 10,
    tier: `Score ${scorePct}%`,
    reason: `Vehicle condition score: ${scorePct}%`,
  };
}

// ── Main Pipeline ─────────────────────────────────────────────────────────────

export async function runAssessmentPipeline(
  buffer: Uint8Array,
  rules: RuleSet,
  odoKmOverride?: number,
): Promise<EsiAssessmentResult> {
  const classifyFn = classifyFnFromRules(rules);
  const parsed = await parseReport(buffer, classifyFn);
  const odoKm = odoKmOverride ?? parsed.livePids.odoKm;
  const eligibility = runEligibility(parsed.vehicle, odoKm, rules);
  const triage = runBindTriage(parsed, rules);
  const score = computeScore(parsed, triage, rules);
  const rate = computeRate(triage.verdict, score.pct, eligibility.action, rules);

  return {
    pipelineVersion: 'axura-v1.0',
    vehicle: parsed.vehicle,
    dtcs: parsed.dtcs,
    dtcCount: parsed.dtcCount,
    milOn: parsed.milOn,
    readiness: parsed.readiness,
    livePids: parsed.livePids,
    eligibility,
    triage,
    score,
    rate,
    summary: {
      verdict: triage.verdict,
      scorePct: score.pct,
      action: rate.action,
      premiumIndex: rate.premiumIndex,
      reason: rate.reason,
    },
  };
}

// ── Adapt to AssessmentResult shape ──────────────────────────────────────────

export function toAssessmentResult(esi: EsiAssessmentResult, ruleSetVersion: string): AssessmentResult {
  return {
    verdict: esi.summary.verdict,
    reason: esi.summary.reason,
    score_pct: esi.summary.scorePct,
    rate_action: esi.summary.action,
    assessment_multiplier: esi.rate.multiplier,
    dtcs: esi.dtcs.map(d => ({
      code: d.code,
      status: d.status,
      classification: d.classification === 'GREEN_ALLOWED' ? 'GREEN' : d.classification === 'AMBER_P1' ? 'AMBER' : d.classification,
      controller: d.controller,
    })),
    flags: {},
    rule_set_version: ruleSetVersion,
    details: esi as unknown as Record<string, unknown>,
  };
}
