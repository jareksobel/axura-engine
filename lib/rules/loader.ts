import { parse as parseYaml } from 'yaml';
import { sql } from '@/lib/db/client';
import { validateRuleSet } from './validator';
import type { RuleSet } from './types';
import { ApiError } from '@/lib/errors';
import { createLogger } from '@/lib/logger';

const log = createLogger('rules.loader');

// Module-level cache — lives for one serverless invocation
let _cached: RuleSet | null = null;

/**
 * Load the active rule set from DB.
 * Cached per serverless invocation (module scope).
 */
export async function loadActiveRuleSet(): Promise<RuleSet> {
  if (_cached) return _cached;

  const rows = await sql`
    SELECT version, content_yaml
    FROM rule_configs
    WHERE is_active = true
    LIMIT 1
  `;

  if (rows.length === 0) {
    throw new ApiError(500, 'RULE_SET_NOT_FOUND', 'No active rule set configured.');
  }

  const row = rows[0];
  const parsed = parseYaml(row.content_yaml as string) as unknown;
  const { valid, errors } = validateRuleSet(parsed);

  if (!valid) {
    log.error('Active rule set failed validation', { version: row.version, errors });
    throw new ApiError(500, 'RULE_SET_INVALID', `Active rule set is invalid: ${errors[0]}`);
  }

  _cached = parsed as RuleSet;
  log.debug('Rule set loaded', { version: row.version });
  return _cached;
}

/**
 * Load a specific rule set version (for simulation or inspection).
 * Does NOT use the module-level cache.
 */
export async function loadRuleSetByVersion(version: string): Promise<RuleSet> {
  const rows = await sql`
    SELECT version, content_yaml
    FROM rule_configs
    WHERE version = ${version}
    LIMIT 1
  `;

  if (rows.length === 0) {
    throw new ApiError(404, 'RULE_SET_NOT_FOUND', `Rule set version '${version}' not found.`);
  }

  const row = rows[0];
  const parsed = parseYaml(row.content_yaml as string) as unknown;
  const { valid, errors } = validateRuleSet(parsed);

  if (!valid) {
    throw new ApiError(422, 'RULE_SET_INVALID', `Rule set is invalid: ${errors[0]}`, { errors });
  }

  return parsed as RuleSet;
}
