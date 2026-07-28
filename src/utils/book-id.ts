/**
 * Extract Book ID (UUID) from input string
 * Input can be a full URL or just the ID
 */
export function extractBookId(input: string): string {
  // Regex for UUID
  const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

  const match = input.match(uuidRegex);

  if (match) {
    return match[0];
  }

  throw new Error("Invalid Book ID or URL (UUID not found)");
}
