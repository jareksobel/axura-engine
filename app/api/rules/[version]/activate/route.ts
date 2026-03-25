import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { getRuleConfigByVersion, getActiveRuleConfig, activateRuleConfig } from '@/lib/db/queries/rules';
import { validateRuleSet } from '@/lib/rules/validator';
import { parse as parseYaml } from 'yaml';
import { sql } from '@/lib/db/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('api.rules.activate');

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ version: string }> },
) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.RULES_TRIAGE_ADMIN);

    const { version } = await params;
    const config = await getRuleConfigByVersion(version);
    if (!config) {
      throw new ApiError(404, 'RULE_SET_NOT_FOUND', `Rule set version '${version}' not found`);
    }

    if (config.is_active) {
      throw new ApiError(409, 'CONFLICT', `Rule set '${version}' is already active`);
    }

    // Re-validate before activation
    let parsedYaml: unknown;
    try {
      parsedYaml = parseYaml(config.content_yaml);
    } catch (e) {
      throw new ApiError(422, 'RULE_SET_INVALID', `YAML parse error: ${String(e)}`);
    }

    const validation = validateRuleSet(parsedYaml);
    if (!validation.valid) {
      throw new ApiError(422, 'RULE_SET_INVALID', 'Rule set validation failed', { errors: validation.errors });
    }

    // Get current active for audit log
    const previousActive = await getActiveRuleConfig();

    // Atomic swap
    const activated = await activateRuleConfig(version, ctx.sub);

    // Audit log entry
    await sql`
      INSERT INTO audit_log (action, resource_type, resource_id, performed_by, metadata)
      VALUES (
        'RULE_SET_ACTIVATED',
        'rule_config',
        ${activated.id},
        ${ctx.sub},
        ${JSON.stringify({
          version,
          previous_version: previousActive?.version ?? null,
        })}
      )
    `;

    log.info('Rule set activated', { version, previousVersion: previousActive?.version, activatedBy: ctx.sub });

    return NextResponse.json({
      data: {
        version: activated.version,
        is_active: activated.is_active,
        activated_at: activated.activated_at,
        previous_version: previousActive?.version ?? null,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
