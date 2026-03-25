import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { listRuleConfigs, createRuleConfig, getRuleConfigByVersion } from '@/lib/db/queries/rules';
import { validateRuleSet } from '@/lib/rules/validator';
import { parse as parseYaml } from 'yaml';

const CreateRuleSchema = z.object({
  version: z.string().min(1).regex(/^v\d+\.\d+/, 'Version must match pattern vX.Y'),
  label: z.string().optional(),
  content_yaml: z.string().min(1),
});

export async function GET(_req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.RULES_TRIAGE_ADMIN);

    const configs = await listRuleConfigs();

    // Omit content_yaml from list view for brevity
    const data = configs.map(({ content_yaml: _yaml, ...rest }) => rest);
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.RULES_TRIAGE_ADMIN);

    const body = await req.json();
    const parsed = CreateRuleSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    const { version, label, content_yaml } = parsed.data;

    // Check for version conflict
    const existing = await getRuleConfigByVersion(version);
    if (existing) {
      throw new ApiError(409, 'CONFLICT', `Rule set version '${version}' already exists`);
    }

    // Validate YAML content
    let parsedYaml: unknown;
    try {
      parsedYaml = parseYaml(content_yaml);
    } catch (e) {
      throw new ApiError(400, 'RULE_SET_INVALID', `YAML parse error: ${String(e)}`);
    }

    const validation = validateRuleSet(parsedYaml);
    if (!validation.valid) {
      throw new ApiError(422, 'RULE_SET_INVALID', 'Rule set validation failed', { errors: validation.errors });
    }

    const config = await createRuleConfig({
      version,
      label: label ?? null,
      contentYaml: content_yaml,
      createdBy: ctx.sub,
    });

    return NextResponse.json({ data: config }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
