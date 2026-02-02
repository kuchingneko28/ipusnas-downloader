import chalk from "chalk";
import cliProgress from "cli-progress";
import ora from "ora";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

export function createProgressBar() {
  return new cliProgress.SingleBar({
    // Arch Style: [################] 100%
    format: ` {bar} {percentage}% | {valueFormatted}/{totalFormatted}`,
    barCompleteChar: "#",
    barIncompleteChar: "-",
    hideCursor: true,
    barsize: 40,
  });
}

const state = {
  verbose: false,
};

export function setVerbose(enabled: boolean) {
  state.verbose = enabled;
}

export const logger = {
  info: (msg: string) => console.log(`${chalk.blue("[INFO]")} ${msg}`),
  error: (msg: string) => console.error(`${chalk.red.bold("[ERROR]")} ${msg}`),
  success: (msg: string) => console.log(`${chalk.green.bold("[SUCCESS]")} ${msg}`),
  warn: (msg: string) => console.warn(`${chalk.yellow("[WARN]")} ${msg}`),
  debug: (msg: string) => {
    if (state.verbose) console.log(`${chalk.gray("[DEBUG]")} ${msg}`);
  },
};

export const formatter = {
  bytes: formatBytes,
};

export async function withSpinner<T>(text: string, task: () => Promise<T>): Promise<T> {
  const spinner = ora(text).start();
  try {
    const result = await task();
    spinner.succeed();
    return result;
  } catch (e) {
    spinner.fail();
    throw e;
  }
}
