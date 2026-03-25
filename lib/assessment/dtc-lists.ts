// Default RED DTC list — overridable via active rule set
export const RED_DTCS = [
  // Lubrication / Oil Pressure
  'P0520', 'P0521', 'P0522', 'P0523', 'P0524', 'P06DE',
  // Engine Overheating
  'P0217',
  // Timing / VVT
  'P0008', 'P0009', 'P0010', 'P0011', 'P0012', 'P0013', 'P0014',
  'P0016', 'P0017', 'P0018', 'P0019',
  // Severe Misfires
  'P0300', 'P0301', 'P0302', 'P0303', 'P0304',
  'P0305', 'P0306', 'P0307', 'P0308', 'P0309',
  'P0310', 'P0311', 'P0312',
  // Boost / Overboost
  'P0234',
  // Fuel Pressure Critical
  'P0087', 'P0088', 'P0191', 'P0192', 'P0193',
  // ECU / PCM Internal
  'P0601', 'P0602', 'P0603', 'P0604', 'P0605', 'P0606', 'P061B',
  // Transmission Severe
  'P0729', 'P0730', 'P0731', 'P0732', 'P0733', 'P0734', 'P0735', 'P0736',
  'P0740', 'P0741', 'P0744',
  'P0750', 'P0751', 'P0752', 'P0753', 'P0754', 'P0755', 'P0756', 'P0757',
  'P0758', 'P0759', 'P0760', 'P0761', 'P0762', 'P0763', 'P0764', 'P0765',
  'P0766', 'P0767', 'P0768', 'P0769', 'P0770', 'P0771', 'P0772', 'P0773',
  'P0774', 'P0775', 'P0776', 'P0777', 'P0778', 'P0779', 'P0780', 'P0781',
  'P0782', 'P0783', 'P0784', 'P0785', 'P0786', 'P0787', 'P0788', 'P0789',
  'P0790', 'P0791', 'P0792', 'P0793', 'P0794', 'P0795', 'P0796', 'P0797',
  'P0798', 'P0799',
  // DPF Severe
  'P2463', 'P242F',
  // SCR / DEF Critical
  'P20EE',
];

// Default AMBER DTC list — overridable via active rule set
export const AMBER_DTCS = [
  // Catalytic Converter
  'P0420', 'P0430',
  // Oxygen Sensors
  'P0130', 'P0131', 'P0132', 'P0133', 'P0134', 'P0135', 'P0136', 'P0137',
  'P0138', 'P0139', 'P0140', 'P0141', 'P0142', 'P0143', 'P0144', 'P0145',
  'P0146', 'P0147', 'P0148', 'P0149', 'P0150', 'P0151', 'P0152', 'P0153',
  'P0154', 'P0155', 'P0156', 'P0157', 'P0158', 'P0159', 'P0160', 'P0161',
  'P0162', 'P0163', 'P0164', 'P0165', 'P0166', 'P0167',
  // Air/Fuel Mixture
  'P0171', 'P0172', 'P0174', 'P0175',
  // MAF / MAP Sensors
  'P0100', 'P0101', 'P0102', 'P0103', 'P0104',
  'P0105', 'P0106', 'P0107', 'P0108', 'P0109',
  // Intake Air Temperature
  'P0110',
  // Thermostat
  'P0128',
  // EGR System
  'P0400', 'P0401', 'P0402', 'P0403', 'P0404', 'P0405', 'P0406', 'P0407',
  'P0408', 'P0409',
  // Secondary Air System
  'P0410', 'P0411', 'P0412',
  // EVAP System
  'P0440', 'P0441', 'P0442', 'P0443', 'P0444', 'P0445', 'P0446',
  'P0455', 'P0456',
  // Knock Sensors
  'P0325', 'P0330',
  // Transmission Sensors Only
  'P0715', 'P0720',
  // Turbo Underboost (non-severe)
  'P0299',
  // DPF Moderate
  'P2002',
  // Diesel Sensors
  'P2031', 'P2032', 'P2033',
  'P2452', 'P2453', 'P2454',
  'P2201', 'P2202',
];

// Transmission control system malfunction (general flag)
export const TCM_FLAG = 'P0700';

export function isManufacturerSpecific(code: string): boolean {
  return code.startsWith('P1') || code.startsWith('P3');
}

export function categorizeDTC(
  code: string,
  redDtcs: string[] = RED_DTCS,
  amberDtcs: string[] = AMBER_DTCS,
): 'RED' | 'AMBER' | 'UNKNOWN' {
  if (redDtcs.includes(code)) return 'RED';
  if (amberDtcs.includes(code)) return 'AMBER';
  return 'UNKNOWN';
}
