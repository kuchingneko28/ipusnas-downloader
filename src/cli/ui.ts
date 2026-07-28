/**
 * iPusnas UI — clack
 */

import * as clack from "@clack/prompts";

export const { intro, outro } = clack;

// ─── Logger ──────────────────────────────────────────────────────────────────

let verbose = false;

export function setVerbose(value: boolean) {
  verbose = value;
}

export const logger = {
  info: (msg: string) => clack.log.info(msg),
  success: (msg: string) => clack.log.success(msg),
  warn: (msg: string) => clack.log.warn(msg),
  error: (msg: string) => clack.log.error(msg),
  debug: (msg: string) => {
    if (verbose) clack.log.info(`[debug] ${msg}`);
  },
};

// ─── Spinner ─────────────────────────────────────────────────────────────────

export async function withSpinner<T>(label: string, task: () => Promise<T>): Promise<T> {
  const spinner = clack.spinner();
  spinner.start(label);
  try {
    const result = await task();
    spinner.stop(label);
    return result;
  } catch (error) {
    spinner.stop(label);
    throw error;
  }
}

// ─── Prompts (clack) ────────────────────────────────────────────────────────

export async function promptText(message: string, initialValue?: string): Promise<string> {
  const value = await clack.text({ message, initialValue });
  if (clack.isCancel(value)) process.exit(0);
  return value as string;
}

export async function promptPassword(message: string): Promise<string> {
  const value = await clack.password({ message });
  if (clack.isCancel(value)) process.exit(0);
  return value as string;
}

export async function promptSelect<Value>(
  message: string,
  options: clack.Option<Value>[],
): Promise<Value> {
  const value = await clack.select({ message, options });
  if (clack.isCancel(value)) process.exit(0);
  return value as Value;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, index)).toFixed(1)} ${units[index]}`;
}
