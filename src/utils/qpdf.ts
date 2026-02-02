import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "../cli/ui";

const IS_WINDOWS = os.platform() === "win32";

/**
 * Get QPDF Command
 */
export function getQpdfCommand(): string {
  // 0. Check Environment Variable Override
  if (process.env.QPDF_PATH && fs.existsSync(process.env.QPDF_PATH)) {
    return process.env.QPDF_PATH;
  }

  // Determine the correct binary name based on the current OS
  // Windows -> qpdf.exe
  // Linux/Mac -> qpdf
  const binaryName = IS_WINDOWS ? "qpdf.exe" : "qpdf";

  // 1. Check relative to the Executable (Portable Mode)
  // This ensures that if you send the 'bin' folder to a Windows user, it looks for qpdf.exe
  // If you send it to a Linux user, it looks for qpdf
  const execDir = path.dirname(process.execPath);
  const siblingBin = path.resolve(execDir, "qpdf", "bin", binaryName);
  if (fs.existsSync(siblingBin)) {
    return siblingBin;
  }

  // 2. Check project-local bin (Useful when running from source "bun start")
  // Structure: <project_root>/bin/qpdf/bin/qpdf(.exe)
  const localBin = path.resolve(process.cwd(), "bin", "qpdf", "bin", binaryName);
  if (fs.existsSync(localBin)) {
    return localBin;
  }

  // 3. Check legacy local bin (if user just dropped it in bin/)
  const legacyBin = path.resolve(process.cwd(), "bin", binaryName);
  if (fs.existsSync(legacyBin)) {
    return legacyBin;
  }

  // 3. Fallback to PATH
  return "qpdf";
}

/**
 * Decrypt PDF using QPDF
 */
export async function decryptPdf(inputPath: string, outputPath: string, password: string): Promise<boolean> {
  const cmd = getQpdfCommand();

  const args = ["--password=" + password, "--decrypt", inputPath, outputPath];
  logger.debug(`[QPDF] CMD: ${cmd} ${args.join(" ")}`);

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
  } catch (e: unknown) {
    // Basic type guard for error object
    const err = e as { code?: string; message: string };
    if (err.code === "ENOENT") {
      console.error("\n[ERROR] 'qpdf' is not installed or not in your PATH.");
      console.error("Please install it:");
      console.error("  - Linux: sudo apt install qpdf (or pacman -S qpdf)");
      console.error("  - Windows: download from https://github.com/qpdf/qpdf/releases and add to PATH.\n");
    } else {
      console.error(`[QPDF Failure] ${err.message || String(e)}`);
    }
    return false;
  }
}
