import { borrowBook, listShelf } from "../../api/client";
import { extractBookId } from "../../utils/book-id";
import { logger, promptText, withSpinner } from "../ui";

export async function execute(bookId?: string, title?: string): Promise<void> {
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
