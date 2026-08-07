import fs from 'node:fs';
import path from 'node:path';

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9]/gi, '_').replace(/_{2,}/g, '_');
}

export function getDownloadsDir(): string {
  const directory = path.resolve(process.env.IPUSNAS_OUTPUT_DIR || path.join(process.cwd(), 'downloads'));
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }
  return directory;
}
