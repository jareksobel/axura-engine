import { neon } from '@neondatabase/serverless';
import { createLogger } from '@/lib/logger';

const log = createLogger('db');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

export const sql = neon(process.env.DATABASE_URL);

export async function testConnection(): Promise<boolean> {
  try {
    const result = await sql`SELECT NOW() AS server_time`;
    log.info('Database connected', { server_time: result[0]?.server_time });
    return true;
  } catch (error) {
    log.error('Database connection failed', error);
    return false;
  }
}
