import { logger } from "../cli/ui";
import { USER_AGENT, generateWebAttestationPayload } from "../core/drm";
import { getSession, saveSession, type SessionData } from "../core/session";
import type { AttestResponse, LoginResponse, NonceResponse } from "./types";

const API_BASE_URL = "https://api2-ipusnas.perpusnas.go.id/api";
const AGENT_BASE_URL = "https://api2-ipusnas.perpusnas.go.id/agent";

const ENDPOINTS = {
  NONCE: AGENT_BASE_URL + "/api/nonce",
  ATTEST: AGENT_BASE_URL + "/api/attest",
  LOGIN: "https://api2-ipusnas.perpusnas.go.id/api/auth/login",
};

const BASE_HEADERS = {
  Origin: "https://ipusnas2.perpusnas.go.id",
  Referer: "https://ipusnas2.perpusnas.go.id/",
  "User-Agent": USER_AGENT,
  "Content-Type": "application/vnd.api+json",
  Accept: "application/json, text/plain, */*",
};

export async function getNonce(): Promise<string> {
  logger.debug(`[API] GET ${ENDPOINTS.NONCE}`);
  const res = await fetch(ENDPOINTS.NONCE, { headers: BASE_HEADERS });
  const json = (await res.json()) as NonceResponse;
  if (!json.nonce) throw new Error("Failed to get nonce");
  return json.nonce;
}

export async function attestDevice(force = false): Promise<string> {
  // Check if we already have a session with a valid token
  const currentSession = getSession();
  if (!force && currentSession?.deviceToken && currentSession?.deviceId) {
    return currentSession.deviceToken;
  }

  const nonce = await getNonce();

  // Persistent Device ID or generate new
  let deviceId = getSession()?.deviceId;
  if (!deviceId) {
    deviceId = crypto.randomUUID();
  }

  const payload = generateWebAttestationPayload(nonce, deviceId);

  logger.debug(`[API] POST ${ENDPOINTS.ATTEST}`);
  const res = await fetch(ENDPOINTS.ATTEST, {
    method: "POST",
    headers: { ...BASE_HEADERS, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = (await res.json()) as AttestResponse;
  if (!json.success || !json.access_token) {
    throw new Error("Attestation Failed: " + JSON.stringify(json));
  }

  const currentSafe: SessionData = getSession() || {
    deviceToken: "",
    deviceId: "",
  };

  saveSession({
    ...currentSafe,
    deviceToken: json.access_token, // Map API access_token to deviceToken
    deviceId: deviceId,
  });

  return json.access_token;
}

export async function loginUser(email?: string, password?: string): Promise<LoginResponse["data"]> {
  const e = email || process.env.IPUSNAS_EMAIL;
  const p = password || process.env.IPUSNAS_PASSWORD;

  if (!e || !p) {
    throw new Error("Email and Password required (env: IPUSNAS_EMAIL, IPUSNAS_PASSWORD)");
  }

  logger.debug(`[API] POST ${ENDPOINTS.LOGIN}`);
  const res = await fetch(ENDPOINTS.LOGIN, {
    method: "POST",
    headers: { ...BASE_HEADERS },
    body: JSON.stringify({ email: e, password: p }),
  });

  const text = await res.text();
  let json: LoginResponse;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Login failed (Not JSON): ${res.status} ${res.statusText} - ${text.substring(0, 100)}`);
  }

  // Check success based on response structure
  if (!json.success && !json.data) {
    if (res.status >= 400) throw new Error(json.message || "Login failed");
  }

  // Save user token (for syncing) and device token (for borrowing) if present

  const currentSafe: SessionData = getSession() || {
    deviceToken: "",
    deviceId: "",
  };

  saveSession({
    ...currentSafe,
    userToken: json.data?.access_token,
    email: e,
    user: json.data,
  });

  return json.data;
}
