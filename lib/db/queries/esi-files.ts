import { sql } from '@/lib/db/client';

export interface EsiFileRow {
  id: string;
  vehicle_id: string | null;
  file_type: 'esi_pdf' | 'inspection_photo';
  filename: string;
  size_bytes: number | null;
  r2_key: string;
  uploaded_by: string | null;
  created_at: string;
}

export interface CreateEsiFileInput {
  vehicleId?: string | null;
  fileType: 'esi_pdf' | 'inspection_photo';
  filename: string;
  sizeBytes?: number | null;
  r2Key: string;
  uploadedBy?: string | null;
}

export async function createEsiFile(input: CreateEsiFileInput): Promise<EsiFileRow> {
  const rows = await sql`
    INSERT INTO esi_files (vehicle_id, file_type, filename, size_bytes, r2_key, uploaded_by)
    VALUES (
      ${input.vehicleId ?? null},
      ${input.fileType},
      ${input.filename},
      ${input.sizeBytes ?? null},
      ${input.r2Key},
      ${input.uploadedBy ?? null}
    )
    RETURNING *
  `;
  return rows[0] as EsiFileRow;
}

export async function getEsiFileById(id: string): Promise<EsiFileRow | null> {
  const rows = await sql`
    SELECT * FROM esi_files WHERE id = ${id} LIMIT 1
  `;
  return (rows[0] as EsiFileRow) ?? null;
}

export async function listEsiFilesByVehicle(vehicleId: string): Promise<EsiFileRow[]> {
  const rows = await sql`
    SELECT * FROM esi_files
    WHERE vehicle_id = ${vehicleId}
    ORDER BY created_at DESC
  `;
  return rows as EsiFileRow[];
}

export async function linkFileToVehicle(fileId: string, vehicleId: string): Promise<void> {
  await sql`
    UPDATE esi_files SET vehicle_id = ${vehicleId} WHERE id = ${fileId}
  `;
}
