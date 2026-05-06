/**
 * Reset script — drops all application tables, clears migration history,
 * then re-applies all migrations from scratch.
 *
 * Usage:  npm run reset
 *
 * WARNING: This destroys ALL data. For development/staging only.
 * Prompts for confirmation unless --force flag is passed.
 */

import { Pool, type PoolClient } from '@neondatabase/serverless';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const __dirname = dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Drop order: most-dependent tables first (FK constraints)
const DROP_ORDER = [
  'audit_log',
  'policies',
  'vehicle_assessments',
  'esi_files',
  'user_permissions',
  'user_roles',
  'role_permissions',
  'rule_configs',
  'vehicles',
  'dealer_users',
  'dealers',
  'users',
  'roles',
  'permissions',
  '_migrations',
];

async function confirm(): Promise<boolean> {
  if (process.argv.includes('--force')) return true;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(
      '\x1b[33mWARNING: This will delete all data. Type "reset" to continue: \x1b[0m',
      (answer) => {
        rl.close();
        resolve(answer.trim() === 'reset');
      }
    );
  });
}

async function dropTables(client: PoolClient) {
  for (const table of DROP_ORDER) {
    // Disable RLS before dropping (vehicle_assessments has policies blocking DELETE)
    if (table === 'vehicle_assessments') {
      await client.query(`ALTER TABLE IF EXISTS vehicle_assessments DISABLE ROW LEVEL SECURITY`);
    }
    await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
    console.log(`  drop  ${table}`);
  }
}

async function runMigrations(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      filename   TEXT        NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const migrationsDir = join(__dirname, '../lib/db/migrations');
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  apply  ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    }
  }
}

async function reset() {
  const ok = await confirm();
  if (!ok) {
    console.log('Aborted.');
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    console.log('\nDropping tables...');
    await dropTables(client);

    console.log('\nApplying migrations...');
    await runMigrations(client);

    console.log('\nReset complete. Run "npm run seed" to populate with fake data.\n');
  } finally {
    client.release();
    await pool.end();
  }
}

reset().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
