import type { CAC } from 'cac';
import { searchBooks } from '../../api/client';
import type { Book } from '../../api/types';
import { logger, promptSelect, promptText, withSpinner } from '../ui';
import { runCommand } from './run';
import { borrowCommand } from './borrow';
import { downloadCommand } from './download';
import { returnCommand } from './return';

const PAGE = 25;

type SelectValue = Book | '__next' | '__prev' | null;
type ActionValue = 'borrow' | 'download' | 'return' | 'back' | null;

async function searchCommand(query?: string): Promise<void> {
  if (!query) {
    query = await promptText('Search query');
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
    logger.warn('No books found.');
    return;
  }

  while (true) {
    const pageLabel = `Results (page ${offset / PAGE + 1})`;
    const options: { value: SelectValue; label: string }[] = [
      ...results.map((book) => ({
        value: book as SelectValue,
        label: `${book.book_title} — ${book.author_name}`,
      })),
    ];
    if (hasMore) options.push({ value: '__next' as SelectValue, label: 'Next Page →' });
    if (offset > 0) options.push({ value: '__prev' as SelectValue, label: '← Previous' });
    options.push({ value: null as SelectValue, label: 'Back' });

    const picked: SelectValue = await promptSelect(pageLabel, options);
    if (!picked || picked === '__next' || picked === '__prev') {
      if (picked === '__next' && hasMore) {
        offset += PAGE;
        await loadPage();
        if (!results.length) {
          // Last page drifted — restore the page we were on instead of ending the command.
          offset -= PAGE;
          await loadPage();
        }
      }
      if (picked === '__prev' && offset > 0) {
        offset -= PAGE;
        await loadPage();
      }
      if (!picked) break;
      continue;
    }

    const action: ActionValue = await promptSelect('Action:', [
      { value: 'borrow' as ActionValue, label: 'Borrow' },
      { value: 'download' as ActionValue, label: 'Download (if borrowed)' },
      { value: 'return' as ActionValue, label: 'Return' },
      { value: 'back' as ActionValue, label: '← Back' },
    ]);

    if (action === 'borrow') await borrowCommand(picked.id, picked.book_title);
    else if (action === 'download') await downloadCommand(picked.id, picked.book_title);
    else if (action === 'return') await returnCommand(picked.id, picked.book_title);
    break;
  }
}

export function register(cli: CAC): void {
  cli.command('search [query]', 'Search catalog - select an action').action(async (query?: string) => {
    await runCommand('Search', true, () => searchCommand(query));
  });
}
