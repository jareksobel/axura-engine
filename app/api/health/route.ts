import { NextResponse } from 'next/server';
import { testConnection } from '@/lib/db/client';

export async function GET() {
  const db_ok = await testConnection();

  return NextResponse.json(
    {
      status: db_ok ? 'ok' : 'degraded',
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0',
      db_ok,
      timestamp: new Date().toISOString(),
    },
    { status: db_ok ? 200 : 503 },
  );
}
