import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('api.errors');

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE_VIOLATION'
  | 'INTERNAL_ERROR'
  | 'RATE_LIMITED'
  | 'VEHICLE_NOT_FOUND'
  | 'ASSESSMENT_NOT_FOUND'
  | 'POLICY_NOT_FOUND'
  | 'VIN_ALREADY_REGISTERED'
  | 'ASSESSMENT_TOO_OLD'
  | 'ASSESSMENT_NOT_GREEN'
  | 'POLICY_ALREADY_ACTIVE'
  | 'RULE_SET_NOT_FOUND'
  | 'RULE_SET_INVALID'
  | 'ESI_FILE_NOT_FOUND'
  | 'USER_NOT_FOUND'
  | 'DEALER_NOT_FOUND'
  | 'DEALER_USER_NOT_FOUND'
  | 'ROLE_NOT_FOUND'
  | 'ROLE_IN_USE'
  | 'AUTH0_PROVISION_ERROR';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function errorResponse(error: unknown): NextResponse<ErrorBody> {
  if (error instanceof ApiError) {
    const meta = { status: error.status, code: error.code, message: error.message, details: error.details };
    if (error.status >= 500) {
      log.error('API error', meta);
    } else {
      log.warn('Client error', meta);
    }
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }

  log.error('Unexpected error', error instanceof Error ? error : { raw: String(error) });

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Sentry = require('@sentry/node') as typeof import('@sentry/node');
    Sentry.captureException(error);
  } catch {
    // Sentry not available — ignore
  }

  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
    { status: 500 },
  );
}
