import type { RuleSet } from '@/lib/rules/types';
import { checkEligibility } from './eligibility';
import { isManufacturerSpecific } from './dtc-lists';
import type { AssessmentResult } from '@/lib/types';

// ── Mobile OBD2 request payload ───────────────────────────────────────────────

export interface MonitorStatuses {
  misfire_monitor?: 'complete' | 'incomplete' | 'not_supported';
  fuel_system_monitor?: 'complete' | 'incomplete' | 'not_supported';
  comprehensive_component_monitor?: 'complete' | 'incomplete' | 'not_supported';
  catalyst_monitor?: 'complete' | 'incomplete' | 'not_supported';
  heated_catalyst_monitor?: 'complete' | 'incomplete' | 'not_supported';
  evaporative_system_monitor?: 'complete' | 'incomplete' | 'not_supported';
  secondary_air_system_monitor?: 'complete' | 'incomplete' | 'not_supported';
  oxygen_sensor_monitor?: 'complete' | 'incomplete' | 'not_supported';
  oxygen_sensor_heater_monitor?: 'complete' | 'incomplete' | 'not_supported';
  egr_system_monitor?: 'complete' | 'incomplete' | 'not_supported';
  [key: string]: string | undefined;
}

export interface MobileScanRequest {
  scan_metadata: {
    user_id: string;
    scan_type: 'PRE_BINDING' | 'FNOL' | 'PERIODIC_CHECK';
    scan_timestamp: string;
    app_version?: string;
    device_model?: string;
    obd_adapter?: string;
    scan_duration_seconds?: number;
    mobile_assessment?: string;
    mobile_reason?: string;
  };
  vehicle_metadata: {
    vin: string;
    vehicle_make?: string;
    vehicle_model?: string;
    vehicle_year?: number;
    fuel_type?: string;
    odometer?: number;
  };
  confirmed_dtcs: string[];
  permanent_dtcs?: string[];
  readiness_monitors: {
    mil_status: 'on' | 'off';
    dtc_count: number;
    monitors: MonitorStatuses;
  };
  temperature_sensors?: {
    coolant_temperature?: number;
    intake_air_temperature?: number;
    ambient_air_temperature?: number;
  };
  engine_operation?: {
    engine_rpm?: number;
    vehicle_speed?: number;
    engine_load?: number;
    throttle_position?: number;
    intake_manifold_pressure?: number;
  };
  fuel_system?: {
    short_term_fuel_trim_bank1?: number;
    long_term_fuel_trim_bank1?: number;
    short_term_fuel_trim_bank2?: number;
    long_term_fuel_trim_bank2?: number;
  };
  drive_cycle_data: {
    distance_since_dtc_clear: number;
    warmup_cycles_since_clear?: number;
  };
  transmission_data?: {
    transmission_type?: string;
    gear_position?: number;
    fluid_temperature?: number;
  };
}

export function isMobileScanRequest(payload: unknown): payload is MobileScanRequest {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    'scan_metadata' in p &&
    'vehicle_metadata' in p &&
    'confirmed_dtcs' in p &&
    'readiness_monitors' in p &&
    'drive_cycle_data' in p
  );
}

// ── Assessment ────────────────────────────────────────────────────────────────

export function assessMobileOBDScan(
  payload: MobileScanRequest,
  rules: RuleSet,
): AssessmentResult {
  const { triage } = rules;
  const { thresholds } = triage;
  const redDtcSet = new Set(triage.red_dtcs);
  const amberDtcSet = new Set(triage.amber_dtcs);
  const greenAllowedSet = new Set(triage.green_allowed_dtcs);

  const flags: Record<string, boolean> = {};
  const fraudIndicators: string[] = [];
  const vin = payload.vehicle_metadata.vin;

  // 1. ELIGIBILITY
  const eligibility = checkEligibility(
    { vin, wmi: vin?.substring(0, 3) },
    triage.eligibility,
  );
  if (!eligibility.eligible) {
    return {
      verdict: 'RED',
      reason: `Eligibility failed: ${eligibility.issues.join(', ')}`,
      dtcs: [],
      flags: {},
      details: { eligibility_issues: eligibility.issues },
    };
  }

  // 2. FRAUD DETECTION
  if (payload.drive_cycle_data.distance_since_dtc_clear < thresholds.km_since_clear_fraud) {
    fraudIndicators.push('RECENT_CODE_CLEARING');
    flags['RECENT_CODE_CLEARING'] = true;
  }

  // 3. EXTRACT DTCs
  const confirmedDtcs = payload.confirmed_dtcs ?? [];
  const permanentDtcs = payload.permanent_dtcs ?? [];
  const allDtcs = [...new Set([...confirmedDtcs, ...permanentDtcs])];

  const effectiveDtcs = allDtcs.filter(c => !greenAllowedSet.has(c));
  const dtcCount = confirmedDtcs.filter(c => !greenAllowedSet.has(c)).length;
  const milOn = payload.readiness_monitors.mil_status === 'on';

  // 4. INCOMPLETE MONITORS
  const monitors = payload.readiness_monitors.monitors;
  const monitorKeys = Object.keys(monitors);
  const incompleteMonitors = monitorKeys.filter(k => monitors[k] === 'incomplete');
  const incompleteCount = incompleteMonitors.length;

  // 5. CRITICAL RED DTCs
  const redFound = effectiveDtcs.filter(c => redDtcSet.has(c));
  if (redFound.length > 0) {
    return {
      verdict: 'RED',
      reason: `Critical DTCs: ${redFound.join(', ')}`,
      dtcs: redFound.map(c => ({ code: c, status: 'confirmed' as const, classification: 'RED' as const })),
      flags: { ...flags, CRITICAL_DTC: true },
      details: { fraud_indicators: fraudIndicators },
    };
  }

  // 6. TCM SEVERE
  if (confirmedDtcs.includes('P0700')) {
    const tcmSevere = confirmedDtcs.filter(c => c.startsWith('P07'));
    if (tcmSevere.length > 0) {
      return {
        verdict: 'RED',
        reason: `Transmission severe: ${tcmSevere.join(', ')}`,
        dtcs: [...tcmSevere, 'P0700'].map(c => ({ code: c, status: 'confirmed' as const, classification: 'RED' as const })),
        flags: { ...flags, TCM_SEVERE: true },
        details: { fraud_indicators: fraudIndicators },
      };
    }
  }

  // 7. ECU INTERNAL ERRORS
  const ecuErrors = confirmedDtcs.filter(c => c.startsWith('P060') || c === 'P061B');
  if (ecuErrors.length > 0) {
    return {
      verdict: 'RED',
      reason: `ECU/PCM internal error: ${ecuErrors.join(', ')}`,
      dtcs: ecuErrors.map(c => ({ code: c, status: 'confirmed' as const, classification: 'RED' as const })),
      flags: { ...flags, ECU_INTERNAL: true },
      details: { fraud_indicators: fraudIndicators },
    };
  }

  // 8. MOBILE ALGORITHM — RED THRESHOLDS
  if (
    dtcCount >= thresholds.dtc_count_red ||
    (milOn && dtcCount >= thresholds.dtc_count_mil_red) ||
    incompleteCount >= thresholds.incomplete_monitors_red
  ) {
    const reasons: string[] = [];
    if (dtcCount >= thresholds.dtc_count_red) reasons.push(`${dtcCount} DTCs`);
    if (milOn && dtcCount >= thresholds.dtc_count_mil_red) reasons.push(`MIL on + ${dtcCount} DTCs`);
    if (incompleteCount >= thresholds.incomplete_monitors_red) reasons.push(`${incompleteCount} incomplete monitors`);

    return {
      verdict: 'RED',
      reason: `Critical threshold exceeded: ${reasons.join(', ')}`,
      dtcs: allDtcs.map(c => ({ code: c, status: 'confirmed' as const })),
      flags: { ...flags, MOBILE_ALGORITHM_RED: true },
      details: { readiness_incomplete: incompleteMonitors, fraud_indicators: fraudIndicators },
    };
  }

  // 9. AMBER DTCs
  const amberFound = confirmedDtcs.filter(c => amberDtcSet.has(c) && !greenAllowedSet.has(c));
  if (amberFound.length > 0) {
    return {
      verdict: 'AMBER',
      reason: `Warning DTCs: ${amberFound.join(', ')}`,
      dtcs: amberFound.map(c => ({ code: c, status: 'confirmed' as const, classification: 'AMBER' as const })),
      flags,
      details: { readiness_incomplete: incompleteCount > 0 ? incompleteMonitors : undefined, fraud_indicators: fraudIndicators },
    };
  }

  // 10. MANUFACTURER-SPECIFIC (P1xxx/P3xxx)
  const mfrCodes = confirmedDtcs.filter(c => isManufacturerSpecific(c));
  if (mfrCodes.length > 0) {
    return {
      verdict: 'AMBER',
      reason: `Manufacturer-specific codes: ${mfrCodes.join(', ')}`,
      dtcs: mfrCodes.map(c => ({ code: c, status: 'confirmed' as const, classification: 'UNKNOWN' as const })),
      flags: { ...flags, P1XXX_UNKNOWN: true },
      details: { fraud_indicators: fraudIndicators },
    };
  }

  // 11. FUEL TRIMS
  const fs = payload.fuel_system;
  if (fs?.short_term_fuel_trim_bank1 !== undefined && fs?.long_term_fuel_trim_bank1 !== undefined) {
    const fuelTrimSum = Math.abs(fs.short_term_fuel_trim_bank1 + fs.long_term_fuel_trim_bank1);
    if (fuelTrimSum > thresholds.fuel_trim_sum_amber) {
      return {
        verdict: 'AMBER',
        reason: `Fuel trim outside range: ${fuelTrimSum.toFixed(1)}%`,
        dtcs: [],
        flags: { ...flags, FUEL_TRIM_HIGH: true },
        details: { fuel_trim_sum: fuelTrimSum, fraud_indicators: fraudIndicators },
      };
    }
  }

  // 12. SENSOR THRESHOLDS
  const tempSensors = payload.temperature_sensors;
  const engineOp = payload.engine_operation;

  if (
    tempSensors?.coolant_temperature !== undefined &&
    (tempSensors.coolant_temperature < thresholds.ect_min_c ||
      tempSensors.coolant_temperature > thresholds.ect_max_c)
  ) {
    flags['SENSOR_OUT_OF_RANGE'] = true;
    flags['ECT_OUT_OF_RANGE'] = true;
  }
  if (
    engineOp?.intake_manifold_pressure !== undefined &&
    (engineOp.intake_manifold_pressure < thresholds.map_idle_min_kpa ||
      engineOp.intake_manifold_pressure > thresholds.map_idle_max_kpa)
  ) {
    flags['SENSOR_OUT_OF_RANGE'] = true;
    flags['MAP_OUT_OF_RANGE'] = true;
  }
  if (engineOp?.throttle_position !== undefined && engineOp.throttle_position > thresholds.tps_idle_max_pct) {
    flags['SENSOR_OUT_OF_RANGE'] = true;
    flags['TPS_HIGH_AT_IDLE'] = true;
  }

  // 13. MOBILE ALGORITHM — AMBER THRESHOLD
  if (dtcCount > 0 || incompleteCount > 0 || Object.values(flags).some(Boolean)) {
    const reasons: string[] = [];
    if (dtcCount > 0) reasons.push(`${dtcCount} DTC${dtcCount > 1 ? 's' : ''}`);
    if (incompleteCount > 0) reasons.push(`${incompleteCount} incomplete monitor${incompleteCount > 1 ? 's' : ''}`);
    if (flags['SENSOR_OUT_OF_RANGE']) reasons.push('sensor readings out of range');

    return {
      verdict: 'AMBER',
      reason: `Minor issues: ${reasons.join(', ')}`,
      dtcs: allDtcs.map(c => ({ code: c, status: 'confirmed' as const })),
      flags: { ...flags, MOBILE_ALGORITHM_AMBER: true },
      details: {
        readiness_incomplete: incompleteCount > 0 ? incompleteMonitors : undefined,
        fraud_indicators: fraudIndicators,
      },
    };
  }

  // 14. GREEN
  return {
    verdict: 'GREEN',
    reason: 'All systems normal. No DTCs, MIL off, all monitors complete.',
    dtcs: [],
    flags,
    details: { fraud_indicators: fraudIndicators.length > 0 ? fraudIndicators : undefined },
  };
}
