import { $ } from "bun";
import chalk from "chalk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import ora from "ora";

// Check if we are running in a clearable TTY
const isInteractive = process.stdout.isTTY;

async function hasCommand(cmd: string) {
  try {
    const proc = Bun.spawn(["which", cmd], { stdout: "ignore", stderr: "ignore" });
    const exitCode = await proc.exited;
    return exitCode === 0;
  } catch {
    return false;
  }
}

interface GitHubRelease {
  tag_name: string;
}

async function getLatestVersion(): Promise<string> {
  const spinner = ora("Fetching latest qpdf version from GitHub...").start();
  try {
    const res = await fetch("https://api.github.com/repos/qpdf/qpdf/releases/latest");
    if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);

    // Explicitly cast to safe interface
    const data = (await res.json()) as GitHubRelease;
    const tagName = data.tag_name;
    const version = tagName.replace(/^v/, "");

    spinner.succeed(chalk.green(`Latest version: ${version}`));
    return version;
  } catch (error) {
    spinner.warn(chalk.yellow(`Failed to fetch latest version (${error}). Using fallback.`));
    return "11.10.1";
  }
}

const PLATFORMS: Record<string, (v: string) => string> = {
  "linux-x64": (v) => `qpdf-${v}-bin-linux-x86_64.zip`,
  "win32-x64": (v) => `qpdf-${v}-msvc64.zip`,
};

async function downloadFile(url: string, dest: string) {
  const spinner = ora(`Downloading ${path.basename(dest)}...`).start();
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download: ${response.statusText}`);
    if (!response.body) throw new Error("Response body is empty");
    // Bun's ReadableStream vs Node's Readable mismatch
    await pipeline(response.body as unknown as NodeJS.ReadableStream, fs.createWriteStream(dest));
    spinner.succeed(chalk.green("Download complete."));
  } catch (e) {
    spinner.fail(chalk.red("Download failed."));
    throw e;
  }
}

async function installQpdf() {
  console.log(chalk.blue("\n-> Checking qpdf..."));

  const platformKey = `${os.platform()}-${os.arch()}`;
  const getAssetName = PLATFORMS[platformKey];

  if (!getAssetName) {
    console.log(chalk.yellow(`[WARN] Auto-install not supported for: ${platformKey}`));
    console.log("Please install 'qpdf' manually.");
    return;
  }

  const binDir = path.resolve(process.cwd(), "bin");
  const qpdfDir = path.resolve(binDir, "qpdf");

  // Simple check: if bin/qpdf exists and has content
  // Note: We might want to be more aggressive checking validity if previous install failed
  if (fs.existsSync(qpdfDir) && fs.readdirSync(qpdfDir).length > 0) {
    // Check for lib/libqpdf.so* size on linux to detect broken install
    if (os.platform() === "linux") {
      const libDir = path.join(qpdfDir, "lib");
      if (fs.existsSync(libDir)) {
        const libs = fs.readdirSync(libDir).filter((f) => f.includes("libqpdf"));
        // If any lib is tiny (symlink text), we likely have a broken install
        const suspicious = libs.some((f) => fs.statSync(path.join(libDir, f)).size < 100);
        if (suspicious) {
          console.log(chalk.yellow("Detected broken installation (symlink issues). Reinstalling..."));
          fs.rmSync(qpdfDir, { recursive: true, force: true });
        } else {
          console.log(chalk.green("✔ qpdf is locally installed."));
          return;
        }
      }
    } else {
      console.log(chalk.green("✔ qpdf is locally installed."));
      return;
    }
  }

  const version = await getLatestVersion();
  const assetName = getAssetName(version);
  const downloadUrl = `https://github.com/qpdf/qpdf/releases/download/v${version}/${assetName}`;

  const tmpDir = path.resolve(process.cwd(), "temp_setup");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const zipPath = path.resolve(tmpDir, assetName);

  try {
    await downloadFile(downloadUrl, zipPath);

    const spinner = ora("Extracting...").start();

    // Prefer system 'unzip' on Linux/Mac to handle symlinks correctly
    const useUnzip = (await hasCommand("unzip")) && os.platform() !== "win32";

    if (useUnzip) {
      try {
        await $`unzip -q -o ${zipPath} -d ${tmpDir}`;
      } catch (e) {
        spinner.warn(chalk.yellow("System unzip failed, falling back to adm-zip..."));
        const admZip = await import("adm-zip");
        const zip = new admZip.default(zipPath);
        zip.extractAllTo(tmpDir, true);
      }
    } else {
      const admZip = await import("adm-zip");
      const zip = new admZip.default(zipPath);
      zip.extractAllTo(tmpDir, true);
    }

    // Find the extracted root
    let sourceRoot = tmpDir;
    const items = fs.readdirSync(tmpDir).filter((n) => n !== assetName);
    const subDirs = items.filter((i) => fs.statSync(path.join(tmpDir, i)).isDirectory());

    if (subDirs.length === 1 && subDirs[0].startsWith("qpdf")) {
      sourceRoot = path.join(tmpDir, subDirs[0]);
    }

    if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });
    if (fs.existsSync(qpdfDir)) fs.rmSync(qpdfDir, { recursive: true, force: true });

    if (sourceRoot === tmpDir) {
      fs.mkdirSync(qpdfDir, { recursive: true });
      for (const item of items) {
        // Avoid moving the zip file itself if it's there
        if (item !== assetName) {
          // Use 'mv' via bun shell for robustness across partitions, or fs.rename
          // fs.renameSync works if on same partition. setup usually same partition.
          fs.renameSync(path.join(tmpDir, item), path.join(qpdfDir, item));
        }
      }
    } else {
      fs.renameSync(sourceRoot, qpdfDir);
    }

    spinner.succeed(chalk.green("Extraction successful."));
    console.log(chalk.dim(`Installed to: ${qpdfDir}`));

    // chmod +x on linux
    if (os.platform() === "linux") {
      const qpdfBin = path.join(qpdfDir, "bin", "qpdf");
      if (fs.existsSync(qpdfBin)) {
        fs.chmodSync(qpdfBin, 0o755);
      }
    }
  } catch (error) {
    console.error(chalk.red(`\n[ERROR] Failed to install qpdf: ${error}`));
  } finally {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  console.log(chalk.bold.cyan("== iPusnas Downloader Setup ==\n"));

  console.log(chalk.blue("-> Installing dependencies..."));
  await $`bun install`;

  await installQpdf();

  console.log(chalk.blue("\n-> Building project..."));
  try {
    await $`bun run build`;
    console.log(chalk.green("\n✔ Build success!"));
  } catch (e) {
    console.error(chalk.red("\n❌ Build failed."));
    process.exit(1);
  }

  console.log(chalk.bold.green("\n== Setup Complete! =="));
  console.log(`Try running: ${chalk.cyan("bin/ipusnas --help")}`);
}

main().catch((e) => {
  console.error(chalk.red(e));
  process.exit(1);
});
