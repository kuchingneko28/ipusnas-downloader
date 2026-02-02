import fs from "node:fs";
import { getSessionPath } from "../utils/file";

export interface SessionData {
  deviceToken: string; // Was accessToken (Device/Attest Token)
  deviceId: string;
  userToken?: string; // User Login Token
  refreshToken?: string;
  expiresAt?: number; // Optional timestamp
  email?: string;
  user?: any;
}

let sessionCache: SessionData | null = null;
const sessionPath = getSessionPath();

/**
 * Load session from disk
 */
export function loadSession(): SessionData | null {
  try {
    if (fs.existsSync(sessionPath)) {
      const data = fs.readFileSync(sessionPath, "utf-8");
      if (!data.trim()) return null; // Handle empty file
      sessionCache = JSON.parse(data);
      return sessionCache;
    }
  } catch (error) {
    console.error("Failed to load session (resetting):", error);
    clearSession(); // Delete corrupted file
  }
  return null;
}

/**
 * Save session to disk
 */
export function saveSession(data: SessionData) {
  sessionCache = data;
  try {
    fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2), "utf-8");
  } catch (error) {
    console.error("Failed to save session:", error);
  }
}

/**
 * Get current session (from memory or load)
 */
export function getSession(): SessionData | null {
  if (!sessionCache) return loadSession();
  return sessionCache;
}

/**
 * Clear session
 */
export function clearSession() {
  sessionCache = null;
  if (fs.existsSync(sessionPath)) {
    fs.unlinkSync(sessionPath);
  }
}

/**
 * Check if session exists (does not verify validity against API)
 */
export function hasSession(): boolean {
  const s = getSession();
  return !!s && !!s.deviceToken;
}
