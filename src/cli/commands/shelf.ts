import type { CAC } from "cac";
import type { ShelfItem } from "../../api/types";
import { listShelf } from "../../api/client";
import { logger, promptSelect, withSpinner } from "../ui";
import { runCommand } from "./run";
import { downloadCommand } from "./download";
import { returnCommand } from "./return";

type ActionValue = "download" | "return" | "back" | null;

async function shelfCommand(): Promise<void> {
  const books = await withSpinner("Loading shelf...", () => listShelf());
  logger.debug(`[SHELF] ${books.length} books`);
  if (!books.length) {
    logger.warn("Shelf is empty.");
    return;
  }

  const picked: ShelfItem | null = await promptSelect(`Shelf (${books.length} books):`, [
    ...books.map((item) => ({
      value: item,
      label: `${item.book_title || item.book_id} — ${item.book_author || "Unknown"} (returns ${(item.borrow_end_date || "").slice(0, 10)})`,
    })),
    { value: null, label: "← Back" },
  ]);

  if (!picked) return;

  const action: ActionValue = await promptSelect("Action:", [
    { value: "download" as ActionValue, label: "Download" },
    { value: "return" as ActionValue, label: "Return" },
    { value: "back" as ActionValue, label: "← Back" },
  ]);

  if (action === "download") await downloadCommand(picked.book_id, picked.book_title);
  else if (action === "return") await returnCommand(picked.id, picked.book_title);
}

export function register(cli: CAC): void {
  cli
    .command("shelf", "View borrowed books - select to download or return")
    .action(async () => {
      await runCommand("Shelf", true, shelfCommand);
    });
}
