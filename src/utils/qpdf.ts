import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { logger } from "../cli/ui";

function findQpdf(): string {
  if (process.env.QPDF_PATH && fs.existsSync(process.env.QPDF_PATH)) return process.env.QPDF_PATH;

  const binaryName = os.platform() === "win32" ? "qpdf.exe" : "qpdf";
  const localBin = path.resolve(process.cwd(), "bin", "qpdf", "bin", binaryName);
  if (fs.existsSync(localBin)) return localBin;

  return binaryName;
}

export function getQpdfCommand(): string {
  return findQpdf();
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
      logger.error(`QPDF failed with exit code ${exitCode}`);
      const stderr = await new Response(proc.stderr).text();
      logger.error(stderr);
      return false;
    }

    return true;
  } catch (error: unknown) {
    const nodeError = error as { code?: string; message: string };
    if (nodeError.code === "ENOENT") {
      logger.error("\nqpdf is not installed or not in PATH.");
      logger.error("Install it: sudo apt install qpdf (Linux) or download from github.com/qpdf/qpdf/releases (Windows)");
    } else {
      logger.error(`QPDF failure: ${nodeError.message || String(error)}`);
    }
    return false;
  }
}
