import { NextResponse } from 'next/server';
import { openApiSpec } from '@/lib/openapi/spec';

/**
 * GET /api/openapi
 *
 * Returns the OpenAPI 3.1 specification as JSON.
 * Public — no auth required (handled by middleware exemption below).
 */
export function GET() {
  return NextResponse.json(openApiSpec, {
    headers: {
      // Allow any origin to fetch the spec (useful for API tooling)
      'Access-Control-Allow-Origin': '*',
    },
  });
}
