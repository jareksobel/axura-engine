/**
 * Auth0 Management API client.
 *
 * Uses Client Credentials grant (M2M) to obtain a management token, then
 * calls Auth0's Management API v2 endpoints for user provisioning.
 *
 * Required env vars:
 *   AUTH0_ISSUER_BASE_URL         e.g. https://axura.eu.auth0.com
 *   AUTH0_MANAGEMENT_CLIENT_ID
 *   AUTH0_MANAGEMENT_CLIENT_SECRET
 */

import { ApiError } from '@/lib/errors';

const MANAGEMENT_TOKEN_TTL_MS = 55 * 60 * 1000; // 55 min (Auth0 issues 60-min tokens)

interface CachedToken {
  token: string;
  expiresAt: number;
}

// In-process cache — serverless invocations may not reuse this, but it helps
// during warm requests within the same instance.
let cachedToken: CachedToken | null = null;

function getBaseUrl(): string {
  const base = process.env.AUTH0_ISSUER_BASE_URL;
  if (!base) throw new Error('AUTH0_ISSUER_BASE_URL is not set');
  return base.replace(/\/$/, '');
}

async function getManagementToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const domain = getBaseUrl();
  const clientId = process.env.AUTH0_MANAGEMENT_CLIENT_ID;
  const clientSecret = process.env.AUTH0_MANAGEMENT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('AUTH0_MANAGEMENT_CLIENT_ID or AUTH0_MANAGEMENT_CLIENT_SECRET is not set');
  }

  const res = await fetch(`${domain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience: `${domain}/api/v2/`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(502, 'AUTH0_PROVISION_ERROR', `Failed to obtain management token: ${body}`);
  }

  const data = (await res.json()) as { access_token: string };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + MANAGEMENT_TOKEN_TTL_MS,
  };
  return cachedToken.token;
}

async function managementRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getManagementToken();
  const domain = getBaseUrl();

  const res = await fetch(`${domain}/api/v2${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({ message: 'Unknown error' })) as { message?: string };
    throw new ApiError(
      502,
      'AUTH0_PROVISION_ERROR',
      `Auth0 Management API error (${res.status}): ${errorBody.message ?? 'Unknown error'}`,
    );
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ── User operations ────────────────────────────────────────────────────────────

export interface Auth0CreatedUser {
  user_id: string;
  email: string;
  name: string;
}

/**
 * Creates an Axura staff user in Auth0.
 * Uses the "Username-Password-Authentication" database connection.
 * A random temporary password is set; a change-password email is triggered separately.
 */
export async function createAuth0User(
  email: string,
  fullName: string,
): Promise<Auth0CreatedUser> {
  // Auth0 requires a password on creation even if we immediately send a reset email.
  const tempPassword = `Temp-${crypto.randomUUID()}!`;

  return managementRequest<Auth0CreatedUser>('POST', '/users', {
    email,
    name: fullName,
    password: tempPassword,
    connection: 'Username-Password-Authentication',
    email_verified: false,
  });
}

/**
 * Blocks or unblocks an Auth0 user.
 */
export async function setAuth0UserBlocked(auth0Sub: string, blocked: boolean): Promise<void> {
  const encodedSub = encodeURIComponent(auth0Sub);
  await managementRequest<void>('PATCH', `/users/${encodedSub}`, { blocked });
}

/**
 * Sends a change-password email to the user so they can set their own password.
 */
export async function triggerPasswordResetEmail(email: string): Promise<void> {
  const domain = getBaseUrl();
  const clientId = process.env.AUTH0_MANAGEMENT_CLIENT_ID;

  const res = await fetch(`${domain}/dbconnections/change_password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      email,
      connection: 'Username-Password-Authentication',
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(502, 'AUTH0_PROVISION_ERROR', `Failed to trigger password reset: ${body}`);
  }
}

// ── Organization (dealer) operations ─────────────────────────────────────────

export interface Auth0Organization {
  id: string;
  name: string;
  display_name: string;
  metadata: Record<string, string>;
}

/**
 * Creates an Auth0 Organization for a dealer.
 * The org name must be URL-safe (lowercase letters, numbers, hyphens).
 * Stores dealer_id in org metadata so the post-login Action can embed it in tokens.
 */
export async function createAuth0Organization(
  dealerId: string,
  companyName: string,
): Promise<Auth0Organization> {
  // Derive a URL-safe org name from company name
  const orgName = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

  return managementRequest<Auth0Organization>('POST', '/organizations', {
    name: orgName,
    display_name: companyName,
    metadata: { dealer_id: dealerId },
  });
}

/**
 * Adds an Auth0 user as a member of a dealer's organization.
 */
export async function addAuth0UserToOrganization(
  orgId: string,
  auth0Sub: string,
): Promise<void> {
  await managementRequest<void>('POST', `/organizations/${orgId}/members`, {
    members: [auth0Sub],
  });
}

/**
 * Retrieves an Auth0 Organization by its stored dealer_id metadata.
 * Uses the search API (q filter).
 */
export async function getAuth0OrganizationByDealerId(
  dealerId: string,
): Promise<Auth0Organization | null> {
  const results = await managementRequest<Auth0Organization[]>(
    'GET',
    `/organizations?q=${encodeURIComponent(`metadata.dealer_id:"${dealerId}"`)}&include_totals=false`,
  );
  return results[0] ?? null;
}
