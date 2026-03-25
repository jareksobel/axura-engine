import { ApiError } from '@/lib/errors';
import type { RequestContext } from '@/lib/types';

// ── Permission codes ──────────────────────────────────────────────────────────
// These map 1:1 to rows in the `permissions` table and to Auth0 API scopes.

export const PERMISSIONS = {
  VEHICLE_WRITE:       'VEHICLE_WRITE',
  VEHICLE_READ:        'VEHICLE_READ',
  INSURANCE_SIMULATE:  'INSURANCE_SIMULATE',
  RULES_TRIAGE_ADMIN:  'RULES_TRIAGE_ADMIN',
  RULES_PRICING_ADMIN: 'RULES_PRICING_ADMIN',
  REPORTS_READ:        'REPORTS_READ',
  ADMIN:               'ADMIN',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ── Guards ────────────────────────────────────────────────────────────────────

/**
 * Throws a 403 ApiError if the request context does not include the required permission.
 * ADMIN permission grants access to everything.
 */
export function requirePermission(ctx: RequestContext, permission: Permission): void {
  if (
    ctx.permissions.includes(PERMISSIONS.ADMIN) ||
    ctx.permissions.includes(permission)
  ) {
    return;
  }
  throw new ApiError(403, 'FORBIDDEN', `Requires permission: ${permission}`);
}

/**
 * Throws a 403 if the request context does not include at least one of the given permissions.
 */
export function requireAnyPermission(ctx: RequestContext, ...perms: Permission[]): void {
  const hasAny =
    ctx.permissions.includes(PERMISSIONS.ADMIN) ||
    perms.some((p) => ctx.permissions.includes(p));
  if (!hasAny) {
    throw new ApiError(403, 'FORBIDDEN', `Requires one of: ${perms.join(', ')}`);
  }
}

export function hasPermission(ctx: RequestContext, permission: Permission): boolean {
  return (
    ctx.permissions.includes(PERMISSIONS.ADMIN) ||
    ctx.permissions.includes(permission)
  );
}
