#!/usr/bin/env bun
import { cac } from "cac";
import { registerCommands } from "./cli/commands";
import { setVerbose } from "./cli/ui";

const cli = cac("ipusnas");
cli.option("-v, --verbose", "Enable verbose logging");
registerCommands(cli);

const parsed = cli.parse();
if ((parsed.options as Record<string, unknown>).verbose) setVerbose(true);
