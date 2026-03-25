/**
 * ESI PDF parsers — pure extraction, no business logic.
 * Supports Bosch KTS ESI[tronic] Polish diagnostic reports.
 */

export type DtcStatus = 'active' | 'stored' | 'static' | 'unknown';
export type DtcClass = 'RED' | 'AMBER' | 'AMBER_P1' | 'GREEN_ALLOWED' | 'UNKNOWN';

export interface DtcEntry {
  code: string;
  status: DtcStatus;
  controller?: string;
  description?: string;
  classification: DtcClass;
}

export interface VehicleInfo {
  make?: string;
  model?: string;
  fuelType?: string;
  engineCC?: string;
  firstReg?: string;
  ageYears?: number;
  parseNote?: string;
}

export interface ReadinessResult {
  monitors: Record<string, boolean>;
  coreComplete: boolean;
}

export interface LivePids {
  ectC?: number;
  batteryV?: number;
  ambientC?: number;
  speedKmh?: number;
  odoKm?: number;
  engineUptimeS?: number;
}

export interface ParsedReport {
  vehicle: VehicleInfo;
  dtcs: DtcEntry[];
  dtcCount: number;
  milOn: boolean;
  readiness: ReadinessResult;
  livePids: LivePids;
}

// ── PDF text extraction ───────────────────────────────────────────────────────

export async function extractPdfText(buffer: Uint8Array): Promise<string> {
  const { extractText } = await import('unpdf');
  const { text } = await extractText(buffer, { mergePages: true });
  return text;
}

// ── Parsers ───────────────────────────────────────────────────────────────────

export function parseVehicleHeader(text: string): VehicleInfo {
  // e.g. "VOL 1878, VOLVO,XC60 I [156], XC60 I 2.0 T6 AWD, Benzyna, 2.0, 09/2014"
  const m = text.match(
    /VOL\s+\d+,\s*([A-Z]+),([^,]+),([^,]+),(Benzyna|Diesel|Elektryczny|Hybryda)[^,]*,([\d.]+),\s*(\d{2}\/\d{4})/,
  );
  if (!m) return { parseNote: 'vehicle header not found' };

  const firstReg = m[6];
  const year = parseInt(firstReg.split('/')[1], 10);
  const ageYears = new Date().getFullYear() - year;

  return {
    make: m[1].trim(),
    model: m[3].trim(),
    fuelType: m[4].trim(),
    engineCC: m[5].trim(),
    firstReg,
    ageYears,
  };
}

export function parseDtcs(
  text: string,
  classifyFn: (code: string) => DtcClass,
): DtcEntry[] {
  /**
   * Each DTC row looks like:
   *   "P0311 DCM/ECM2 Zapamiętany błąd Cylinder 11 ..."
   *   "P0026 ECM1 Błąd występujący Zawór elektromagnetyczny ..."
   */
  const rowRe =
    /\b([PUBC][0-9A-F]{4})\b\s+(ECM\d?|ABS|DCM\/ECM\d|TCM|PCM|BCM)?\s*(Zapamiętany\s+błąd|Błąd\s+występujący|Usterka\s+statyczna)?/g;

  const seen = new Map<string, DtcEntry>();
  let match: RegExpExecArray | null;

  while ((match = rowRe.exec(text)) !== null) {
    const code = match[1];
    const controller = match[2]?.trim() || undefined;
    const statusRaw = match[3]?.trim() || '';

    let status: DtcStatus;
    if (/Błąd\s+występujący/.test(statusRaw)) status = 'active';
    else if (/Zapamiętany\s+błąd/.test(statusRaw)) status = 'stored';
    else if (/Usterka\s+statyczna/.test(statusRaw)) status = 'static';
    else status = 'unknown';

    if (!seen.has(code)) {
      seen.set(code, { code, status, controller, classification: classifyFn(code) });
    }
  }

  // P1000 is always present but has no status field in ESI
  if (!seen.has('P1000') && text.includes('P1000')) {
    seen.set('P1000', { code: 'P1000', status: 'stored', classification: 'AMBER_P1' });
  }

  return Array.from(seen.values());
}

export function parseMilStatus(text: string): boolean {
  return /Tryb\s+MIL\s+włączony/.test(text);
}

export function parseDtcCount(text: string): number {
  const m = text.match(/Łączna\s+liczba\s+DTCs:\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

export function parseReadiness(text: string): ReadinessResult {
  const CORE: Record<string, RegExp> = {
    misfire: /Wykryw(?:ywanie)?\.?\s*przerw.*?(Tak|Nie)/,
    fuel: /Układ\s+paliwowy\s+gotowy\s+do\s+pracy\s+(Tak|Nie)/,
    comp: /Pozost\.?kompon\.?.*?(Tak|Nie)|Pozostałe\s+komponenty.*?(Tak|Nie)/,
  };

  const monitors: Record<string, boolean> = {};
  for (const [id, re] of Object.entries(CORE)) {
    const m = text.match(re);
    if (m) {
      const val = m[1] ?? m[2];
      monitors[id] = val === 'Tak';
    } else {
      monitors[id] = false;
    }
  }

  return {
    monitors,
    coreComplete: Object.values(monitors).every(Boolean),
  };
}

export function parseLivePids(text: string): LivePids {
  const pids: LivePids = {};

  const ect = text.match(/Temperatura\s+płynu\s+chłodniczego\s+([\d.]+)\s*degC/);
  if (ect) pids.ectC = parseFloat(ect[1]);

  const bat = text.match(/Napięcie\s+akumulatora\s+([\d.]+)\s*V/);
  if (bat) pids.batteryV = parseFloat(bat[1]);

  const amb = text.match(/Temperatura\s+otoczenia\s+([\d.]+)\s*degC/);
  if (amb) pids.ambientC = parseFloat(amb[1]);

  const spd = text.match(/Prędkość\s+jazdy\s+\(CAN\)\s+(\d+)\s*km\/h/);
  if (spd && parseInt(spd[1]) < 300) pids.speedKmh = parseInt(spd[1]);

  const odo = text.match(/Przebieg\s+km\s+(\d+)\s*km/);
  if (odo && parseInt(odo[1]) < 1_000_000) pids.odoKm = parseInt(odo[1]);

  const upt = text.match(/Czas\s+od\s+uruch\.silnika\s+(\d+)\s*s/);
  if (upt) pids.engineUptimeS = parseInt(upt[1]);

  return pids;
}

export async function parseReport(
  buffer: Uint8Array,
  classifyFn: (code: string) => DtcClass,
): Promise<ParsedReport> {
  const text = await extractPdfText(buffer);
  return {
    vehicle: parseVehicleHeader(text),
    dtcs: parseDtcs(text, classifyFn),
    dtcCount: parseDtcCount(text),
    milOn: parseMilStatus(text),
    readiness: parseReadiness(text),
    livePids: parseLivePids(text),
  };
}
