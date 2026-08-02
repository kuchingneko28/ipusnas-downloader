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

interface ConfigFile {
  device_id?: string;
  user_token?: string;
  email?: string;
  password?: string;
  device_private_key?: string;
  device_public_key?: string;
  attestation_token?: string;
  attestation_refresh_token?: string;
  user?: LoginData;
}

let cache: SessionData | null = null;
let configPath = path.resolve(process.cwd(), "config.json");

function loadSession(): SessionData | null {
  try {
    if (fs.existsSync(configPath)) {
      logger.debug(`[CONFIG] loading from ${configPath}`);
      const raw = JSON.parse(fs.readFileSync(configPath, "utf-8")) as ConfigFile;
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
  } catch (error) { logger.debug(`[CONFIG] parse error: ${(error as Error).message}`); }
  return null;
}

export function saveSession(data: SessionData) {
  cache = data;

  let existing: ConfigFile = {};
  try {
    if (fs.existsSync(configPath)) {
      existing = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch { /* ignore */ }
  logger.debug(`[CONFIG] saving to ${configPath}`);

  const merged: ConfigFile = {
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
