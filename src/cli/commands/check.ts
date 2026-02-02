import { Command } from "commander";
import os from "node:os";
import { getQpdfCommand } from "../../utils/qpdf";
import { logger } from "../ui";

export const checkCommand = new Command("check").description("Check environment and dependencies").action(async () => {
  logger.info("Checking environment...");

  const results = {
    os: `${os.platform()} (${os.arch()})`,
    bun: Bun.version,
    qpdf: false,
    qpdfPath: "",
    network: false,
  };

  // Check QPDF
  const qpdfCmd = getQpdfCommand();
  results.qpdfPath = qpdfCmd;

  try {
    const proc = Bun.spawn([qpdfCmd, "--version"], {
      stderr: "ignore",
      stdout: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode === 0) {
      results.qpdf = true;
    }
  } catch (e) {
    results.qpdf = false;
  }

  // Check Network (Ping Google DNS)
  try {
    await fetch("https://8.8.8.8", { signal: AbortSignal.timeout(3000) }).catch(() => {});
    // simple fetch might fail on 8.8.8.8 if it expects html, strictly we just want to know if we have internet.
    // let's try a reliable head request to github or ipusnas
    const res = await fetch("https://www.google.com", { method: "HEAD", signal: AbortSignal.timeout(5000) });
    results.network = res.ok || res.status < 500;
  } catch (e) {
    results.network = false;
  }

  // Report
  console.log(`
Environment Report:
-------------------
OS      : ${results.os}
Bun     : ${results.bun}
Network : ${results.network ? "✅ Online" : "❌ Offline/Unreachable"}
QPDF    : ${results.qpdf ? "✅ Detected" : "❌ Missing"}
Path    : ${results.qpdfPath}
`);

  if (!results.qpdf) {
    logger.error("QPDF is missing or not working.");
    logger.info("Try running: bun run setup");
  }

  if (!results.network) {
    logger.warn("Network check failed. Download functionality may be limited.");
  }

  if (results.qpdf && results.network) {
    logger.success("System check passed! You are ready to use ipusnas-downloader.");
  }
});
