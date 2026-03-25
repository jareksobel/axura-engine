import { createLogger } from '@/lib/logger';
import { getObjectAsBuffer } from '@/lib/r2/client';
import { runAssessmentPipeline, toAssessmentResult } from '@/lib/assessment/esi-engine';
import { loadActiveRuleSet } from '@/lib/rules/loader';
import { insertAssessment } from '@/lib/db/queries/assessments';
import { getEsiFileById } from '@/lib/db/queries/esi-files';
import type { AssessmentResult } from '@/lib/types';

const log = createLogger('pdf.esi-extract');

export interface EsiExtractionInput {
  esiFileId: string;
  vehicleId: string;
  vin: string;
  assessedBy?: string; // user UUID (null = system)
}

export interface EsiExtractionOutput {
  assessmentId: string;
  result: AssessmentResult;
}

/**
 * Fetch PDF from R2, run the ESI assessment pipeline, and persist to vehicle_assessments.
 * Always returns — failure is recorded as a RED verdict with reason.
 */
export async function runEsiExtraction(input: EsiExtractionInput): Promise<EsiExtractionOutput> {
  const { esiFileId, vehicleId, vin, assessedBy } = input;
  log.info('Starting ESI extraction', { esiFileId, vehicleId, vin });

  // 1. Load rule set
  const rules = await loadActiveRuleSet();

  // 2. Get file metadata to obtain the R2 key
  const file = await getEsiFileById(esiFileId);
  if (!file) {
    throw new Error(`ESI file not found: ${esiFileId}`);
  }

  // 3. Fetch PDF buffer from R2
  const buffer = await getObjectAsBuffer(file.r2_key);

  // 4. Run assessment pipeline
  const esi = await runAssessmentPipeline(buffer, rules);
  const result = toAssessmentResult(esi, rules.meta.version);

  log.info('ESI pipeline completed', {
    esiFileId,
    verdict: result.verdict,
    scorePct: result.score_pct,
    action: result.rate_action,
  });

  // 5. Persist to vehicle_assessments (immutable ledger)
  const assessmentId = await insertAssessment({
    vehicleId,
    vin,
    source: 'esi',
    esiFileId,
    verdict: result.verdict,
    scorePct: result.score_pct ?? null,
    rateAction: result.rate_action ?? null,
    assessmentMultiplier: result.assessment_multiplier ?? null,
    reason: result.reason,
    ruleSetVersion: rules.meta.version,
    payload: result.details ?? (result as unknown as Record<string, unknown>),
    assessedBy: assessedBy ?? null,
  });

  return { assessmentId, result };
}
