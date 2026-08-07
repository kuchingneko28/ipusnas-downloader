import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { logger } from '../cli/ui';

function findQpdf(): string {
  if (process.env.QPDF_PATH && fs.existsSync(process.env.QPDF_PATH)) return process.env.QPDF_PATH;

  const binaryName = os.platform() === 'win32' ? 'qpdf.exe' : 'qpdf';
  const localBin = path.resolve(process.cwd(), 'bin', 'qpdf', 'bin', binaryName);
  if (fs.existsSync(localBin)) return localBin;

  return binaryName;
}

/**
 * Decrypt PDF using QPDF. Throws on any failure — a failed decrypt leaves no
 * output file, so a boolean return would let callers mistake failure for
 * success.
 */
export async function decryptPdf(inputPath: string, outputPath: string, password: string): Promise<void> {
  const cmd = findQpdf();

  // qpdf accepts the password only as a CLI argument, so it is visible in the
  // process list while running — keep it out of logs for that reason.
  const args = ['--password=' + password, '--decrypt', inputPath, outputPath];
  logger.debug(`[QPDF] CMD: ${cmd} --decrypt ${inputPath} ${outputPath}`);

  try {
    const processContext = Bun.spawn([cmd, ...args], { stderr: 'pipe', stdout: 'ignore' });
    const exitCode = await processContext.exited;
    if (exitCode !== 0) {
      logger.error(`QPDF failed with exit code ${exitCode}`);
      logger.error(await new Response(processContext.stderr).text());
      throw new Error('PDF decryption failed');
    }
  } catch (error: unknown) {
    const failure = error as { code?: string; message: string };
    if (failure.message === 'PDF decryption failed') throw error;
    if (failure.code === 'ENOENT') {
      logger.error('\nqpdf is not installed or not in PATH.');
      logger.error(
        'Install it: sudo apt install qpdf (Linux) or download from github.com/qpdf/qpdf/releases (Windows)',
      );
    } else {
      logger.error(`QPDF failure: ${failure.message || String(error)}`);
    }
    throw new Error('PDF decryption failed');
  }
}
