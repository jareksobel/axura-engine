import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { validateRuleSet } from '@/lib/rules/validator';
import { parse as parseYaml } from 'yaml';
import { assessMobileOBDScan, isMobileScanRequest } from '@/lib/assessment/obd';
import {
  runBindTriage,
  computeScore,
  computeRate,
  runEligibility,
  type DtcEntry,
  type ParsedReport,
} from '@/lib/assessment/esi-engine';
import { sql } from '@/lib/db/client';
import type { RuleSet } from '@/lib/rules/types';
import type { Verdict } from '@/lib/types';

const SimulateSchema = z.object({
  content_yaml: z.string().min(1),
  assessment_ids: z.array(z.string().uuid()).max(200).optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

// Re-classify DTC codes using the candidate rule set's lists
function reclassifyDtcs(dtcs: DtcEntry[], rules: RuleSet): DtcEntry[] {
  const greenAllowed = new Set(rules.triage.green_allowed_dtcs);
  const redDtcs = new Set(rules.triage.red_dtcs);
  const amberDtcs = new Set(rules.triage.amber_dtcs.filter(c => !greenAllowed.has(c)));

  return dtcs.map(dtc => {
    let classification: DtcEntry['classification'];
    if (greenAllowed.has(dtc.code)) classification = 'GREEN_ALLOWED';
    else if (redDtcs.has(dtc.code)) classification = 'RED';
    else if (amberDtcs.has(dtc.code)) classification = 'AMBER';
    else if (dtc.code.startsWith('P1')) classification = 'AMBER_P1';
    else classification = 'UNKNOWN';
    return { ...dtc, classification };
  });
}

// Simulate an ESI assessment verdict using the candidate rule set and stored parsed data
function simulateEsiVerdict(storedPayload: Record<string, unknown>, candidateRules: RuleSet): Verdict {
  // The ESI payload is the full EsiAssessmentResult — extract fields needed for re-run
  const rawDtcs = (storedPayload.dtcs ?? []) as DtcEntry[];
  const rawReadiness = storedPayload.readiness as ParsedReport['readiness'] | undefined;
  const rawLivePids = storedPayload.livePids as ParsedReport['livePids'] | undefined;
  const rawVehicle = storedPayload.vehicle as ParsedReport['vehicle'] | undefined;

  if (!rawReadiness || !rawLivePids) {
    throw new Error('ESI payload missing readiness or livePids — legacy format');
  }

  const reclassified = reclassifyDtcs(rawDtcs, candidateRules);
  const parsedReport: ParsedReport = {
    vehicle: (rawVehicle ?? {}) as ParsedReport['vehicle'],
    dtcs: reclassified,
    dtcCount: reclassified.filter(d => d.status === 'active' || d.status === 'static' || d.status === 'stored').length,
    milOn: (storedPayload.milOn as boolean) ?? false,
    readiness: rawReadiness,
    livePids: rawLivePids,
  };

  const eligibility = runEligibility(parsedReport.vehicle, rawLivePids.odoKm, candidateRules);
  const triage = runBindTriage(parsedReport, candidateRules);
  const score = computeScore(parsedReport, triage, candidateRules);
  const rate = computeRate(triage.verdict, score.pct, eligibility.action, candidateRules);

  // Rate action DECLINE from eligibility → treat as RED for verdict comparison
  if (rate.action === 'DECLINE' && eligibility.action === 'DECLINE') return 'RED';
  return triage.verdict;
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.INSURANCE_SIMULATE);

    const body = await req.json();
    const parsed = SimulateSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    const { content_yaml, assessment_ids, limit } = parsed.data;

    // Parse and validate the candidate rule set
    let candidateRules: RuleSet;
    try {
      const parsedYaml = parseYaml(content_yaml) as unknown;
      const validation = validateRuleSet(parsedYaml);
      if (!validation.valid) {
        throw new ApiError(422, 'RULE_SET_INVALID', 'Rule set validation failed', { errors: validation.errors });
      }
      candidateRules = parsedYaml as RuleSet;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(400, 'RULE_SET_INVALID', `YAML parse error: ${String(err)}`);
    }

    // Load historical assessment payloads (OBD + ESI)
    let historicalRows: { id: string; source: string; verdict: Verdict; payload: Record<string, unknown> }[];

    if (assessment_ids && assessment_ids.length > 0) {
      const rows = await sql`
        SELECT id, source, verdict, payload
        FROM vehicle_assessments
        WHERE id = ANY(${assessment_ids}::uuid[]) AND source IN ('obd', 'esi')
        ORDER BY created_at DESC
      `;
      historicalRows = rows as typeof historicalRows;
    } else {
      const rows = await sql`
        SELECT id, source, verdict, payload
        FROM vehicle_assessments
        WHERE source IN ('obd', 'esi')
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      historicalRows = rows as typeof historicalRows;
    }

    // Re-run each historical payload through the candidate rule set
    const results = historicalRows.map(row => {
      const { payload } = row;
      let simulatedVerdict: Verdict;
      let error: string | undefined;

      try {
        if (row.source === 'obd') {
          if (!isMobileScanRequest(payload)) {
            simulatedVerdict = row.verdict;
            error = 'Legacy OBD format — skipped';
          } else {
            const result = assessMobileOBDScan(payload, candidateRules);
            simulatedVerdict = result.verdict;
          }
        } else {
          // ESI: re-run triage/scoring from stored EsiAssessmentResult payload
          simulatedVerdict = simulateEsiVerdict(payload, candidateRules);
        }
      } catch (e) {
        simulatedVerdict = row.verdict;
        error = String(e);
      }

      return {
        assessment_id: row.id,
        source: row.source,
        original_verdict: row.verdict,
        simulated_verdict: simulatedVerdict,
        changed: row.verdict !== simulatedVerdict,
        error,
      };
    });

    const changed = results.filter(r => r.changed);
    const summary = {
      total: results.length,
      total_obd: results.filter(r => r.source === 'obd').length,
      total_esi: results.filter(r => r.source === 'esi').length,
      changed: changed.length,
      unchanged: results.length - changed.length,
      verdict_diff: {
        GREEN_to_AMBER: changed.filter(r => r.original_verdict === 'GREEN' && r.simulated_verdict === 'AMBER').length,
        GREEN_to_RED:   changed.filter(r => r.original_verdict === 'GREEN' && r.simulated_verdict === 'RED').length,
        AMBER_to_GREEN: changed.filter(r => r.original_verdict === 'AMBER' && r.simulated_verdict === 'GREEN').length,
        AMBER_to_RED:   changed.filter(r => r.original_verdict === 'AMBER' && r.simulated_verdict === 'RED').length,
        RED_to_GREEN:   changed.filter(r => r.original_verdict === 'RED' && r.simulated_verdict === 'GREEN').length,
        RED_to_AMBER:   changed.filter(r => r.original_verdict === 'RED' && r.simulated_verdict === 'AMBER').length,
      },
    };

    return NextResponse.json({ data: { summary, results } });
  } catch (err) {
    return errorResponse(err);
  }
}
