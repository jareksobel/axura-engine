import { NextResponse } from 'next/server';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE_VIOLATION'
  | 'INTERNAL_ERROR'
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
  | 'DEALER_NOT_FOUND';

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
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }

  console.error('Unexpected error:', error);

  return NextResponse.json(
    { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
    { status: 500 },
  );
}
