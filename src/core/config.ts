import fs from 'node:fs';
import path from 'node:path';
import type { LoginData } from '../api/types';
import type { JwkPublicKey } from './crypto';
import { logger } from '../cli/ui';

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
// Config lives next to the working directory by default, but a compiled binary
// (bin/ipusnas) can be run from anywhere — an env override keeps the session
// in a stable, predictable place when desired.
const configPath = path.resolve(process.env.IPUSNAS_CONFIG || path.join(process.cwd(), 'config.json'));

function loadSession(): SessionData | null {
  try {
    if (fs.existsSync(configPath)) {
      logger.debug(`[CONFIG] loading from ${configPath}`);
      const configData = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ConfigFile;
      let publicJwk: JwkPublicKey | undefined;
      if (configData.device_public_key) {
        try {
          publicJwk = JSON.parse(configData.device_public_key);
        } catch {
          logger.warn(
            `Config file has a malformed device_public_key — the session will load without a PoP key. Re-run \`ipusnas register\`.`,
          );
        }
      }
      cache = {
        deviceId: configData.device_id || '',
        userToken: configData.user_token || '',
        email: configData.email || '',
        password: configData.password || '',
        privatePem: configData.device_private_key || '',
        publicJwk,
        attestationToken: configData.attestation_token || '',
        attestationRefreshToken: configData.attestation_refresh_token || '',
        user: configData.user || undefined,
      };
      logger.debug(`[CONFIG] loaded device=${configData.device_id} email=${configData.email || 'none'}`);
      return cache;
    }
    logger.debug('[CONFIG] config file not found');
  } catch (error) {
    logger.debug(`[CONFIG] parse error: ${(error as Error).message}`);
  }
  return null;
}

export function saveSession(updatedSession: SessionData) {
  cache = updatedSession;

  let existing: ConfigFile = {};
  try {
    if (fs.existsSync(configPath)) {
      existing = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch {
    logger.warn(
      `Could not read existing config at ${configPath} — it will be rewritten from the in-memory session, dropping any unread fields.`,
    );
  }
  logger.debug(`[CONFIG] saving to ${configPath}`);

  const merged: ConfigFile = {
    ...existing,
    device_id: updatedSession.deviceId,
    user_token: updatedSession.userToken,
    email: updatedSession.email,
    password: updatedSession.password,
    device_private_key: updatedSession.privatePem,
    device_public_key: updatedSession.publicJwk ? JSON.stringify(updatedSession.publicJwk) : existing.device_public_key,
    attestation_token: updatedSession.attestationToken,
    attestation_refresh_token: updatedSession.attestationRefreshToken,
    user: updatedSession.user,
  };

  try {
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
  } catch (err) {
    logger.error(`Failed to save config: ${(err as Error).message}`);
  }
}

export function getSession(): SessionData | null {
  if (!cache) return loadSession();
  return cache;
}
