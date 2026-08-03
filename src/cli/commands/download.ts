import AdmZip from "adm-zip";
import type { CAC } from "cac";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { attestDevice } from "../../api/auth";
import { getSecureBorrowKey, listShelf } from "../../api/client";
import { decryptDrmPassword } from "../../core/crypto";
import { getSession } from "../../core/config";
import { getDownloadsDir, sanitizeFilename } from "../../utils/paths";
import { decryptPdf } from "../../utils/qpdf";
import { extractBookId } from "../../utils/book-id";
import type { AccessData } from "../../api/types";
import { logger, promptText, spinner, withSpinner } from "../ui";
import { runCommand } from "./run";

export async function downloadCommand(bookId?: string, title?: string): Promise<void> {
  if (!bookId) {
    bookId = extractBookId(await promptText("Book ID or URL"));
  }
  if (!title) title = bookId;

  let accessData: AccessData;
  try {
    const deviceToken = await attestDevice();
    const shelf = await listShelf();
    const item = shelf.find((entry) => entry.book_id === bookId || entry.id === bookId);
    if (!item) {
      logger.info("Book not borrowed yet — use Borrow first.");
      return;
    }
    const borrowId = item.id || bookId;
    const epustakaId = item.epustaka_id || "";
    if (item.book_title) title = item.book_title;
    logger.debug(`[DOWNLOAD] shelf item: id=${item.id} borrow_id=${borrowId} epustaka_id=${epustakaId}`);
    accessData = await withSpinner("Getting DRM key...", () =>
      getSecureBorrowKey(bookId!, deviceToken, borrowId, epustakaId),
    );
  } catch (err: unknown) {
    logger.error(`DRM key failed: ${(err as Error).message}`);
    return;
  }

  const attestToken = getSession()?.attestationToken || "";
  const { urlFile, zipPassword, pdfPassword } = decryptDrmPassword(accessData, attestToken);
  if (!urlFile) {
    logger.error("No download URL.");
    return;
  }

  const safeTitle = sanitizeFilename(title);
  const outDir = path.join(getDownloadsDir(), safeTitle);
  fs.mkdirSync(outDir, { recursive: true });

  const existing = fs.readdirSync(outDir).filter((file) => file.endsWith("_decrypted.pdf") || file.endsWith("_decrypted.epub"));
  if (existing.length) {
    logger.info(`Already downloaded: ${path.join(outDir, existing[0])}`);
    return;
  }

  // The download is a zip file under an .mdrm extension. Both temp artifacts
  // are removed in the finally below, on success and failure alike.
  const tmpFile = path.join(os.tmpdir(), `${bookId}.mdrm`);
  const extractDir = path.join(os.tmpdir(), `ipusnas-${bookId}`);
  try {
    const downloadSpinner = spinner();
    downloadSpinner.start(`Downloading ${title}...`);
    try {
      const response = await fetch(urlFile);
      if (!response.ok) throw new Error(response.statusText);
      // Bun.write(tmpFile, response) hangs on large bodies (bun 1.3.14) —
      // stream the body into a FileSink instead; end() flushes to disk.
      const total = Number(response.headers.get("content-length") || 0);
      const writer = Bun.file(tmpFile).writer();
      const reader = response.body!.getReader();
      let downloaded = 0;
      let lastShown = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        downloaded += value.length;
        writer.write(value);
        const shown = total
          ? `${(downloaded / 1048576).toFixed(1)} MB / ${(total / 1048576).toFixed(1)} MB`
          : `${(downloaded / 1048576).toFixed(1)} MB`;
        if (shown !== lastShown) {
          lastShown = shown;
          downloadSpinner.message(`Downloading ${title}... ${shown}`);
        }
      }
      await writer.end();
      const size = fs.statSync(tmpFile).size;
      if (size === 0) throw new Error("Downloaded file is empty");
      downloadSpinner.stop(`Downloaded ${(size / 1048576).toFixed(1)} MB`);
    } catch (err: unknown) {
      downloadSpinner.stop("Download failed");
      logger.error(`Download failed: ${(err as Error).message}`);
      return;
    }

    try {
      const zip = new AdmZip(tmpFile);
      const entries = zip.getEntries();
      logger.debug(`[DOWNLOAD] archive entries: ${entries.length}`);
      if (!entries.length) throw new Error("Empty archive");

      const hasMoco = entries.some((entry) => entry.entryName.toLowerCase().endsWith(".moco"));
      logger.debug(`[DOWNLOAD] type=${hasMoco ? "PDF" : "EPUB"}`);

      fs.rmSync(extractDir, { recursive: true, force: true });
      zip.extractAllTo(extractDir, true, false, hasMoco ? zipPassword : zipPassword.slice(-64));

      if (hasMoco) {
        const mocoEntry = entries.find((entry) => entry.entryName.toLowerCase().endsWith(".moco"))!;
        const finalPdf = path.join(outDir, `${safeTitle}_decrypted.pdf`);
        const pdfSpinner = spinner();
        pdfSpinner.start("Decrypting PDF...");
        try {
          const ok = await decryptPdf(path.join(extractDir, mocoEntry.entryName), finalPdf, pdfPassword);
          pdfSpinner.stop(ok ? `Saved: ${finalPdf}` : "Decryption failed");
        } catch (err: unknown) {
          pdfSpinner.stop("Decryption failed");
          throw err;
        }
      } else {
        const finalEpub = path.join(outDir, `${safeTitle}_decrypted.epub`);
        const epubSpinner = spinner();
        epubSpinner.start("Rebuilding EPUB...");
        try {
          // Rebuild the epub so mimetype is stored (uncompressed) per OCF spec.
          const epubZip = new AdmZip();
          const mimetypeContent = fs.readFileSync(path.join(extractDir, "mimetype"));
          epubZip.addFile("mimetype", mimetypeContent, "", 0x8000);
          for (const entry of zip.getEntries()) {
            if (entry.entryName === "mimetype" || entry.isDirectory) continue;
            const fullPath = path.join(extractDir, entry.entryName);
            if (fs.existsSync(fullPath)) {
              epubZip.addLocalFile(fullPath, path.dirname(entry.entryName).replace(/\\/g, "/"));
            }
          }
          epubZip.writeZip(finalEpub);
          epubSpinner.stop(`Saved: ${finalEpub}`);
        } catch (err: unknown) {
          epubSpinner.stop("Rebuild failed");
          throw err;
        }
      }
    } catch (error: unknown) {
      logger.error(`Failed to extract archive: ${(error as Error).message}`);
    }
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.rmSync(tmpFile, { force: true });
  }
}

export function register(cli: CAC): void {
  cli
    .command("download [input]", "Download a book by ID or URL")
    .action(async (input?: string) => {
      await runCommand("Download", true, () => downloadCommand(input ? extractBookId(input) : undefined));
    });
}
