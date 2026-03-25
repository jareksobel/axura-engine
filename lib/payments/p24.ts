/**
 * Przelewy24 REST API v1 client.
 * Docs: https://developers.przelewy24.pl/
 *
 * Required env vars:
 *   P24_MERCHANT_ID   — numeric merchant identifier
 *   P24_POS_ID        — point of sale ID (usually same as merchant ID)
 *   P24_CRC_KEY       — CRC key from P24 dashboard
 *   P24_API_KEY       — API key (used as password for Basic Auth)
 *   P24_SANDBOX       — set to "true" to use sandbox
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('payments.p24');

function getBaseUrl(): string {
  return process.env.P24_SANDBOX === 'true'
    ? 'https://sandbox.przelewy24.pl'
    : 'https://secure.przelewy24.pl';
}

function getAuthHeader(): string {
  const merchantId = process.env.P24_MERCHANT_ID!;
  const apiKey     = process.env.P24_API_KEY!;
  return 'Basic ' + Buffer.from(`${merchantId}:${apiKey}`).toString('base64');
}

async function p24Fetch<T>(path: string, body: unknown): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify(body),
  });

  const json = await res.json() as { data?: T; error?: string; code?: number };

  if (!res.ok) {
    log.error('P24 request failed', { path, status: res.status, body: json });
    throw new Error(`P24 error ${res.status}: ${json.error ?? 'unknown'}`);
  }

  return json.data as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface P24RegisterInput {
  /** Our internal order identifier (policy ID) */
  orderId: string;
  /** Full policy number e.g. AX-2026-0042 */
  policyNumber: string;
  /** Amount in grosz (PLN × 100) */
  amountGrosze: number;
  /** Customer email */
  email: string;
  /** Customer full name */
  customerName: string;
  /** URL to redirect after successful payment */
  returnUrl: string;
  /** URL to redirect after payment cancelled */
  cancelUrl: string;
  /** Webhook URL where P24 will POST the notification */
  notifyUrl: string;
}

export interface P24RegisterResult {
  /** P24 token used to build the payment redirect URL */
  token: string;
  /** Full redirect URL to send the customer to */
  redirectUrl: string;
}

export interface P24VerifyInput {
  /** P24 order ID returned in notification */
  orderId: number;
  /** Our session ID (policy ID) we sent during registration */
  sessionId: string;
  /** Amount in grosz — must match what was registered */
  amountGrosze: number;
  /** P24 transaction number from notification */
  p24TransactionId: number;
}

// ── CRC hash (SHA-384) ────────────────────────────────────────────────────────

async function sha384Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-384', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Registers a transaction with P24 and returns a token + redirect URL.
 * Step 1 of the P24 payment flow.
 */
export async function registerTransaction(input: P24RegisterInput): Promise<P24RegisterResult> {
  const merchantId = parseInt(process.env.P24_MERCHANT_ID!, 10);
  const posId      = parseInt(process.env.P24_POS_ID ?? process.env.P24_MERCHANT_ID!, 10);
  const crcKey     = process.env.P24_CRC_KEY!;

  // Build CRC sign: JSON hash of { sessionId, merchantId, amount, currency, crc }
  const signPayload = JSON.stringify({
    sessionId: input.orderId,
    merchantId,
    amount: input.amountGrosze,
    currency: 'PLN',
    crc: crcKey,
  });
  const sign = await sha384Hex(signPayload);

  const body = {
    merchantId,
    posId,
    sessionId: input.orderId,
    amount: input.amountGrosze,
    currency: 'PLN',
    description: `Polisa ${input.policyNumber}`,
    email: input.email,
    client: input.customerName,
    country: 'PL',
    language: 'pl',
    urlReturn: input.returnUrl,
    urlCancel: input.cancelUrl,
    urlStatus: input.notifyUrl,
    sign,
    encoding: 'UTF-8',
  };

  const result = await p24Fetch<{ token: string }>('/api/v1/transaction/register', body);
  const redirectUrl = `${getBaseUrl()}/trnRequest/${result.token}`;

  log.info('P24 transaction registered', { sessionId: input.orderId, token: result.token });

  return { token: result.token, redirectUrl };
}

/**
 * Verifies a payment notification from P24.
 * Step 2 of the P24 payment flow — call this from the webhook handler.
 */
export async function verifyTransaction(input: P24VerifyInput): Promise<boolean> {
  const merchantId = parseInt(process.env.P24_MERCHANT_ID!, 10);
  const posId      = parseInt(process.env.P24_POS_ID ?? process.env.P24_MERCHANT_ID!, 10);
  const crcKey     = process.env.P24_CRC_KEY!;

  const signPayload = JSON.stringify({
    sessionId: input.sessionId,
    orderId: input.orderId,
    amount: input.amountGrosze,
    currency: 'PLN',
    crc: crcKey,
  });
  const sign = await sha384Hex(signPayload);

  const body = {
    merchantId,
    posId,
    sessionId: input.sessionId,
    amount: input.amountGrosze,
    currency: 'PLN',
    orderId: input.orderId,
    sign,
  };

  try {
    await p24Fetch('/api/v1/transaction/verify', body);
    log.info('P24 transaction verified', { sessionId: input.sessionId, orderId: input.orderId });
    return true;
  } catch (err) {
    log.error('P24 verification failed', err);
    return false;
  }
}

/** Builds the amount in grosz from a PLN decimal string/number */
export function toGrosze(amountPln: number): number {
  return Math.round(amountPln * 100);
}
