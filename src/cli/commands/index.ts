import { readFileSync } from "node:fs";
import type { CAC } from "cac";
import { loginUser } from "../../api/auth";
import { getSession } from "../../core/config";
import { extractBookId } from "../../utils/book-id";
import { intro, logger, outro, promptPassword, promptText, withSpinner } from "../ui";
import { execute as login } from "../actions/login";
import { execute as register } from "../actions/register";
import { execute as shelf } from "../actions/shelf";
import { execute as search } from "../actions/search";
import { execute as borrow } from "../actions/borrow";
import { execute as download } from "../actions/download";
import { execute as doReturn } from "../actions/return";
import { execute as doctor } from "../actions/doctor";

interface AttestationFile {
  integrity_token?: string;
  nonce?: string;
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

  await login();
}

export function registerCommands(cli: CAC): void {
  cli
    .command("login", "Login to iPusnas")
    .option("--email <email>", "Email")
    .option("--password <password>", "Password")
    .action(async (options: Record<string, string>) => {
      intro("Login");
      const email = options.email || (await promptText("Email"));
      const password = options.password || (await promptPassword("Password"));
      await withSpinner("Logging in...", () => loginUser(email, password));
      logger.success("Logged in!");
      outro("Done.");
    });

  cli
    .command("register", "Register PoP device key")
    .option("--token <token>", "Play Integrity token")
    .option("--nonce <nonce>", "Play Integrity nonce")
    .option("--file <path>", "JSON file containing integrity_token and nonce")
    .option("--force", "Force re-registration even if already registered")
    .action(async (options: Record<string, string>) => {
      intro("Register");
      let integrityToken: string | undefined = options.token;
      let nonce: string | undefined = options.nonce;
      if (options.file) {
        try {
          const attestationFile = JSON.parse(readFileSync(options.file, "utf8")) as AttestationFile;
          integrityToken ||= attestationFile.integrity_token;
          nonce ||= attestationFile.nonce;
        } catch (error) {
          throw new Error(`Could not read attestation file: ${(error as Error).message}`);
        }
      }
      await register(integrityToken, nonce, !!options.force);
      outro("Done.");
    });

  cli
    .command("shelf", "View borrowed books - select to download or return")
    .action(async () => {
      intro("Shelf");
      await ensureLogin();
      await shelf();
      outro("Done.");
    });

  cli
    .command("search [query]", "Search catalog - select an action")
    .action(async (query?: string) => {
      intro("Search");
      await ensureLogin();
      await search(query);
      outro("Done.");
    });

  cli
    .command("borrow [input]", "Borrow a book by ID or URL")
    .action(async (input?: string) => {
      intro("Borrow");
      await ensureLogin();
      await borrow(input ? extractBookId(input) : undefined);
      outro("Done.");
    });

  cli
    .command("download [input]", "Download a book by ID or URL")
    .action(async (input?: string) => {
      intro("Download");
      await ensureLogin();
      await download(input ? extractBookId(input) : undefined);
      outro("Done.");
    });

  cli
    .command("return [input]", "Return a borrowed book by ID or URL")
    .action(async (input?: string) => {
      intro("Return");
      await ensureLogin();
      await doReturn(input);
      outro("Done.");
    });

  cli
    .command("doctor", "System health check")
    .action(async () => {
      intro("Doctor");
      await doctor();
      outro("Done.");
    });
}
