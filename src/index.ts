#!/usr/bin/env bun
import { cac } from "cac";
import { registerCommands } from "./cli/commands";
import { setVerbose } from "./cli/ui";
import packageJson from "../package.json";

const cli = cac("ipusnas");
cli.option("--verbose", "Enable verbose logging");
registerCommands(cli);

cli.help();
cli.version(packageJson.version);

const parsed = cli.parse();
if (parsed.options.verbose) setVerbose(true);

if (!cli.matchedCommand && !parsed.options.help && !parsed.options.version) {
  cli.outputHelp();
}

