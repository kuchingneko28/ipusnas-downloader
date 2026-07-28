/**
 * iPusnas Auth — Login + PoP Device Attestation
 */

import { generateP256KeyPair, popHeaders } from "../core/crypto";
import { getSession, saveSession, type SessionData } from "../core/config";
import { logger } from "../cli/ui";
import type { AttestResponse, LoginData, LoginResponse, NonceResponse } from "./types";

// ─── Endpoints ───────────────────────────────────────────────────────────────

export const BASE = "https://backend-ipusnas.perpusnas.go.id";

const EP = {
  NONCE: `${BASE}/trust/api/nonce`,
  ATTEST: `${BASE}/trust/api/attest`,
  REFRESH: `${BASE}/trust/api/token/refresh`,
  LOGIN: `${BASE}/api/auth/login`,
  REFRESH_TOKEN: `${BASE}/api/auth/refresh-token`,
} as const;

// ─── Headers ─────────────────────────────────────────────────────────────────

export const HEADERS: Record<string, string> = {
  "User-Agent": "okhttp/5.3.2",
  "Content-Type": "application/vnd.api+json",
  Accept: "application/vnd.api+json",
};

const TRUST_HEADERS: Record<string, string> = {
  "User-Agent": "okhttp/5.3.2",
  "Content-Type": "application/json",
  Accept: "application/json",
};

// ─── Nonce ───────────────────────────────────────────────────────────────────

export async function getNonce(): Promise<string> {
  logger.debug(`[API] GET ${EP.NONCE}`);
  const res = await fetch(EP.NONCE, { headers: TRUST_HEADERS });
  const json = (await res.json()) as NonceResponse;
  if (!json.nonce) throw new Error("Failed to get nonce");
  return json.nonce;
}

// ─── Attestation Refresh (PoP-signed) ────────────────────────────────────────

async function refreshAttestation(session: SessionData): Promise<string> {
  if (!session.attestationRefreshToken) throw new Error("No attestation refresh token");

  const body = JSON.stringify({ refresh_token: session.attestationRefreshToken });
  const signedHeaders = popHeaders(
    session.privatePem!,
    JSON.stringify(session.publicJwk!),
    "POST",
    "/trust/api/token/refresh",
    Buffer.from(body),
  );

  logger.debug(`[API] POST ${EP.REFRESH}`);
  const response = await fetch(EP.REFRESH, {
    method: "POST",
    headers: { ...TRUST_HEADERS, ...signedHeaders, Authorization: `Bearer ${session.attestationToken || ""}` },
    body,
  });

  if (!response.ok) throw new Error(`Attestation refresh failed: ${response.status} ${await response.text()}`);

  const responseBody = (await response.json()) as Record<string, unknown>;
  const responseData = (responseBody.data ?? responseBody) as Record<string, unknown>;
  const token = String(responseData.access_token || responseData.device_attestation_token || "");

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
    const payload = JSON.parse(atob(token.split(".")[1]));
    return Date.now() / 1000 > (payload.exp || 0);
  } catch {
    return true;
  }
}

export async function attestDevice(force = false): Promise<string> {
  const session = getSession();

  // Reuse valid token
  if (!force && session?.attestationToken && session?.privatePem && !isJwtExpired(session.attestationToken)) {
    logger.debug("[AUTH] reusing valid attestation token");
    return session.attestationToken;
  }

  // Try refresh if we have PoP keys
  if (session?.attestationRefreshToken && session?.privatePem && session?.publicJwk) {
    try {
      logger.debug("[AUTH] attempting attestation refresh");
      return await refreshAttestation(session);
    } catch (error: unknown) {
      logger.debug(`[AUTH] Refresh failed: ${(error as Error).message}`);
    }
  }

  // Generate fresh PoP keypair
  logger.debug("[AUTH] generating fresh PoP keypair + attestation");
  const { privatePem, publicJwk } = generateP256KeyPair();
  const nonce = await getNonce();
  const deviceId = session?.deviceId || crypto.randomUUID();

  const body = JSON.stringify({
    platform: "android",
    nonce,
    environment: "prod",
    attestation_data: { integrity_token: "" },
    device_info: {
      device_id: deviceId,
      model: "SM-G998B",
      os_version: "13",
      sdk_version: 33,
      app_version: "2.1.4",
      package_name: "mam.reader.ipusnas",
    },
  });

  const signedHeaders = popHeaders(privatePem, publicJwk, "POST", "/trust/api/attest", Buffer.from(body));

  logger.debug(`[API] POST ${EP.ATTEST}`);
  const response = await fetch(EP.ATTEST, {
    method: "POST",
    headers: { ...TRUST_HEADERS, ...signedHeaders },
    body,
  });

  if (!response.ok) throw new Error(`Attestation failed: ${response.status} ${await response.text()}`);

  const json = (await response.json()) as AttestResponse & { data?: AttestResponse };
  const data = json.data ?? json;
  if (json.success === false || !data.access_token) {
    throw new Error("Attestation failed: " + JSON.stringify(json));
  }

  const serverDeviceId = (data.device_id as string) || deviceId;
  logger.debug(`[AUTH] device attestation success device_id=${serverDeviceId}`);
  const currentSession: SessionData = getSession() || { deviceId: "" };
  saveSession({
    ...currentSession,
    deviceId: serverDeviceId,
    attestationToken: data.access_token,
    attestationRefreshToken: data.refresh_token || "",
    privatePem,
    publicJwk,
  });

  return data.access_token;
}

// ─── Register PoP Key ────────────────────────────────────────────────────────

export async function registerIntegrity(integrityToken: string, nonce: string): Promise<void> {
  const { privatePem, publicJwk } = generateP256KeyPair();
  const session = getSession();
  const deviceId = session?.deviceId || crypto.randomUUID();

  const body = JSON.stringify({
    platform: "android",
    nonce,
    environment: "prod",
    attestation_data: { integrity_token: integrityToken },
    device_info: { device_id: deviceId, model: "SM-G998B", os_version: "13", sdk_version: 33, app_version: "2.1.4", package_name: "mam.reader.ipusnas" },
  });

  const signedHeaders = popHeaders(privatePem, publicJwk, "POST", "/trust/api/attest", Buffer.from(body));

  logger.debug(`[API] POST ${EP.ATTEST}`);
  const response = await fetch(EP.ATTEST, {
    method: "POST",
    headers: { ...TRUST_HEADERS, ...signedHeaders },
    body,
  });

  if (!response.ok) throw new Error(`Registration failed: ${response.status} ${await response.text()}`);

  const json = (await response.json()) as AttestResponse & { data?: AttestResponse };
  const data = json.data ?? json;
  if (json.success === false || !data.access_token) {
    throw new Error("Registration failed: " + JSON.stringify(json));
  }

  const serverDeviceId = (data.device_id as string) || deviceId;
  logger.debug(`[AUTH] registration success device_id=${serverDeviceId}`);
  const currentSession: SessionData = getSession() || { deviceId: "" };
  saveSession({
    ...currentSession,
    deviceId: serverDeviceId,
    privatePem,
    publicJwk,
    attestationToken: data.access_token,
    attestationRefreshToken: data.refresh_token || "",
  });
}

// ─── Login ───────────────────────────────────────────────────────────────────

export async function loginUser(email?: string, password?: string): Promise<LoginData> {
  const resolvedEmail = email || process.env.IPUSNAS_EMAIL;
  const resolvedPassword = password || process.env.IPUSNAS_PASSWORD;
  if (!resolvedEmail || !resolvedPassword) throw new Error("Email and Password required (env: IPUSNAS_EMAIL, IPUSNAS_PASSWORD)");

  logger.debug(`[API] POST ${EP.LOGIN}`);
  const res = await fetch(EP.LOGIN, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify({ email: resolvedEmail, password: resolvedPassword }),
  });

  const text = await res.text();
  let json: LoginResponse;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Login failed (not JSON): ${res.status} ${text.slice(0, 100)}`);
  }

  if (!res.ok || (!json.success && !json.data)) {
    throw new Error(json.message || `Login failed: ${res.status}`);
  }

  const currentSession: SessionData = getSession() || { deviceId: "" };
  saveSession({ ...currentSession, userToken: json.data?.access_token, email: resolvedEmail, user: json.data });
  logger.debug(`[AUTH] login success email=${resolvedEmail} user_id=${json.data?.id}`);

  return json.data!;
}
