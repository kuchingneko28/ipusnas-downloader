import AdmZip from "adm-zip";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import prompts from "prompts";
import { loginUser } from "../api/auth";
import { borrowBook, getBookDetail, getDownloadInfo, returnBook, searchBooks, type Book } from "../api/client";
import { decryptBorrowKey, generatePasswordPDF, generatePasswordZip } from "../core/drm";
import { getSession } from "../core/session";
import { getDownloadsDir, sanitizeFilename } from "../utils/file";
import { decryptPdf } from "../utils/qpdf";
import { extractBookId } from "../utils/url";
import { createProgressBar, formatter, logger, withSpinner } from "./ui";

/**
 * Process a single book (Download -> Decrypt)
 */
async function processBook(
  bookId: string,
  autoReturn = true,
  metadata?: { title?: string; author?: string; cover?: string; detail?: Book },
) {
  logger.info("Fetching download info...");
  const info = await getDownloadInfo(bookId);

  if (!info.url_file) {
    throw new Error("Download URL not found. Is the book borrowed?");
  }

  let { url_file, borrow_key, epustaka, book_title, book_author } = info;
  let fullDetail = metadata?.detail;

  // Use provided metadata if API metadata is missing
  if ((!book_title || !book_author) && metadata) {
    book_title = book_title || metadata.title;
    book_author = book_author || metadata.author;
  }

  // Fetch metadata if missing OR if we need full details for meta.json
  if (!book_title || !book_author || !fullDetail) {
    logger.info("Fetching book metadata...");
    try {
      fullDetail = await getBookDetail(bookId);
      if (fullDetail) {
        book_title = fullDetail.book_title || fullDetail.title || book_title;
        book_author = fullDetail.author_name || fullDetail.creator || book_author;
      }
    } catch (e) {
      logger.warn("Failed to fetch full metadata, using fallback.");
    }
  }

  const safeTitle = sanitizeFilename(book_title || "Unknown");
  const bookFolderName = safeTitle;

  const userId = getSession()?.user?.id;
  logger.info(`Downloading: ${book_title || "Unknown Title"}`);

  const baseDownloadsDir = getDownloadsDir();
  const bookOutputDir = path.join(baseDownloadsDir, bookFolderName);
  if (!fs.existsSync(bookOutputDir)) {
    fs.mkdirSync(bookOutputDir, { recursive: true });
  }

  if (fullDetail) {
    try {
      fs.writeFileSync(path.join(bookOutputDir, "meta.json"), JSON.stringify(fullDetail, null, 2));
    } catch (e) {}
  }

  const coverUrl = fullDetail?.cover_url || metadata?.cover || info.cover_url;
  if (coverUrl) {
    try {
      const coverPath = path.join(bookOutputDir, "cover.jpg");
      if (!fs.existsSync(coverPath)) {
        const cRes = await fetch(coverUrl);
        if (cRes.ok) {
          const buffer = await cRes.arrayBuffer();
          fs.writeFileSync(coverPath, Buffer.from(buffer));
        }
      }
    } catch (e) {
      logger.warn("Failed to save cover image");
    }
  }

  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `${bookId}.bin`);
  logger.info(`Using temp file: ${tempFile}`);

  const bar = createProgressBar();

  const res = await fetch(url_file);
  if (!res.ok) throw new Error("Download failed: " + res.statusText);

  const total = parseInt(res.headers.get("content-length") || "0");
  bar.start(total, 0, { valueFormatted: formatter.bytes(0), totalFormatted: formatter.bytes(total) });

  const reader = res.body?.getReader();
  const writer = fs.createWriteStream(tempFile);
  let downloaded = 0;

  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      downloaded += value.length;
      bar.update(downloaded, { valueFormatted: formatter.bytes(downloaded), totalFormatted: formatter.bytes(total) });
      writer.write(value);
    }
  }
  writer.end();
  bar.stop();

  logger.success("Download complete.");

  const finalName = `${safeTitle}_decrypted.pdf`;
  const finalPath = path.join(bookOutputDir, finalName);

  // Get Keys
  if (!userId) throw new Error("Missing user ID for decryption");

  const decryptedKey = decryptBorrowKey(userId, bookId, epustaka.id, borrow_key);
  const pdfPassword = generatePasswordPDF(decryptedKey);
  const zipPassword = generatePasswordZip(decryptedKey);

  // Check file type (MDRM is ZIP)
  let targetFile = tempFile;
  let isZip = false;

  try {
    const zip = new AdmZip(tempFile);
    const entries = zip.getEntries(); // Check if valid zip
    if (entries.length > 0) isZip = true;
  } catch (e) {
    isZip = false;
  }

  if (isZip) {
    logger.info("Unpacking MDRM container...");
    const zip = new AdmZip(tempFile);
    const entries = zip.getEntries();
    // find entry that matches bookId (usually bookId.pdf or similar)
    const entry = entries.find((e) => e.entryName.includes(bookId) || entries.length === 1);

    if (entry) {
      try {
        // We use zipPassword here
        zip.extractAllTo(tempDir, true, false, zipPassword);

        // Determine where it went
        targetFile = path.join(tempDir, entry.entryName);
      } catch (e) {
        logger.warn("Zip extraction outcome uncertain. Checking file...");
      }
    }
  }

  logger.info("Decrypting PDF...");
  const success = await decryptPdf(targetFile, finalPath, pdfPassword);

  if (success) {
    logger.success(`Saved to: ${finalName}`);
    // Cleanup Temp Dir
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      if (targetFile && targetFile !== tempFile && fs.existsSync(targetFile)) fs.unlinkSync(targetFile);
    } catch {}
  } else {
    logger.error("Decryption failed.");
  }

  if (autoReturn) {
    if (info.id) {
      logger.info("Returning book...");
      await returnBook(info.id);
      logger.success("Book returned.");
    }
  }
}

/**
 * Main Flow Handler
 */
export async function startInteractiveFlow(initialQuery?: string) {
  // 0. Ensure Login
  let session = getSession();
  if (!session?.userToken) {
    // Try auto-login env vars
    if (process.env.IPUSNAS_EMAIL && process.env.IPUSNAS_PASSWORD) {
      try {
        await withSpinner("Auto-logging in...", async () => await loginUser());
        session = getSession();
      } catch (e) {
        logger.warn("Auto-login failed. Please login manually.");
      }
    }

    if (!session?.userToken) {
      logger.warn("You need to login to search/download books.");
      const response = await prompts([
        { type: "text", name: "email", message: "Email" },
        { type: "password", name: "password", message: "Password" },
      ]);
      try {
        await withSpinner("Logging in...", async () => await loginUser(response.email, response.password));
        logger.success("Logged in!");
      } catch (e: any) {
        logger.error(`Login failed: ${e.message}`);
        return;
      }
    }
  }

  let query = initialQuery;

  if (!query) {
    const response = await prompts({
      type: "text",
      name: "query",
      message: "Search Query or URL:",
    });
    query = response.query;
  }

  if (!query) return;

  let bookId = "";
  let metadata: { title?: string; author?: string; cover?: string; detail?: Book } | undefined;

  try {
    bookId = extractBookId(query);
    logger.info(`Detected Book ID: ${bookId}`);
  } catch {
    // Not a URL/ID, treat as search query
    const books = await withSpinner(`Searching for "${query}"...`, () => searchBooks(query));
    if (books.length === 0) {
      logger.error("No books found.");
      return;
    }

    const selection = await prompts({
      type: "select",
      name: "book",
      message: "Select a book:",
      choices: books.map((b) => ({ title: `${b.book_title} (${b.author_name})`, value: b })),
    });

    if (!selection.book) return;
    bookId = selection.book.id; // UUID is string now
    metadata = {
      title: selection.book.book_title,
      author: selection.book.author_name,
      cover: selection.book.cover_url,
      detail: selection.book,
    };
  }

  logger.info("Borrowing...");
  try {
    await withSpinner("Borrowing book...", () => borrowBook(bookId));
    logger.success("Borrowed successfully.");
  } catch (e: any) {
    if (e.message && e.message.includes("Wait a moment")) {
      logger.info("Already borrowed or processing...");
    } else {
      logger.error(`Borrow Error: ${e.message}`);
      logger.info("Attempting to proceed anyway (might be already in shelf)...");
    }
  }

  try {
    await processBook(bookId, true, metadata);
  } catch (e: any) {
    logger.error(`Process Failed: ${e.message}`);
  }
}
