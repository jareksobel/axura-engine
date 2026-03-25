import { sql } from '@/lib/db/client';

export interface RuleConfigRow {
  id: string;
  version: string;
  label: string | null;
  content_yaml: string;
  is_active: boolean;
  created_by: string | null;
  activated_at: string | null;
  created_at: string;
}

export interface CreateRuleConfigInput {
  version: string;
  label?: string | null;
  contentYaml: string;
  createdBy?: string | null;
}

export async function listRuleConfigs(): Promise<RuleConfigRow[]> {
  const rows = await sql`
    SELECT id, version, label, is_active, created_by, activated_at, created_at
    FROM rule_configs
    ORDER BY created_at DESC
  `;
  return rows as RuleConfigRow[];
}

export async function getActiveRuleConfig(): Promise<RuleConfigRow | null> {
  const rows = await sql`
    SELECT * FROM rule_configs WHERE is_active = true LIMIT 1
  `;
  return (rows[0] as RuleConfigRow) ?? null;
}

export async function getRuleConfigByVersion(version: string): Promise<RuleConfigRow | null> {
  const rows = await sql`
    SELECT * FROM rule_configs WHERE version = ${version} LIMIT 1
  `;
  return (rows[0] as RuleConfigRow) ?? null;
}

export async function createRuleConfig(input: CreateRuleConfigInput): Promise<RuleConfigRow> {
  const rows = await sql`
    INSERT INTO rule_configs (version, label, content_yaml, created_by)
    VALUES (${input.version}, ${input.label ?? null}, ${input.contentYaml}, ${input.createdBy ?? null})
    RETURNING *
  `;
  return rows[0] as RuleConfigRow;
}

/**
 * Atomically deactivates the current active rule set and activates the given version.
 * Returns the newly activated row.
 */
export async function activateRuleConfig(version: string, activatedBy: string): Promise<RuleConfigRow> {
  // Deactivate all, then activate the target
  await sql`UPDATE rule_configs SET is_active = false WHERE is_active = true`;

  const rows = await sql`
    UPDATE rule_configs
    SET is_active = true, activated_at = now()
    WHERE version = ${version}
    RETURNING *
  `;

  if (rows.length === 0) {
    throw new Error(`Rule set version '${version}' not found`);
  }

  return rows[0] as RuleConfigRow;
}
