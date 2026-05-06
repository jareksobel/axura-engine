import { type NextRequest, NextResponse } from 'next/server';
import { validateToken } from '@/lib/auth/middleware';
import { errorResponse } from '@/lib/errors';
import type { RequestContext } from '@/lib/types';
import { checkRateLimit } from '@/lib/rate-limit';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { createLogger } from '@/lib/logger';

const isSkipAuth =
  process.env.SKIP_AUTH === 'true' && process.env.NODE_ENV !== 'production';

const log = createLogger('proxy');

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): HeadersInit {
  const allowed =
    origin && (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.includes('*'))
      ? origin
      : ALLOWED_ORIGINS[0] ?? '';

  return {
    'Access-Control-Allow-Origin':      allowed,
    'Access-Control-Allow-Methods':     'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':     'Authorization, Content-Type, X-Request-Id',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age':           '86400',
  };
}

// ---------------------------------------------------------------------------
// Proxy (Next.js 16 renamed "middleware" → "proxy")
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest) {
  const origin = request.headers.get('origin');

  // Handle CORS pre-flight
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
  }

  // Public endpoints — skip auth and rate limiting
  const { pathname } = request.nextUrl;
  if (pathname === '/api/health' || pathname === '/api/openapi') {
    return NextResponse.next();
  }

  // Rate limiting — key on forwarded IP or socket address
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  const rl = checkRateLimit(ip);
  if (!rl.ok) {
    log.warn('Rate limit exceeded', { ip, retryAfter: rl.retryAfter, pathname });
    return new NextResponse(
      JSON.stringify({ error: { code: 'RATE_LIMITED', message: 'Too many requests' } }),
      {
        status: 429,
        headers: {
          'Content-Type':  'application/json',
          'Retry-After':   String(rl.retryAfter),
          ...corsHeaders(origin),
        },
      },
    );
  }

  // Auth validation
  try {
    const ctx: RequestContext = isSkipAuth
      ? { sub: 'dev|mock-admin', permissions: Object.values(PERMISSIONS) }
      : await validateToken(request);

    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-auth-sub',         ctx.sub);
    requestHeaders.set('x-auth-permissions', JSON.stringify(ctx.permissions));
    if (ctx.dealerId) {
      requestHeaders.set('x-auth-dealer-id', ctx.dealerId);
    }

    const response = NextResponse.next({ request: { headers: requestHeaders } });

    // Attach CORS headers to every authenticated response
    for (const [k, v] of Object.entries(corsHeaders(origin))) {
      response.headers.set(k, v);
    }

    return response;
  } catch (error) {
    log.warn('Auth rejected', { ip, pathname, error: error instanceof Error ? error.message : String(error) });
    return errorResponse(error);
  }
}

export const config = {
  matcher: ['/api/:path*'],
};
