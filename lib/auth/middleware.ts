import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';
import { ApiError } from '@/lib/errors';
import type { RequestContext } from '@/lib/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('auth.middleware');

const AUDIENCE   = process.env.AUTH0_AUDIENCE!;
const ISSUER     = process.env.AUTH0_ISSUER_BASE_URL!;
const JWKS_URI   = process.env.AUTH0_JWKS_URI ?? `${ISSUER}.well-known/jwks.json`;
const CLAIMS_NS  = 'https://axura.pl/claims';

// JWKS is fetched and cached automatically by `jose`
const JWKS = createRemoteJWKSet(new URL(JWKS_URI));

/**
 * Validates the Auth0 JWT Bearer token on a request and returns the request context.
 * Throws an ApiError (401 or 403) on failure — never returns null.
 */
export async function validateToken(request: NextRequest): Promise<RequestContext> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Missing Bearer token');
  }

  const token = authHeader.slice(7);

  let payload;
  try {
    const result = await jwtVerify(token, JWKS, {
      audience: AUDIENCE,
      issuer: ISSUER.endsWith('/') ? ISSUER : `${ISSUER}/`,
    });
    payload = result.payload;
  } catch (err) {
    log.warn('JWT validation failed', err instanceof Error ? err.message : err);
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid or expired token');
  }

  // Extract permissions from custom Auth0 claim
  const permissions = (payload[`${CLAIMS_NS}/permissions`] as string[] | undefined) ?? [];

  // Extract dealer_id for dealer users (set by Auth0 Action from organization metadata)
  const dealerId = (payload[`${CLAIMS_NS}/dealer_id`] as string | undefined) ?? undefined;

  const sub = payload.sub;
  if (!sub) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Token missing subject claim');
  }

  return { sub, permissions, dealerId };
}
