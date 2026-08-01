import { $ } from "bun";
import { attestDevice, isJwtExpired, registerIntegrity } from "../../api/auth";
import { getSession } from "../../core/config";
import { logger, promptText, withSpinner } from "../ui";

const ATTEST_FILE = "/sdcard/Android/data/mam.reader.ipusnas/files/ipusnas_attestation.json";
const PACKAGE_NAME = "mam.reader.ipusnas";
const ATTEST_ACTIVITY = "mam.reader.ipusnas/mam.reader.ilibrary.attestation.TriggerAttestActivity";

async function extractAdbAttestation(): Promise<{ token: string; nonce: string }> {
  try {
    const devices = await $`adb devices`.text();
    logger.debug(`[REGISTER] adb devices: ${devices.trim()}`);
    if (!devices.includes("\tdevice")) return { token: "", nonce: "" };

    // Stream logcat live in the background: `adb logcat -d` dumps miss the app's
    // ATTEST_DEBUG lines on some devices (lines evicted from the buffer before the
    // dump), while a live stream drains them in real time.
    const logProc = Bun.spawn(["adb", "logcat", "-s", "ATTEST_DEBUG"], { stdout: "pipe" });

    // Delete the attestation file so we only accept a fresh nonce/token (nonce is single-use).
    await $`adb shell rm -f ${ATTEST_FILE}`.catch(() => {});
    await $`adb shell am force-stop ${PACKAGE_NAME}`;
    logger.info("Triggering Play Integrity attestation...");
    await $`adb shell am start -n ${ATTEST_ACTIVITY}`;

    // The patched app writes nonce+token to a JSON file on every successful
    // attestation; poll for it (fast and reliable).
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const json = await $`adb shell cat ${ATTEST_FILE}`.text().catch(() => "");
      if (json) {
        try {
          const parsed = JSON.parse(json) as { nonce?: string; integrity_token?: string };
          if (parsed.nonce && parsed.integrity_token) {
            logProc.kill();
            return { token: parsed.integrity_token, nonce: parsed.nonce };
          }
        } catch { /* partial write, retry */ }
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    // Fallback: read the live logcat stream (covers the whole attestation window).
    logProc.kill();
    await logProc.exited.catch(() => {});
    const log = await new Response(logProc.stdout).text();
    const tokenMatch = log.match(/integrity_token:\s*([A-Za-z0-9_.\-]+)/);
    const nonceMatch = log.match(/nonce:\s*([A-Za-z0-9_.\-]+)/);
    if (tokenMatch && nonceMatch) {
      logger.debug(`[REGISTER] token=${tokenMatch[1].slice(0, 20)}... nonce=${nonceMatch[1].slice(0, 20)}...`);
      return { token: tokenMatch[1], nonce: nonceMatch[1] };
    }
    logger.debug("[REGISTER] token/nonce not found");
  } catch (e) { logger.debug(`[REGISTER] ADB error: ${(e as Error).message}`); }
  return { token: "", nonce: "" };
}

export async function execute(integrityToken?: string, nonce?: string, force = false): Promise<void> {
  const existing = getSession();
  if (!force && existing?.privatePem && existing.attestationToken && !isJwtExpired(existing.attestationToken)) {
    logger.success(`Already registered (Device: ${existing.deviceId})`);
    return;
  }

  if (!force && existing?.privatePem && existing.attestationRefreshToken) {
    try {
      await withSpinner("Refreshing expired attestation...", () => attestDevice());
      logger.success(`Registration refreshed (Device: ${getSession()?.deviceId})`);
      return;
    } catch (error: unknown) {
      logger.warn(`Attestation refresh failed: ${(error as Error).message}`);
    }
  }

  if (!integrityToken || !nonce) {
    const adb = await withSpinner("Checking ADB device...", () => extractAdbAttestation());
    if (adb.token && adb.nonce) {
      integrityToken = adb.token;
      nonce = adb.nonce;
      logger.success("Got attestation from ADB device.");
    }
  }

  if (!integrityToken) integrityToken = await promptText("Play Integrity token");
  if (!nonce) nonce = await promptText("Play Integrity nonce");

  await withSpinner("Registering...", () => registerIntegrity(integrityToken!, nonce!));
  logger.success("PoP device key registered.");
}
