import { $ } from 'bun';
import type { CAC } from 'cac';
import { readFileSync } from 'node:fs';
import { attestDevice, isJwtExpired, registerIntegrity } from '../../api/auth';
import { getSession } from '../../core/config';
import { logger, promptText, spinner } from '../ui';
import { runCommand } from './run';

const ATTEST_FILE = '/sdcard/Android/data/mam.reader.ipusnas/files/ipusnas_attestation.json';
const PACKAGE_NAME = 'mam.reader.ipusnas';
const ATTEST_ACTIVITY = 'mam.reader.ipusnas/mam.reader.ilibrary.attestation.TriggerAttestActivity';

interface AttestationFile {
  integrity_token?: string;
  nonce?: string;
}

async function extractAdbAttestation(): Promise<{ token: string; nonce: string }> {
  try {
    const devices = await $`adb devices`.text();
    logger.debug(`[REGISTER] adb devices: ${devices.trim()}`);
    if (!devices.includes('\tdevice')) return { token: '', nonce: '' };

    // Stream logcat live in the background: `adb logcat -d` dumps miss the app's
    // ATTEST_DEBUG lines on some devices (lines evicted from the buffer before the
    // dump), while a live stream drains them in real time.
    const logProc = Bun.spawn(['adb', 'logcat', '-s', 'ATTEST_DEBUG'], { stdout: 'pipe' });

    // Delete the attestation file so we only accept a fresh nonce/token (nonce is single-use).
    // .quiet(): suppress adb's own stdout (e.g. `Starting: Intent ...`) so it doesn't corrupt the spinner.
    await $`adb shell rm -f ${ATTEST_FILE}`.quiet().catch(() => {});
    await $`adb shell am force-stop ${PACKAGE_NAME}`.quiet();
    await $`adb shell am start -n ${ATTEST_ACTIVITY}`.quiet();

    // The patched app writes nonce+token to a JSON file on every successful
    // attestation; poll for it (fast and reliable).
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const json = await $`adb shell cat ${ATTEST_FILE}`.text().catch(() => '');
      if (json) {
        try {
          const parsed = JSON.parse(json) as AttestationFile;
          if (parsed.nonce && parsed.integrity_token) {
            logProc.kill();
            return { token: parsed.integrity_token, nonce: parsed.nonce };
          }
        } catch {
          /* partial write, retry */
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
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
    logger.debug('[REGISTER] token/nonce not found');
  } catch (error) {
    logger.debug(`[REGISTER] ADB error: ${(error as Error).message}`);
  }
  return { token: '', nonce: '' };
}

async function registerCommand(integrityToken?: string, nonce?: string, force = false): Promise<void> {
  const existing = getSession();
  if (!force && existing?.privatePem && existing.attestationToken && !isJwtExpired(existing.attestationToken)) {
    logger.success(`Already registered (Device: ${existing.deviceId})`);
    return;
  }

  if (!force && existing?.privatePem && existing.attestationRefreshToken) {
    const refreshSpinner = spinner();
    refreshSpinner.start('Refreshing expired attestation...');
    try {
      await attestDevice();
      refreshSpinner.stop(`Registration refreshed (Device: ${getSession()?.deviceId})`);
      return;
    } catch (error: unknown) {
      refreshSpinner.stop(`Attestation refresh failed: ${(error as Error).message}`);
    }
  }

  if (!integrityToken || !nonce) {
    const attSpinner = spinner();
    attSpinner.start('Attesting on device...');
    const adb = await extractAdbAttestation();
    if (adb.token && adb.nonce) {
      integrityToken = adb.token;
      nonce = adb.nonce;
      attSpinner.stop('Attestation captured from device.');
    } else {
      attSpinner.stop('No attestation found — enter token manually.');
    }
  }

  if (!integrityToken) integrityToken = await promptText('Play Integrity token');
  if (!nonce) nonce = await promptText('Play Integrity nonce');

  const regSpinner = spinner();
  regSpinner.start('Registering PoP key...');
  try {
    await registerIntegrity(integrityToken!, nonce!);
    regSpinner.stop('PoP device key registered.');
  } catch (error: unknown) {
    regSpinner.stop('Registration failed.');
    throw error;
  }
}

export function register(cli: CAC): void {
  cli
    .command('register', 'Register PoP device key')
    .option('--token <token>', 'Play Integrity token')
    .option('--nonce <nonce>', 'Play Integrity nonce')
    .option('--file <path>', 'JSON file containing integrity_token and nonce')
    .option('--force', 'Force re-registration even if already registered')
    .action(async (options: Record<string, string>) => {
      let integrityToken: string | undefined = options.token;
      let nonce: string | undefined = options.nonce;
      if (options.file) {
        try {
          const attestationFile = JSON.parse(readFileSync(options.file, 'utf8')) as AttestationFile;
          integrityToken ||= attestationFile.integrity_token;
          nonce ||= attestationFile.nonce;
        } catch (error) {
          throw new Error(`Could not read attestation file: ${(error as Error).message}`);
        }
      }
      await runCommand('Register', false, () => registerCommand(integrityToken, nonce, !!options.force));
    });
}
