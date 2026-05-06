/**
 * Smoke test — read-only checks against a running axura-engine instance.
 *
 * Usage:
 *   local:   BASE_URL=http://localhost:3100 npm run smoke
 *   vercel:  BASE_URL=https://your-deployment.vercel.app API_TOKEN=<bearer> npm run smoke
 *
 * API_TOKEN is optional — authenticated tests are skipped when absent.
 */

const BASE_URL = process.env.BASE_URL?.replace(/\/$/, '') ?? 'http://localhost:3100';
const TOKEN    = process.env.API_TOKEN;

type Result = { pass: boolean; status: number; note?: string };

async function get(path: string, auth = false): Promise<Result> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (auth && TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, { headers });
  } catch (err) {
    return { pass: false, status: 0, note: (err as Error).message };
  }

  return { pass: res.ok, status: res.status };
}

const PASS = '  \x1b[32m✓\x1b[0m';
const FAIL = '  \x1b[31m✗\x1b[0m';
const SKIP = '  \x1b[33m–\x1b[0m';

let failures = 0;

function report(label: string, r: Result | 'skipped') {
  if (r === 'skipped') {
    console.log(`${SKIP} ${label}  \x1b[2m(no API_TOKEN)\x1b[0m`);
    return;
  }
  const icon = r.pass ? PASS : FAIL;
  const detail = r.note ? `  ${r.note}` : `  HTTP ${r.status}`;
  console.log(`${icon} ${label}${r.pass ? '' : detail}`);
  if (!r.pass) failures++;
}

const AUTHED_ROUTES: Array<[string, string]> = [
  ['GET /api/vehicles',     '/api/vehicles?limit=1'],
  ['GET /api/assessments',  '/api/assessments?limit=1'],
  ['GET /api/policies',     '/api/policies?limit=1'],
  ['GET /api/rules',        '/api/rules'],
  ['GET /api/rules/active', '/api/rules/active'],
  ['GET /api/dealers',      '/api/dealers?limit=1'],
  ['GET /api/users',        '/api/users?limit=1'],
  ['GET /api/roles',        '/api/roles'],
];

async function main() {
  console.log(`\nAxura Engine smoke test → ${BASE_URL}\n`);

  report('GET /api/health  (db connectivity)', await get('/api/health'));

  if (!TOKEN) {
    console.log();
    for (const [label] of AUTHED_ROUTES) report(label, 'skipped');

    console.log('\n  Verifying 401 responses (no token):');
    for (const [label, path] of AUTHED_ROUTES) {
      const r = await get(path, false);
      report(`${label}  → 401`, { pass: r.status === 401, status: r.status });
    }
  } else {
    console.log();
    for (const [label, path] of AUTHED_ROUTES) {
      report(label, await get(path, true));
    }
  }

  console.log();
  if (failures === 0) {
    console.log('\x1b[32mAll checks passed.\x1b[0m\n');
  } else {
    console.log(`\x1b[31m${failures} check(s) failed.\x1b[0m\n`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
