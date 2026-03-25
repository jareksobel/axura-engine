import { createLogger } from '@/lib/logger';

const log = createLogger('vin.decoder');

const NHTSA_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues';

export interface NhtsaDecoded {
  make?: string;
  model?: string;
  year?: number;
  engine_type?: string; // BEV, HEV, PHEV, ICE
  fuel_type?: string;   // petrol, diesel, electric, hybrid
  raw: Record<string, string>;
}

export function extractWmi(vin: string): string {
  return vin.substring(0, 3).toUpperCase();
}

export function isValidVin(vin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin);
}

/**
 * Decode a VIN via NHTSA vPIC API.
 * Returns null on network failure — callers decide how to proceed.
 */
export async function decodeVin(vin: string): Promise<NhtsaDecoded | null> {
  try {
    const url = `${NHTSA_BASE}/${vin.toUpperCase()}?format=json`;
    const resp = await fetch(url, { next: { revalidate: 86400 } }); // cache 24 h
    if (!resp.ok) {
      log.warn('NHTSA API error', { vin, status: resp.status });
      return null;
    }

    const data = (await resp.json()) as { Results?: Record<string, string>[] };
    const r = data.Results?.[0];
    if (!r) return null;

    // Electrification level → engine_type
    let engineType: string | undefined;
    const elev = (r['Electrification Level'] ?? '').toUpperCase();
    if (elev.includes('BEV') || elev === 'ELECTRIC') engineType = 'BEV';
    else if (elev.includes('PHEV')) engineType = 'PHEV';
    else if (elev.includes('HEV') || elev.includes('HYBRID')) engineType = 'HEV';
    else if (r['Fuel Type - Primary']) engineType = 'ICE';

    // Fuel type normalisation
    let fuelType: string | undefined;
    const nh = (r['Fuel Type - Primary'] ?? '').toLowerCase();
    if (nh.includes('gasoline') || nh.includes('petrol')) fuelType = 'petrol';
    else if (nh.includes('diesel')) fuelType = 'diesel';
    else if (nh.includes('electric')) fuelType = 'electric';
    else if (nh.includes('hybrid')) fuelType = 'hybrid';
    else if (nh) fuelType = nh;

    const rawYear = r['Model Year'] ? parseInt(r['Model Year'], 10) : undefined;

    return {
      make: r['Make'] || undefined,
      model: r['Model'] || undefined,
      year: rawYear && !isNaN(rawYear) ? rawYear : undefined,
      engine_type: engineType,
      fuel_type: fuelType,
      raw: r,
    };
  } catch (err) {
    log.warn('NHTSA decode failed', { vin, err: String(err) });
    return null;
  }
}
