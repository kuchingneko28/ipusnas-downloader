import fs from "node:fs";
import path from "node:path";
import type { LoginData } from "../api/types";
import type { JwkPublicKey } from "./crypto";
import { logger } from "../cli/ui";

export interface SessionData {
  deviceId: string;
  userToken?: string;
  email?: string;
  password?: string;
  user?: LoginData;
  privatePem?: string;
  publicJwk?: JwkPublicKey;
  attestationToken?: string;
  attestationRefreshToken?: string;
}

let cache: SessionData | null = null;
let configPath = path.resolve(process.cwd(), "config.json");

export function loadSession(): SessionData | null {
  try {
    if (fs.existsSync(configPath)) {
      logger.debug(`[CONFIG] loading from ${configPath}`);
      const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      let publicJwk: JwkPublicKey | undefined;
      if (raw.device_public_key) {
        try { publicJwk = JSON.parse(raw.device_public_key); } catch { /* malformed */ }
      }
      cache = {
        deviceId: raw.device_id || "",
        userToken: raw.user_token || "",
        email: raw.email || "",
        password: raw.password || "",
        privatePem: raw.device_private_key || "",
        publicJwk,
        attestationToken: raw.attestation_token || "",
        attestationRefreshToken: raw.attestation_refresh_token || "",
        user: raw.user || undefined,
      };
      logger.debug(`[CONFIG] loaded device=${raw.device_id} email=${raw.email || "none"}`);
      return cache;
    }
    logger.debug("[CONFIG] config file not found");
  } catch (e) { logger.debug(`[CONFIG] parse error: ${(e as Error).message}`); }
  return null;
}

export function saveSession(data: SessionData) {
  cache = data;

  let existing: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      existing = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch { /* ignore */ }
  logger.debug(`[CONFIG] saving to ${configPath}`);

  const merged: Record<string, unknown> = {
    ...existing,
    device_id: data.deviceId,
    user_token: data.userToken,
    email: data.email,
    password: data.password,
    device_private_key: data.privatePem,
    device_public_key: data.publicJwk ? JSON.stringify(data.publicJwk) : existing.device_public_key,
    attestation_token: data.attestationToken,
    attestation_refresh_token: data.attestationRefreshToken,
    user: data.user,
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), "utf-8");
  } catch (err) {
    console.error("Failed to save config:", err);
  }
}

export function getSession(): SessionData | null {
  if (!cache) return loadSession();
  return cache;
}

export function clearSession() {
  cache = null;
}
