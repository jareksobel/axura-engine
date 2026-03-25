import { sql } from '@/lib/db/client';

/**
 * Generates the next policy number for the given year.
 * Format: AX-{YYYY}-{NNNN} — e.g. AX-2026-0042
 *
 * Counts existing policies for the year and uses COUNT + 1 as the sequence.
 * Safe under low concurrency (pilot volume). Post-pilot: replace with a DB sequence.
 */
export async function generatePolicyNumber(year: number): Promise<string> {
  const rows = await sql`
    SELECT COUNT(*) + 1 AS next_seq
    FROM policies
    WHERE EXTRACT(YEAR FROM created_at) = ${year}
  `;

  const seq = Number(rows[0].next_seq);
  const paddedSeq = String(seq).padStart(4, '0');
  return `AX-${year}-${paddedSeq}`;
}
