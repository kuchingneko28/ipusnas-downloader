import type { CAC } from "cac";
import { returnBook, listShelf } from "../../api/client";
import { extractBookId } from "../../utils/book-id";
import { logger, promptText, withSpinner } from "../ui";
import { runCommand } from "./run";

export async function returnCommand(borrowId?: string, title?: string): Promise<void> {
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

export function register(cli: CAC): void {
  cli
    .command("return [input]", "Return a borrowed book by ID or URL")
    .action(async (input?: string) => {
      await runCommand("Return", true, () => returnCommand(input ? extractBookId(input) : undefined));
    });
}
