import { loginUser } from "../../api/auth";
import { getSession } from "../../core/config";
import { intro, outro, withSpinner } from "../ui";

/**
 * Standard command envelope: title banner, optional login gate, then the
 * handler, then a closing "Done." line.
 */
export async function runCommand(name: string, needsLogin: boolean, handler: () => Promise<void>): Promise<void> {
  intro(name);
  if (needsLogin) await ensureLogin();
  await handler();
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
