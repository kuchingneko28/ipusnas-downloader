import { describe, expect, it } from "bun:test";
import { extractBookId } from "../utils/book-id";

describe("Book ID extraction", () => {
  it("extracts book ID from UUID", () => {
    const id = "53aa0e2e-8092-4aac-884f-29d0961e22fa";
    expect(extractBookId(id)).toBe(id);
  });

  it("extracts book ID from URL", () => {
    const url = "https://ipusnas.perpusnas.go.id/book/53aa0e2e-8092-4aac-884f-29d0961e22fa/";
    expect(extractBookId(url)).toBe("53aa0e2e-8092-4aac-884f-29d0961e22fa");
  });
});
