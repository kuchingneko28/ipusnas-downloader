import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "../cli/ui";

const IS_WINDOWS = os.platform() === "win32";

/**
 * Get QPDF Command
 */
function getQpdfCommand(): string {
  if (IS_WINDOWS) {
    // Check local bin folder
    const localBin = path.resolve(process.cwd(), "bin", "qpdf.exe");
    if (fs.existsSync(localBin)) return localBin;

    // Fallback to vendor or just "qpdf" if added to path
    return "qpdf";
  }
  return "qpdf";
}

/**
 * Decrypt PDF using QPDF
 */
export async function decryptPdf(inputPath: string, outputPath: string, password: string): Promise<boolean> {
  const cmd = getQpdfCommand();

  const args = ["--password=" + password, "--decrypt", inputPath, outputPath];
  logger.debug(`[QPDF] CMD: ${cmd} ${args.join(" ")}`);

  // logger.info(`[QPDF] Decrypting: ${path.basename(inputPath)} -> ${path.basename(outputPath)}`);

  try {
    const proc = Bun.spawn([cmd, ...args], {
      stderr: "pipe",
      stdout: "ignore",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      console.error(`[QPDF] Failed with exit code ${exitCode}`);
      // Read stderr
      const stderr = await new Response(proc.stderr).text();
      console.error(stderr);
      return false;
    }

    return true;
  } catch (e: any) {
    if (e.code === "ENOENT") {
      console.error("\n[ERROR] 'qpdf' is not installed or not in your PATH.");
      console.error("Please install it:");
      console.error("  - Linux: sudo apt install qpdf (or pacman -S qpdf)");
      console.error("  - Windows: download from https://github.com/qpdf/qpdf/releases and add to PATH.\n");
    } else {
      console.error(`[QPDF Failure] ${e.message}`);
    }
    return false;
  }
}
