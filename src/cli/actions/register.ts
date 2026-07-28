import { $ } from "bun";
import { attestDevice, isJwtExpired, registerIntegrity } from "../../api/auth";
import { getSession } from "../../core/config";
import { logger, promptText, withSpinner } from "../ui";

async function extractAdbAttestation(): Promise<{ token: string; nonce: string }> {
  try {
    const devices = await $`adb devices`.text();
    logger.debug(`[REGISTER] adb devices: ${devices.trim()}`);
    if (!devices.includes("\tdevice")) return { token: "", nonce: "" };
    await $`adb logcat -c`;
    await $`adb shell am force-stop mam.reader.ipusnas`;
    logger.info("Triggering Play Integrity attestation...");
    await $`adb shell am start -n mam.reader.ipusnas/mam.reader.ilibrary.attestation.TriggerAttestActivity`;
    logger.debug("[REGISTER] waiting 6s for attestation...");
    await new Promise((resolve) => setTimeout(resolve, 6000));
    const log = await $`adb logcat -d`.text();
    const tokenMatch = log.match(/integrity_token:\s*([A-Za-z0-9_.\-]+)/);
    const nonceMatch = log.match(/nonce:\s*([A-Za-z0-9_.\-]+)/);
    if (tokenMatch && nonceMatch) {
      logger.debug(`[REGISTER] token=${tokenMatch[1].slice(0, 20)}... nonce=${nonceMatch[1].slice(0, 20)}...`);
      return { token: tokenMatch[1], nonce: nonceMatch[1] };
    }
    logger.debug("[REGISTER] token/nonce not found in logcat");
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
