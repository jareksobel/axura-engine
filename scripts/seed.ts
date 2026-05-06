/**
 * Seed script — populates DB with realistic fake data for development/staging.
 *
 * Usage:  npm run seed
 *
 * Idempotent: skips inserts that would violate UNIQUE constraints (ON CONFLICT DO NOTHING).
 * Safe to run multiple times.
 */

import { Pool } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Helpers ────────────────────────────────────────────────────────────────────

function nip(base: string) {
  // Polish NIP: 10 digits
  return base.padEnd(10, '0').slice(0, 10);
}

function pesel(base: string) {
  // Polish PESEL: 11 digits
  return base.padEnd(11, '0').slice(0, 11);
}

// ── Static fake data ───────────────────────────────────────────────────────────

const AXURA_USERS = [
  {
    auth0_sub: 'auth0|000000000000000000000001',
    email: 'admin@axura.pl',
    full_name: 'Tomasz Wiśniewski',
    is_active: true,
  },
  {
    auth0_sub: 'auth0|000000000000000000000002',
    email: 'tech@axura.pl',
    full_name: 'Kamil Nowak',
    is_active: true,
  },
];

const DEALERS = [
  {
    company_name: 'AutoPremium Sp. z o.o.',
    nip: nip('5213456789'),
    address: 'ul. Puławska 182, 02-670 Warszawa',
    email: 'kontakt@autopremium.pl',
    phone: '225678901',
  },
  {
    company_name: 'MotoKrak S.A.',
    nip: nip('6762345678'),
    address: 'al. Jana Pawła II 41, 31-864 Kraków',
    email: 'biuro@motokrak.pl',
    phone: '126789012',
  },
];

const DEALER_USERS = [
  {
    dealerIndex: 0,
    auth0_sub: 'auth0|100000000000000000000001',
    email: 'agent1@autopremium.pl',
    full_name: 'Marcin Kowalski',
    role: 'agent' as const,
  },
  {
    dealerIndex: 0,
    auth0_sub: 'auth0|100000000000000000000002',
    email: 'manager@autopremium.pl',
    full_name: 'Anna Lewandowska',
    role: 'manager' as const,
  },
  {
    dealerIndex: 1,
    auth0_sub: 'auth0|100000000000000000000003',
    email: 'agent1@motokrak.pl',
    full_name: 'Piotr Zając',
    role: 'agent' as const,
  },
  // Dev bypass user — matches the sub injected by engine proxy when SKIP_AUTH=true
  {
    dealerIndex: 0,
    auth0_sub: 'dev|mock-admin',
    email: 'dev@axura.local',
    full_name: 'Dev Admin',
    role: 'manager' as const,
  },
];

const VEHICLES = [
  {
    vin: 'WVWZZZ1KZ8W412345',
    wmi: 'WVW',
    make: 'Volkswagen',
    model: 'Golf',
    year: 2020,
    engine_type: 'ICE',
    fuel_type: 'petrol',
  },
  {
    vin: 'WBA3A5G5XDNP12345',
    wmi: 'WBA',
    make: 'BMW',
    model: '3 Series',
    year: 2021,
    engine_type: 'ICE',
    fuel_type: 'diesel',
  },
  {
    vin: 'TMBZZZ3VZ9P567890',
    wmi: 'TMB',
    make: 'Škoda',
    model: 'Octavia',
    year: 2023,
    engine_type: 'ICE',
    fuel_type: 'petrol',
  },
  {
    vin: 'WF0FXXGBHFKY12345',
    wmi: 'WF0',
    make: 'Ford',
    model: 'Focus',
    year: 2019,
    engine_type: 'ICE',
    fuel_type: 'diesel',
  },
  {
    vin: 'JTDKN3DU0A0234567',
    wmi: 'JTD',
    make: 'Toyota',
    model: 'Prius',
    year: 2022,
    engine_type: 'HEV',
    fuel_type: 'hybrid',
  },
  {
    vin: 'W0L000000N8012345',
    wmi: 'W0L',
    make: 'Opel',
    model: 'Astra',
    year: 2021,
    engine_type: 'ICE',
    fuel_type: 'petrol',
  },
];

const ASSESSMENTS = [
  {
    vehicleIndex: 0,
    source: 'esi' as const,
    verdict: 'GREEN' as const,
    score_pct: 87.5,
    rate_action: 'BIND' as const,
    assessment_multiplier: 1.0,
    reason: 'All major systems nominal. No fault codes. Engine compression within spec.',
    payload: { dtcs: [], systems: { engine: 'OK', transmission: 'OK', brakes: 'OK' } },
  },
  {
    vehicleIndex: 1,
    source: 'esi' as const,
    verdict: 'AMBER' as const,
    score_pct: 61.0,
    rate_action: 'HARD_INSPECTION' as const,
    assessment_multiplier: 1.25,
    reason: 'Minor DTC P0300 (random misfire) detected. Recommend physical inspection before binding.',
    payload: { dtcs: ['P0300'], systems: { engine: 'WARN', transmission: 'OK', brakes: 'OK' } },
  },
  {
    vehicleIndex: 2,
    source: 'esi' as const,
    verdict: 'GREEN' as const,
    score_pct: 92.0,
    rate_action: 'BIND' as const,
    assessment_multiplier: 0.95,
    reason: 'Clean report. All systems within manufacturer tolerances. Low mileage for age.',
    payload: { dtcs: [], systems: { engine: 'OK', transmission: 'OK', brakes: 'OK', abs: 'OK' } },
  },
  {
    vehicleIndex: 3,
    source: 'obd' as const,
    verdict: 'RED' as const,
    score_pct: 28.0,
    rate_action: 'DECLINE' as const,
    assessment_multiplier: 0,
    reason: 'Critical DTC P0016 (crankshaft/camshaft correlation). Engine damage risk. Policy declined.',
    payload: { dtcs: ['P0016', 'P0340'], systems: { engine: 'FAIL', transmission: 'WARN', brakes: 'OK' } },
  },
  {
    vehicleIndex: 4,
    source: 'esi' as const,
    verdict: 'GREEN' as const,
    score_pct: 95.0,
    rate_action: 'BIND' as const,
    assessment_multiplier: 0.9,
    reason: 'HEV system fully operational. Battery health 94%. No fault codes present.',
    payload: { dtcs: [], systems: { engine: 'OK', hev_battery: 'OK', transmission: 'OK', brakes: 'OK' } },
  },
];

const POLICIES = [
  {
    policyNumber: 'AX-2025-0001',
    vehicleIndex: 0,
    assessmentIndex: 0,
    dealerIndex: 0,
    dealerUserIndex: 0,
    customer: {
      first_name: 'Jan',
      last_name: 'Kowalczyk',
      pesel: pesel('85040312345'),
      address: 'ul. Długa 12/3, 00-238 Warszawa',
      email: 'jan.kowalczyk@email.pl',
      phone: '601234567',
    },
    odo_at_inspection_km: 87000,
    odo_at_policy_km: 87500,
    license_plate: 'WX12345',
    annual_mileage_tier: 'mid' as const,
    base_rate_pln: 1200,
    mileage_multiplier: 1.1,
    status: 'active' as const,
    payment_status: 'paid' as const,
    start_date: '2025-03-01',
    end_date: '2026-03-01',
  },
  {
    policyNumber: 'AX-2025-0002',
    vehicleIndex: 2,
    assessmentIndex: 2,
    dealerIndex: 1,
    dealerUserIndex: 2,
    customer: {
      first_name: 'Monika',
      last_name: 'Wróbel',
      pesel: pesel('92071598765'),
      address: 'os. Złotego Wieku 8/14, 31-618 Kraków',
      email: 'monika.wrobel@email.pl',
      phone: '512345678',
    },
    odo_at_inspection_km: 34000,
    odo_at_policy_km: 34200,
    license_plate: 'KR99887',
    annual_mileage_tier: 'low' as const,
    base_rate_pln: 1200,
    mileage_multiplier: 0.9,
    status: 'active' as const,
    payment_status: 'paid' as const,
    start_date: '2025-04-01',
    end_date: '2026-04-01',
  },
  {
    policyNumber: 'AX-2025-0003',
    vehicleIndex: 4,
    assessmentIndex: 4,
    dealerIndex: 0,
    dealerUserIndex: 1,
    customer: {
      first_name: 'Robert',
      last_name: 'Dąbrowski',
      pesel: pesel('78091234567'),
      address: 'ul. Mokotowska 55/8, 00-533 Warszawa',
      email: 'r.dabrowski@email.pl',
      phone: '789012345',
    },
    odo_at_inspection_km: 52000,
    odo_at_policy_km: 52800,
    license_plate: 'WY54321',
    annual_mileage_tier: 'mid' as const,
    base_rate_pln: 1200,
    mileage_multiplier: 1.0,
    status: 'pending_payment' as const,
    payment_status: 'unpaid' as const,
    start_date: '2025-04-15',
    end_date: '2026-04-15',
  },
];

const RULE_CONFIG_YAML = `version: v1.0
label: "Initial production rule set"

obd2:
  red_codes:
    - P0016
    - P0017
    - P0340
    - P0341
    - P0562
    - P0600
  amber_codes:
    - P0300
    - P0301
    - P0302
    - P0303
    - P0304
    - P0420
    - P0430
  score_thresholds:
    green: 70
    amber: 40

esi:
  score_thresholds:
    green: 75
    amber: 45
  multipliers:
    green: { min: 0.9, max: 1.0 }
    amber: { min: 1.2, max: 1.35 }
`;

// ── Main ───────────────────────────────────────────────────────────────────────

async function seed() {
  const client = await pool.connect();

  try {
    console.log('\nAxura seed script\n');

    // ── Axura users ────────────────────────────────────────────────────────────
    const userIds: string[] = [];
    for (const u of AXURA_USERS) {
      const r = await client.query<{ id: string }>(
        `INSERT INTO users (auth0_sub, email, full_name, is_active)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (auth0_sub) DO UPDATE SET email = EXCLUDED.email
         RETURNING id`,
        [u.auth0_sub, u.email, u.full_name, u.is_active]
      );
      userIds.push(r.rows[0].id);
      console.log(`  user  ${u.full_name} (${u.email})`);
    }

    // ── Assign roles to Axura users ────────────────────────────────────────────
    const roleAssignments: Array<[number, string]> = [
      [0, 'admin'],
      [1, 'technician'],
    ];
    for (const [userIdx, roleName] of roleAssignments) {
      await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE name = $2
         ON CONFLICT DO NOTHING`,
        [userIds[userIdx], roleName]
      );
    }
    console.log(`  roles assigned`);

    // ── Dealers ────────────────────────────────────────────────────────────────
    const dealerIds: string[] = [];
    for (const d of DEALERS) {
      const r = await client.query<{ id: string }>(
        `INSERT INTO dealers (company_name, nip, address, email, phone)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (nip) DO UPDATE SET company_name = EXCLUDED.company_name
         RETURNING id`,
        [d.company_name, d.nip, d.address, d.email, d.phone]
      );
      dealerIds.push(r.rows[0].id);
      console.log(`  dealer  ${d.company_name}`);
    }

    // ── Dealer users ───────────────────────────────────────────────────────────
    const dealerUserIds: string[] = [];
    for (const du of DEALER_USERS) {
      const r = await client.query<{ id: string }>(
        `INSERT INTO dealer_users (dealer_id, auth0_sub, email, full_name, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (auth0_sub) DO UPDATE SET email = EXCLUDED.email
         RETURNING id`,
        [dealerIds[du.dealerIndex], du.auth0_sub, du.email, du.full_name, du.role]
      );
      dealerUserIds.push(r.rows[0].id);
      console.log(`  dealer_user  ${du.full_name} [${du.role}]`);
    }

    // ── Vehicles ───────────────────────────────────────────────────────────────
    const vehicleIds: string[] = [];
    for (const v of VEHICLES) {
      const r = await client.query<{ id: string }>(
        `INSERT INTO vehicles (vin, wmi, make, model, year, engine_type, fuel_type, registered_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (vin) DO UPDATE SET make = EXCLUDED.make
         RETURNING id`,
        [v.vin, v.wmi, v.make, v.model, v.year, v.engine_type, v.fuel_type, userIds[1]]
      );
      vehicleIds.push(r.rows[0].id);
      console.log(`  vehicle  ${v.make} ${v.model} (${v.vin})`);
    }

    // ── Assessments ────────────────────────────────────────────────────────────
    const assessmentIds: string[] = [];
    for (const a of ASSESSMENTS) {
      // Check if assessment for this vehicle+source already exists (to stay idempotent)
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM vehicle_assessments WHERE vin = $1 AND source = $2 LIMIT 1`,
        [VEHICLES[a.vehicleIndex].vin, a.source]
      );
      if (existing.rows.length > 0) {
        assessmentIds.push(existing.rows[0].id);
        console.log(`  assessment  ${VEHICLES[a.vehicleIndex].vin} [${a.verdict}] — already exists`);
        continue;
      }
      const r = await client.query<{ id: string }>(
        `INSERT INTO vehicle_assessments
           (vehicle_id, vin, source, verdict, score_pct, rate_action,
            assessment_multiplier, reason, rule_set_version, payload, assessed_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id`,
        [
          vehicleIds[a.vehicleIndex],
          VEHICLES[a.vehicleIndex].vin,
          a.source,
          a.verdict,
          a.score_pct,
          a.rate_action,
          a.assessment_multiplier,
          a.reason,
          'v1.0',
          JSON.stringify(a.payload),
          userIds[1],
        ]
      );
      assessmentIds.push(r.rows[0].id);
      console.log(`  assessment  ${VEHICLES[a.vehicleIndex].vin} [${a.verdict}]`);
    }

    // ── Policies ───────────────────────────────────────────────────────────────
    for (const p of POLICIES) {
      const a = ASSESSMENTS[p.assessmentIndex];
      const assessmentMultiplier = a.assessment_multiplier;
      const premiumGross = +(p.base_rate_pln * assessmentMultiplier * p.mileage_multiplier).toFixed(2);

      await client.query(
        `INSERT INTO policies (
           policy_number, dealer_id, dealer_user_id, assessment_id,
           vin, make, model, year, engine_type, fuel_type,
           odo_at_inspection_km, odo_at_policy_km, license_plate, annual_mileage_tier,
           customer_first_name, customer_last_name, customer_pesel,
           customer_address, customer_email, customer_phone,
           base_rate_pln, assessment_multiplier, mileage_multiplier, premium_gross_pln,
           start_date, end_date, status, payment_status
         )
         VALUES (
           $1,$2,$3,$4,
           $5,$6,$7,$8,$9,$10,
           $11,$12,$13,$14,
           $15,$16,$17,
           $18,$19,$20,
           $21,$22,$23,$24,
           $25,$26,$27,$28
         )
         ON CONFLICT (policy_number) DO NOTHING`,
        [
          p.policyNumber,
          dealerIds[p.dealerIndex],
          dealerUserIds[p.dealerUserIndex],
          assessmentIds[p.assessmentIndex],
          VEHICLES[p.vehicleIndex].vin,
          VEHICLES[p.vehicleIndex].make,
          VEHICLES[p.vehicleIndex].model,
          VEHICLES[p.vehicleIndex].year,
          VEHICLES[p.vehicleIndex].engine_type,
          VEHICLES[p.vehicleIndex].fuel_type,
          p.odo_at_inspection_km,
          p.odo_at_policy_km,
          p.license_plate,
          p.annual_mileage_tier,
          p.customer.first_name,
          p.customer.last_name,
          p.customer.pesel,
          p.customer.address,
          p.customer.email,
          p.customer.phone,
          p.base_rate_pln,
          assessmentMultiplier,
          p.mileage_multiplier,
          premiumGross,
          p.start_date,
          p.end_date,
          p.status,
          p.payment_status,
        ]
      );
      console.log(`  policy  ${p.policyNumber}  ${p.customer.first_name} ${p.customer.last_name}`);
    }

    // ── Rule config ────────────────────────────────────────────────────────────
    await client.query(
      `INSERT INTO rule_configs (version, label, content_yaml, is_active, created_by, activated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (version) DO NOTHING`,
      ['v1.0', 'Initial production rule set', RULE_CONFIG_YAML, true, userIds[0]]
    );
    console.log(`  rule_config  v1.0 [active]`);

    console.log('\nSeed complete.\n');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
