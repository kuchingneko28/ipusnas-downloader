import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { searchBooks, listShelf } from "../api/client";

describe("API Client", () => {
  const originalFetch = global.fetch;

  beforeAll(() => {
    global.fetch = mock((url: string | URL | Request) => {
      const urlString = url.toString();
      if (urlString.includes("search-book")) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: [{ id: "1", book_title: "Test", author_name: "Author", cover_url: "" }] })),
        );
      }
      if (urlString.includes("book-borrow-shelf")) {
        return Promise.resolve(new Response(JSON.stringify({ data: [] })));
      }
      return Promise.resolve(new Response("{}"));
    }) as unknown as typeof global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("searches books", async () => {
    const results = await searchBooks("test");
    expect(results.length).toBe(1);
    expect(results[0].book_title).toBe("Test");
  });

  it("lists shelf", async () => {
    const shelf = await listShelf();
    expect(Array.isArray(shelf)).toBe(true);
  });
});
