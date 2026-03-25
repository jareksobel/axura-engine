import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { validateRuleSet } from '@/lib/rules/validator';
import { parse as parseYaml } from 'yaml';
import { assessMobileOBDScan, isMobileScanRequest } from '@/lib/assessment/obd';
import { sql } from '@/lib/db/client';
import type { RuleSet } from '@/lib/rules/types';
import type { Verdict } from '@/lib/types';

const SimulateSchema = z.object({
  content_yaml: z.string().min(1),
  assessment_ids: z.array(z.string().uuid()).max(200).optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

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

    // Load historical OBD assessment payloads
    let historicalRows: { id: string; verdict: Verdict; payload: Record<string, unknown> }[];

    if (assessment_ids && assessment_ids.length > 0) {
      const rows = await sql`
        SELECT id, verdict, payload
        FROM vehicle_assessments
        WHERE id = ANY(${assessment_ids}::uuid[]) AND source = 'obd'
        ORDER BY created_at DESC
      `;
      historicalRows = rows as typeof historicalRows;
    } else {
      const rows = await sql`
        SELECT id, verdict, payload
        FROM vehicle_assessments
        WHERE source = 'obd'
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      historicalRows = rows as typeof historicalRows;
    }

    // Re-run each historical OBD payload through the candidate rule set
    const results = historicalRows.map(row => {
      const payload = row.payload;
      let simulatedVerdict: Verdict;
      let error: string | undefined;

      try {
        if (!isMobileScanRequest(payload)) {
          simulatedVerdict = row.verdict; // Can't re-run legacy format — keep original
          error = 'Legacy format — skipped';
        } else {
          const result = assessMobileOBDScan(payload, candidateRules);
          simulatedVerdict = result.verdict;
        }
      } catch (e) {
        simulatedVerdict = row.verdict;
        error = String(e);
      }

      return {
        assessment_id: row.id,
        original_verdict: row.verdict,
        simulated_verdict: simulatedVerdict,
        changed: row.verdict !== simulatedVerdict,
        error,
      };
    });

    const changed = results.filter(r => r.changed);
    const summary = {
      total: results.length,
      changed: changed.length,
      unchanged: results.length - changed.length,
      verdict_diff: {
        GREEN_to_AMBER: changed.filter(r => r.original_verdict === 'GREEN' && r.simulated_verdict === 'AMBER').length,
        GREEN_to_RED: changed.filter(r => r.original_verdict === 'GREEN' && r.simulated_verdict === 'RED').length,
        AMBER_to_GREEN: changed.filter(r => r.original_verdict === 'AMBER' && r.simulated_verdict === 'GREEN').length,
        AMBER_to_RED: changed.filter(r => r.original_verdict === 'AMBER' && r.simulated_verdict === 'RED').length,
        RED_to_GREEN: changed.filter(r => r.original_verdict === 'RED' && r.simulated_verdict === 'GREEN').length,
        RED_to_AMBER: changed.filter(r => r.original_verdict === 'RED' && r.simulated_verdict === 'AMBER').length,
      },
    };

    return NextResponse.json({ data: { summary, results } });
  } catch (err) {
    return errorResponse(err);
  }
}
