#!/usr/bin/env bun
import { Command } from "commander";
import prompts from "prompts";
import { loginUser } from "./api/auth";
import { checkCommand } from "./cli/commands/check";
import { startInteractiveFlow } from "./cli/flow";
import { logger, setVerbose, withSpinner } from "./cli/ui";
import { getSession } from "./core/session";

const program = new Command();

program
  .name("ipusnas")
  .description(
    "A powerful CLI tool to download and decrypt books from the iPusnas (National Library of Indonesia) digital library ecosystem.",
  )
  .version("1.0.0")
  .option("-v, --verbose", "Enable verbose logging")
  .hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.verbose) {
      setVerbose(true);
      logger.debug("Verbose mode enabled");
    }
  });

program
  .command("login")
  .description("Login to iPusnas")
  .action(async () => {
    const response = await prompts([
      { type: "text", name: "email", message: "Email" },
      { type: "password", name: "password", message: "Password" },
    ]);

    try {
      await withSpinner("Logging in...", async () => {
        await loginUser(response.email, response.password);
      });
      logger.success("Logged in successfully!");
    } catch (e: any) {
      logger.error(`Login failed: ${e.message}`);
    }
  });

program
  .command("download [input]")
  .description("Download a book by ID or URL (or interactive if empty)")
  .action(async (input) => {
    await startInteractiveFlow(input);
  });

program
  .command("search [query]")
  .description("Search and download a book")
  .action(async (query) => {
    await startInteractiveFlow(query);
  });

program
  .command("info")
  .description("Show session info")
  .action(() => {
    const s = getSession();
    if (s) {
      logger.info(`Logged in as: ${s.email}`);
      logger.info(`Device ID: ${s.deviceId}`);
    } else {
      logger.warn("Not logged in.");
    }
  });

program.addCommand(checkCommand);

// Default action
program.action(async () => {
  if (process.argv.length > 2) {
    const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
    if (args.length > 0) {
      const query = args.join(" ");
      await startInteractiveFlow(query);
      return;
    }
  }

  program.help();
});

program.parse(process.argv);
