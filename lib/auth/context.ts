import { headers } from 'next/headers';
import { ApiError } from '@/lib/errors';
import type { RequestContext } from '@/lib/types';

/**
 * Reads the request context injected by middleware.ts.
 * Call this at the top of every authenticated route handler.
 */
export async function getRequestContext(): Promise<RequestContext> {
  const h = await headers();

  const sub = h.get('x-auth-sub');
  const permissionsRaw = h.get('x-auth-permissions');
  const dealerId = h.get('x-auth-dealer-id') ?? undefined;

  if (!sub || !permissionsRaw) {
    // Should never happen if middleware is configured correctly
    throw new ApiError(401, 'UNAUTHORIZED', 'Missing auth context');
  }

  let permissions: string[];
  try {
    permissions = JSON.parse(permissionsRaw) as string[];
  } catch {
    throw new ApiError(401, 'UNAUTHORIZED', 'Malformed permissions claim');
  }

  return { sub, permissions, dealerId };
}
