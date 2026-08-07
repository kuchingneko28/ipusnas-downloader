/**
 * iPusnas Setup — install qpdf + build
 */

import { $ } from 'bun';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { logger, withSpinner } from './cli/ui';

interface GitHubRelease {
  tag_name: string;
}

const PLATFORMS: Record<string, (version: string) => string> = {
  'linux-x64': (version) => `qpdf-${version}-bin-linux-x86_64.zip`,
  'win32-x64': (version) => `qpdf-${version}-msvc64.zip`,
};

async function hasCommand(name: string): Promise<boolean> {
  return Bun.which(name) !== null;
}

async function getLatestVersion(): Promise<string> {
  const response = await fetch('https://api.github.com/repos/qpdf/qpdf/releases/latest');
  if (!response.ok) throw new Error(`${response.status}`);
  const release = (await response.json()) as GitHubRelease;
  return release.tag_name.replace(/^v/, '');
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(response.statusText);
  await Bun.write(Bun.file(dest), await response.arrayBuffer());
}

async function installQpdf(): Promise<void> {
  const platformKey = `${os.platform()}-${os.arch()}`;
  const getAssetName = PLATFORMS[platformKey];

  if (!getAssetName) {
    logger.warn(`Auto-install not supported for ${platformKey}. Install qpdf manually.`);
    return;
  }

  const binDir = path.resolve(process.cwd(), 'bin');
  const qpdfDir = path.resolve(binDir, 'qpdf');

  // Already installed?
  if (fs.existsSync(qpdfDir) && fs.readdirSync(qpdfDir).length > 0) {
    if (os.platform() === 'linux') {
      const libDir = path.join(qpdfDir, 'lib');
      if (fs.existsSync(libDir)) {
        const qpdfLibraries = fs.readdirSync(libDir).filter((file) => file.includes('libqpdf'));
        const brokenInstall = qpdfLibraries.some((file) => fs.statSync(path.join(libDir, file)).size < 100);
        if (brokenInstall) {
          logger.warn('Broken qpdf install detected. Reinstalling...');
          fs.rmSync(qpdfDir, { recursive: true, force: true });
        } else {
          logger.success('qpdf already installed.');
          return;
        }
      }
    } else {
      logger.success('qpdf already installed.');
      return;
    }
  }

  const version = await getLatestVersion();
  const assetName = getAssetName(version);
  const downloadUrl = `https://github.com/qpdf/qpdf/releases/download/v${version}/${assetName}`;

  const tmpDir = path.resolve(process.cwd(), 'temp_setup');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const zipPath = path.join(tmpDir, assetName);

  try {
    await withSpinner(`Downloading qpdf ${version}...`, () => downloadFile(downloadUrl, zipPath));

    await withSpinner('Extracting...', async () => {
      if ((await hasCommand('unzip')) && os.platform() !== 'win32') {
        try {
          await $`unzip -q -o ${zipPath} -d ${tmpDir}`;
        } catch {
          const admZip = await import('adm-zip');
          new admZip.default(zipPath).extractAllTo(tmpDir, true);
        }
      } else {
        const admZip = await import('adm-zip');
        new admZip.default(zipPath).extractAllTo(tmpDir, true);
      }
    });

    // Move to bin/qpdf
    let sourceRoot = tmpDir;
    const items = fs.readdirSync(tmpDir).filter((entry) => entry !== assetName);
    const subDirectories = items.filter((entry) => fs.statSync(path.join(tmpDir, entry)).isDirectory());
    if (subDirectories.length === 1 && subDirectories[0].startsWith('qpdf')) {
      sourceRoot = path.join(tmpDir, subDirectories[0]);
    }

    fs.mkdirSync(binDir, { recursive: true });
    if (fs.existsSync(qpdfDir)) fs.rmSync(qpdfDir, { recursive: true, force: true });

    if (sourceRoot === tmpDir) {
      fs.mkdirSync(qpdfDir, { recursive: true });
      for (const fileName of items) {
        if (fileName !== assetName) fs.renameSync(path.join(tmpDir, fileName), path.join(qpdfDir, fileName));
      }
    } else {
      fs.renameSync(sourceRoot, qpdfDir);
    }

    if (os.platform() === 'linux') {
      const qpdfBin = path.join(qpdfDir, 'bin', 'qpdf');
      if (fs.existsSync(qpdfBin)) fs.chmodSync(qpdfBin, 0o755);
    }

    logger.success(`qpdf installed to ${qpdfDir}`);
  } catch (err: unknown) {
    logger.error(`Failed to install qpdf: ${(err as Error).message}`);
  } finally {
    if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function main() {
  logger.info('Installing dependencies...');
  await $`bun install`;

  await installQpdf();

  logger.info('Building project...');
  try {
    await $`bun run build`;
    logger.success('Build complete!');
  } catch {
    logger.error('Build failed.');
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error(err.message);
  process.exit(1);
});
