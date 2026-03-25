import { type NextRequest, NextResponse } from 'next/server';
import { validateToken } from '@/lib/auth/middleware';
import { errorResponse } from '@/lib/errors';

export async function middleware(request: NextRequest) {
  // Health endpoint is public — no auth required
  if (request.nextUrl.pathname === '/api/health') {
    return NextResponse.next();
  }

  try {
    const ctx = await validateToken(request);

    // Attach context to request headers so route handlers can read it
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-auth-sub',         ctx.sub);
    requestHeaders.set('x-auth-permissions', JSON.stringify(ctx.permissions));
    if (ctx.dealerId) {
      requestHeaders.set('x-auth-dealer-id', ctx.dealerId);
    }

    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch (error) {
    return errorResponse(error);
  }
}

export const config = {
  matcher: '/api/:path*',
};
