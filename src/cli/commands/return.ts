import type { CAC } from 'cac';
import { returnBook, listShelf } from '../../api/client';
import { extractBookId } from '../../utils/book-id';
import { logger, promptText, withSpinner } from '../ui';
import { runCommand } from './run';

export async function returnCommand(borrowId?: string, title?: string): Promise<void> {
  if (!borrowId) {
    borrowId = await promptText('Borrow ID, Book ID, or Title');
  }
  if (!title) title = borrowId;

  const shelf = await listShelf();
  const shelfEntry = shelf.find(
    (entry) => entry.id === borrowId || entry.book_id === borrowId || entry.book_title === borrowId,
  );
  if (!shelfEntry) {
    logger.info('Not borrowed.');
    return;
  }

  await withSpinner(`Returning ${title || borrowId}...`, () => returnBook(shelfEntry.id));
  logger.success(`Returned: ${title || borrowId}`);
}

export function register(cli: CAC): void {
  cli.command('return [input]', 'Return a borrowed book by ID or URL').action(async (input?: string) => {
    await runCommand('Return', true, () => returnCommand(input ? extractBookId(input) : undefined));
  });
}
