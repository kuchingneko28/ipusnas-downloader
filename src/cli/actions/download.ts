import AdmZip from "adm-zip";
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
import { logger, promptText, withSpinner, formatBytes } from "../ui";

export async function execute(bookId?: string, title?: string): Promise<void> {
  if (!bookId) {
    bookId = extractBookId(await promptText("Book ID or URL"));
  }
  if (!title) title = bookId;

  let accessData;
  try {
    const deviceToken = await attestDevice();
    const shelf = await listShelf();
    const item = shelf.find((entry) => entry.book_id === bookId || entry.id === bookId);
    if (!item) {
      logger.info("Book not borrowed yet — use Borrow first.");
      return;
    }
    const borrowId = item?.id || bookId;
    const epustakaId = item?.epustaka_id || "";
    if (item?.book_title) title = item.book_title;
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

  const existing = fs.readdirSync(outDir).filter(f => f.endsWith("_decrypted.pdf") || f.endsWith("_decrypted.epub"));
  if (existing.length) {
    logger.info(`Already downloaded: ${path.join(outDir, existing[0])}`);
    return;
  }

  const tmpFile = path.join(os.tmpdir(), `${bookId}.bin`);
  try {
    const response = await withSpinner("Downloading...", async () => {
      const downloadResponse = await fetch(urlFile);
      if (!downloadResponse.ok) throw new Error(downloadResponse.statusText);
      return downloadResponse;
    });
    const totalBytes = Number(response.headers.get("content-length") || 0);
    const fileWriter = fs.createWriteStream(tmpFile);
    const streamReader = response.body!.getReader();
    let downloaded = 0;
    while (true) {
      const { done, value } = await streamReader.read();
      if (done) break;
      downloaded += value.length;
      if (totalBytes > 0) {
        process.stdout.write(`\r\x1b[K  ${formatBytes(downloaded)} / ${formatBytes(totalBytes)} (${Math.round((downloaded / totalBytes) * 100)}%)`);
      }
      fileWriter.write(value);
    }
    fileWriter.end();
    process.stdout.write("\n");
  } catch (err: unknown) {
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

    if (hasMoco) {
      const extractDir = path.join(os.tmpdir(), `ipusnas-${bookId}`);
      fs.rmSync(extractDir, { recursive: true, force: true });
      zip.extractAllTo(extractDir, true, false, zipPassword);
      const mocoEntry = entries.find((entry) => entry.entryName.toLowerCase().endsWith(".moco"))!;
      const mocoPath = path.join(extractDir, mocoEntry.entryName);
      const finalPdf = path.join(outDir, `${safeTitle}_decrypted.pdf`);
      const ok = await decryptPdf(mocoPath, finalPdf, pdfPassword);
      if (ok) {
        logger.success(`Saved: ${finalPdf}`);
        try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
      } else {
        logger.error("Decryption failed.");
      }
    } else {
      const extractDir = path.join(os.tmpdir(), `ipusnas-${bookId}`);
      fs.rmSync(extractDir, { recursive: true, force: true });
      zip.extractAllTo(extractDir, true, false, zipPassword.slice(-64));
      const finalEpub = path.join(outDir, `${safeTitle}_decrypted.epub`);

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

      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
      logger.success(`Saved: ${finalEpub}`);
    }
    try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch {}
  } catch (error: unknown) {
    logger.error(`Failed to extract archive: ${(error as Error).message}`);
  }
}
