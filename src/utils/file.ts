import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Sanitize filename to be safe for Windows/Linux
 */
export function sanitizeFilename(name: string): string {
  // Replace illegal chars and spaces with underscore, collapse multiples
  return name.replace(/[^a-z0-9]/gi, "_").replace(/_{2,}/g, "_");
}

/**
 * Get path to session file
 * Try local directory first, then fallback to user home
 */
export function getSessionPath(): string {
  // 1. Check for local session (Portable Mode)
  const localPath = path.resolve(process.cwd(), ".session.json");
  if (fs.existsSync(localPath)) {
    return localPath;
  }

  // 2. Default to Home Dir (Global Mode)
  const homePath = path.resolve(os.homedir(), ".ipusnas-session.json");
  return homePath;
}

/**
 * Get Downloads Directory
 */
export function getDownloadsDir(): string {
  const dir = path.resolve(process.cwd(), "downloads");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}
