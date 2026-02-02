import { describe, expect, it, mock } from "bun:test";
import { extractBookId } from "../utils/url";

// Mock dependencies
mock.module("prompts", () => {
  return {
    default: async (opts: any) => {
      if (opts.name === "query") return { query: "test query" };
      if (opts.name === "book") return { book: { id: "book-123", title: "Test Book" } };
      return {};
    },
  };
});

mock.module("../src/cli/ui", () => ({
  logger: {
    info: () => {},
    success: () => {},
    error: () => {},
    warn: () => {},
  },
  createProgressBar: () => ({
    start: () => {},
    update: () => {},
    stop: () => {},
  }),
}));

describe("CLI Flow Logic", () => {
  it("should extract book ID correctly", () => {
    const id = "53aa0e2e-8092-4aac-884f-29d0961e22fa";
    const url = `https://ipusnas.perpusnas.go.id/book/${id}/`;

    expect(extractBookId(id)).toBe(id);
    expect(extractBookId(url)).toBe(id);
  });
});
