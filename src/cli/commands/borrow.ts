import type { CAC } from "cac";
import { borrowBook, listShelf } from "../../api/client";
import { extractBookId } from "../../utils/book-id";
import { logger, promptText, withSpinner } from "../ui";
import { runCommand } from "./run";

export async function borrowCommand(bookId?: string, title?: string): Promise<void> {
  if (!bookId) {
    bookId = extractBookId(await promptText("Book ID or URL"));
  }
  if (!title) title = bookId;

  const shelf = await listShelf();
  if (shelf.some((entry) => entry.book_id === bookId || entry.id === bookId)) {
    logger.info("Already borrowed.");
    return;
  }

  await withSpinner(`Borrowing ${title || bookId}...`, () => borrowBook(bookId));
  logger.success(`Borrowed: ${title || bookId}`);
}

export function register(cli: CAC): void {
  cli
    .command("borrow [input]", "Borrow a book by ID or URL")
    .action(async (input?: string) => {
      await runCommand("Borrow", true, () => borrowCommand(input ? extractBookId(input) : undefined));
    });
}
