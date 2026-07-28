import { returnBook, listShelf } from "../../api/client";
import { logger, promptText, withSpinner } from "../ui";

export async function execute(borrowId?: string, title?: string): Promise<void> {
  if (!borrowId) {
    borrowId = await promptText("Borrow ID or Book title");
  }
  if (!title) title = borrowId;

  const shelf = await listShelf();
  const item = shelf.find((entry) => entry.id === borrowId || entry.book_id === borrowId);
  if (!item) {
    logger.info("Not borrowed.");
    return;
  }

  await withSpinner(`Returning ${title || borrowId}...`, () => returnBook(item.id));
  logger.success(`Returned: ${title || borrowId}`);
}
