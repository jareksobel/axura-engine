import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { NextRequest } from 'next/server';
import { ApiError } from '@/lib/errors';
import type { RequestContext } from '@/lib/types';
import { createLogger } from '@/lib/logger';

const log = createLogger('auth.middleware');

const CLAIMS_NS = 'https://axura.pl/claims';

// Lazily initialised so a missing AUTH0_ISSUER_BASE_URL during local dev
// (e.g. health checks) does not crash the proxy at module load time.
let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwks() {
  if (!_jwks) {
    const issuer  = process.env.AUTH0_ISSUER_BASE_URL!;
    const jwksUri = process.env.AUTH0_JWKS_URI ?? `${issuer.replace(/\/$/, '')}/.well-known/jwks.json`;
    _jwks = createRemoteJWKSet(new URL(jwksUri));
  }
  return _jwks;
}

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
    const issuer = process.env.AUTH0_ISSUER_BASE_URL!;
    const result = await jwtVerify(token, getJwks(), {
      audience: process.env.AUTH0_AUDIENCE!,
      issuer: issuer.endsWith('/') ? issuer : `${issuer}/`,
    });
    payload = result.payload;
  } catch (err) {
    log.warn('JWT validation failed', err instanceof Error ? err.message : err);
    throw new ApiError(401, 'UNAUTHORIZED', 'Invalid or expired token');
  }

  // Extract permissions from custom Auth0 claim (injected by Auth0 Action in prod).
  // Fall back to standard RBAC `permissions` with name normalisation for dev tenants
  // where the Action is not deployed (e.g. vehicle:read → VEHICLE_READ).
  const customClaim = payload[`${CLAIMS_NS}/permissions`] as string[] | undefined;
  const stdClaim    = payload['permissions'] as string[] | undefined;
  const permissions = customClaim
    ?? stdClaim?.map((p) => p.toUpperCase().replace(/[:\-]/g, '_'))
    ?? [];

  // Extract dealer_id for dealer users (set by Auth0 Action from organization metadata)
  const dealerId = (payload[`${CLAIMS_NS}/dealer_id`] as string | undefined) ?? undefined;

  const sub = payload.sub;
  if (!sub) {
    throw new ApiError(401, 'UNAUTHORIZED', 'Token missing subject claim');
  }

  return { sub, permissions, dealerId };
}
