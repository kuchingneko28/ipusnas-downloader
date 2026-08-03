import { loginUser } from "../../api/auth";
import { getSession } from "../../core/config";
import { intro, logger, outro, withSpinner } from "../ui";

/**
 * Standard command envelope: title banner, optional login gate, then the
 * handler, then a closing line. Any failure in the handler is caught here so
 * every command exits with a friendly message instead of an unhandled
 * rejection (cac never awaits the action promise).
 */
export async function runCommand(name: string, needsLogin: boolean, handler: () => Promise<void>): Promise<void> {
  intro(name);
  try {
    if (needsLogin) await ensureLogin();
    await handler();
  } catch (err: unknown) {
    logger.error((err as Error).message);
    outro("Failed.");
    process.exitCode = 1;
    return;
  }
  outro("Done.");
}

async function ensureLogin(): Promise<void> {
  if (getSession()?.userToken) return;

  if (process.env.IPUSNAS_EMAIL && process.env.IPUSNAS_PASSWORD) {
    try {
      await withSpinner("Auto-logging in...", () => loginUser());
      return;
    } catch {
      // Fall through to the interactive login.
    }
  }

  // Dynamic import avoids a static cycle: login.ts must not depend on run.ts.
  const { loginCommand } = await import("./login");
  await loginCommand();
}
