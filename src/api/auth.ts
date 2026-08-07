/**
 * iPusnas Auth — Login + PoP Device Attestation
 */

import { generateP256KeyPair, popHeaders, type JwkPublicKey } from '../core/crypto';
import { getSession, saveSession, type SessionData } from '../core/config';
import { logger } from '../cli/ui';
import type { AttestResponse, LoginData, LoginResponse, NonceResponse } from './types';

// ─── Endpoints ───────────────────────────────────────────────────────────────

export const BASE = 'https://backend-ipusnas.perpusnas.go.id';

const EP = {
  NONCE: `${BASE}/trust/api/nonce`,
  ATTEST: `${BASE}/trust/api/attest`,
  REFRESH: `${BASE}/trust/api/token/refresh`,
  LOGIN: `${BASE}/api/auth/login`,
} as const;

// ─── Headers ─────────────────────────────────────────────────────────────────

function jsonHeaders(contentType: string): Record<string, string> {
  return { 'User-Agent': 'okhttp/5.3.2', 'Content-Type': contentType, Accept: contentType };
}

export const HEADERS = jsonHeaders('application/vnd.api+json');
const TRUST_HEADERS = jsonHeaders('application/json');

// ─── Nonce ───────────────────────────────────────────────────────────────────

async function getNonce(): Promise<string> {
  logger.debug(`[API] GET ${EP.NONCE}`);
  const response = await fetch(EP.NONCE, { headers: TRUST_HEADERS });
  const nonceResponse = (await response.json()) as NonceResponse;
  if (!nonceResponse.nonce) throw new Error('Failed to get nonce');
  return nonceResponse.nonce;
}

// ─── Attestation Refresh (PoP-signed) ────────────────────────────────────────

async function refreshAttestation(session: SessionData): Promise<string> {
  if (!session.attestationRefreshToken) throw new Error('No attestation refresh token');

  const body = JSON.stringify({ refresh_token: session.attestationRefreshToken });
  const signedHeaders = popHeaders(
    session.privatePem!,
    session.publicJwk!,
    'POST',
    '/trust/api/token/refresh',
    Buffer.from(body),
  );

  logger.debug(`[API] POST ${EP.REFRESH}`);
  const response = await fetch(EP.REFRESH, {
    method: 'POST',
    headers: { ...TRUST_HEADERS, ...signedHeaders, Authorization: `Bearer ${session.attestationToken || ''}` },
    body,
  });

  if (!response.ok) throw new Error(`Attestation refresh failed: ${response.status} ${await response.text()}`);

  const responseBody = (await response.json()) as Record<string, unknown>;
  const responseData = (responseBody.data ?? responseBody) as Record<string, unknown>;
  const token = String(responseData.access_token || responseData.device_attestation_token || '');

  const updated: SessionData = {
    ...session,
    attestationToken: token,
    attestationRefreshToken: String(responseData.refresh_token || session.attestationRefreshToken),
  };
  saveSession(updated);

  return token;
}

// ─── Device Attestation (PoP) ────────────────────────────────────────────────

export function isJwtExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return Date.now() / 1000 > (payload.exp || 0);
  } catch {
    return true;
  }
}

function buildAttestBody(nonce: string, integrityToken: string, deviceId: string): string {
  return JSON.stringify({
    platform: 'android',
    nonce,
    environment: 'prod',
    attestation_data: { integrity_token: integrityToken },
    device_info: {
      device_id: deviceId,
      model: 'SM-G998B',
      os_version: '13',
      sdk_version: 33,
      app_version: '2.1.4',
      package_name: 'mam.reader.ipusnas',
    },
  });
}

async function postAttest(
  body: string,
  privatePem: string,
  publicJwk: JwkPublicKey,
  label: string,
): Promise<AttestResponse & { access_token: string }> {
  const signedHeaders = popHeaders(privatePem, publicJwk, 'POST', '/trust/api/attest', Buffer.from(body));
  logger.debug(`[API] POST ${EP.ATTEST}`);
  const response = await fetch(EP.ATTEST, {
    method: 'POST',
    headers: { ...TRUST_HEADERS, ...signedHeaders },
    body,
  });
  if (!response.ok) throw new Error(`${label} failed: ${response.status} ${await response.text()}`);
  const responseBody = (await response.json()) as AttestResponse & { data?: AttestResponse };
  const attestationData = responseBody.data ?? responseBody;
  if (responseBody.success === false || !attestationData.access_token)
    throw new Error(`${label} failed: ${JSON.stringify(responseBody)}`);
  return attestationData as AttestResponse & { access_token: string };
}

export async function attestDevice(force = false): Promise<string> {
  const session = getSession();

  // Reuse valid token
  if (!force && session?.attestationToken && session?.privatePem && !isJwtExpired(session.attestationToken)) {
    logger.debug('[AUTH] reusing valid attestation token');
    return session.attestationToken;
  }

  // Try refresh if we have PoP keys
  if (session?.attestationRefreshToken && session?.privatePem && session?.publicJwk) {
    try {
      logger.debug('[AUTH] attempting attestation refresh');
      return await refreshAttestation(session);
    } catch (error: unknown) {
      logger.debug(`[AUTH] Refresh failed: ${(error as Error).message}`);
    }
  }

  // Generate fresh PoP keypair
  logger.debug('[AUTH] generating fresh PoP keypair + attestation');
  const { privatePem, publicJwk } = generateP256KeyPair();
  const nonce = await getNonce();
  const deviceId = session?.deviceId || crypto.randomUUID();
  const body = buildAttestBody(nonce, '', deviceId);

  const attestation = await postAttest(body, privatePem, publicJwk, 'Attestation');
  persistAttestation(attestation, deviceId, privatePem, publicJwk);

  return attestation.access_token;
}

function persistAttestation(
  attestation: AttestResponse & { access_token: string },
  fallbackDeviceId: string,
  privatePem: string,
  publicJwk: JwkPublicKey,
): void {
  const serverDeviceId = attestation.device_id || fallbackDeviceId;
  logger.debug(`[AUTH] attestation success device_id=${serverDeviceId}`);
  const currentSession: SessionData = getSession() || { deviceId: '' };
  saveSession({
    ...currentSession,
    deviceId: serverDeviceId,
    privatePem,
    publicJwk,
    attestationToken: attestation.access_token,
    attestationRefreshToken: attestation.refresh_token || '',
  });
}

// ─── Register PoP Key ────────────────────────────────────────────────────────

export async function registerIntegrity(integrityToken: string, nonce: string): Promise<void> {
  const { privatePem, publicJwk } = generateP256KeyPair();
  const session = getSession();
  const deviceId = session?.deviceId || crypto.randomUUID();
  const body = buildAttestBody(nonce, integrityToken, deviceId);

  const attestation = await postAttest(body, privatePem, publicJwk, 'Registration');
  persistAttestation(attestation, deviceId, privatePem, publicJwk);
}

// ─── Login ───────────────────────────────────────────────────────────────────

export async function loginUser(email?: string, password?: string): Promise<LoginData> {
  const resolvedEmail = email || process.env.IPUSNAS_EMAIL;
  const resolvedPassword = password || process.env.IPUSNAS_PASSWORD;
  if (!resolvedEmail || !resolvedPassword)
    throw new Error('Email and Password required (env: IPUSNAS_EMAIL, IPUSNAS_PASSWORD)');

  logger.debug(`[API] POST ${EP.LOGIN}`);
  const response = await fetch(EP.LOGIN, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ email: resolvedEmail, password: resolvedPassword }),
  });

  const text = await response.text();
  let loginBody: LoginResponse;
  try {
    loginBody = JSON.parse(text);
  } catch {
    throw new Error(`Login failed (not JSON): ${response.status} ${text.slice(0, 100)}`);
  }

  if (!response.ok || (!loginBody.success && !loginBody.data)) {
    throw new Error(loginBody.message || `Login failed: ${response.status}`);
  }

  const currentSession: SessionData = getSession() || { deviceId: '' };
  saveSession({
    ...currentSession,
    userToken: loginBody.data?.access_token,
    email: resolvedEmail,
    user: loginBody.data,
  });
  logger.debug(`[AUTH] login success email=${resolvedEmail} user_id=${loginBody.data?.id}`);

  return loginBody.data!;
}
