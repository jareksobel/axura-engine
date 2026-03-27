/**
 * PESEL encryption scaffold — AES-256-GCM via Web Crypto API.
 *
 * The raw PESEL is NEVER stored in the database.  Before persisting, call
 * `encryptPesel()` and store only the returned ciphertext string.  When you
 * need to compare or display it, call `decryptPesel()`.
 *
 * Key material comes from PESEL_ENCRYPTION_KEY (base-64 encoded 32-byte key).
 * Generate a key with:  openssl rand -base64 32
 *
 * ⚠️  Key rotation is not implemented here — plan a migration script before
 *     the first production deploy that stores PESEL data.
 */

const ALGO      = 'AES-GCM';
const IV_BYTES  = 12; // 96-bit IV recommended for GCM

function getKey(): Promise<CryptoKey> {
  const raw = process.env.PESEL_ENCRYPTION_KEY;
  if (!raw) throw new Error('PESEL_ENCRYPTION_KEY env var is not set');

  const bytes = Buffer.from(raw, 'base64');
  if (bytes.length !== 32) {
    throw new Error('PESEL_ENCRYPTION_KEY must be exactly 32 bytes (base-64 encoded)');
  }

  return crypto.subtle.importKey('raw', bytes, { name: ALGO }, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypt a PESEL number.
 * Returns a base-64 string in the form:  <iv_hex>:<ciphertext_base64>
 */
export async function encryptPesel(pesel: string): Promise<string> {
  const key = await getKey();
  const iv  = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const enc = new TextEncoder();

  const cipherBuffer = await crypto.subtle.encrypt({ name: ALGO, iv }, key, enc.encode(pesel));

  const ivB64     = Buffer.from(iv).toString('base64');
  const cipherB64 = Buffer.from(cipherBuffer).toString('base64');

  return `${ivB64}:${cipherB64}`;
}

/**
 * Decrypt a PESEL stored by `encryptPesel()`.
 * Throws if the ciphertext is malformed or the key is wrong.
 */
export async function decryptPesel(stored: string): Promise<string> {
  const parts = stored.split(':');
  if (parts.length !== 2) throw new Error('Invalid PESEL ciphertext format');

  const [ivB64, cipherB64] = parts as [string, string];
  const key    = await getKey();
  const iv     = Buffer.from(ivB64, 'base64');
  const cipher = Buffer.from(cipherB64, 'base64');

  const plainBuffer = await crypto.subtle.decrypt({ name: ALGO, iv }, key, cipher);

  return new TextDecoder().decode(plainBuffer);
}

/**
 * Mask a PESEL for display (e.g. in logs or audit entries):
 * "12345678901" → "123456*****"
 */
export function maskPesel(pesel: string): string {
  return pesel.slice(0, 6) + '*'.repeat(Math.max(0, pesel.length - 6));
}
