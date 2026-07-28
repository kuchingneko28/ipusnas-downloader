import { searchBooks } from "../../api/client";
import type { Book } from "../../api/types";
import { logger, promptSelect, promptText, withSpinner } from "../ui";
import * as borrow from "./borrow";
import * as download from "./download";
import * as returnAction from "./return";

const PAGE = 25;

type SelectValue = Book | "__next" | "__prev" | null;
type ActionValue = "borrow" | "download" | "return" | "back" | null;

export async function execute(query?: string): Promise<void> {
  if (!query) {
    query = await promptText("Search query");
  }
  if (!query) return;

  let offset = 0;
  let results: Book[] = [];
  let hasMore = false;

  async function loadPage(): Promise<void> {
    results = await withSpinner(`Searching "${query}"...`, () => searchBooks(query!, PAGE, offset));
    hasMore = results.length === PAGE;
  }

  await loadPage();
  logger.debug(`[SEARCH] "${query}": ${results.length} results`);
  if (!results.length) {
    logger.warn("No books found.");
    return;
  }

  while (true) {
    const pageLabel = `Results (page ${offset / PAGE + 1})`;
    const options: { value: SelectValue; label: string }[] = [
      ...results.map((item) => ({
        value: item as SelectValue,
        label: `${item.book_title} — ${item.author_name}`,
      })),
    ];
    if (hasMore) options.push({ value: "__next" as SelectValue, label: "Next Page →" });
    if (offset > 0) options.push({ value: "__prev" as SelectValue, label: "← Previous" });
    options.push({ value: null as SelectValue, label: "Back" });

    const picked: SelectValue = await promptSelect(pageLabel, options);
    if (!picked || picked === "__next" || picked === "__prev") {
      if (picked === "__next" && hasMore) {
        offset += PAGE;
        await loadPage();
        if (!results.length) { offset -= PAGE; break; }
      }
      if (picked === "__prev" && offset > 0) {
        offset -= PAGE;
        await loadPage();
      }
      if (!picked) break;
      continue;
    }

    const action: ActionValue = await promptSelect("Action:", [
      { value: "borrow" as ActionValue, label: "Borrow" },
      { value: "download" as ActionValue, label: "Download (if borrowed)" },
      { value: "return" as ActionValue, label: "Return" },
      { value: "back" as ActionValue, label: "← Back" },
    ]);

    if (action === "borrow") await borrow.execute(picked.id, picked.book_title);
    else if (action === "download") await download.execute(picked.id, picked.book_title);
    else if (action === "return") await returnAction.execute(picked.id, picked.book_title);
    break;
  }
}
