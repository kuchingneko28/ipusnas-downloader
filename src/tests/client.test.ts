import { beforeAll, describe, expect, it, mock } from "bun:test";
import { borrowBook, listShelf, searchBooks } from "../api/client";
import { saveSession } from "../core/session";

describe("API Client", () => {
  beforeAll(() => {
    // Setup Dummy Session
    saveSession({
      accessToken: "device-token",
      userToken: "user-token",
      deviceId: "device-123",
      user: { id: "user-123" },
    } as any);

    // Mock Global Fetch
    global.fetch = mock((url: string | URL | Request) => {
      const u = url.toString();

      if (u.includes("search-book")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: [{ id: "101", book_title: "Test Book" }],
            }),
          ),
        );
      }
      if (u.includes("book-detail")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: { catalog_info: { organization_id: "org-1" } },
            }),
          ),
        );
      }
      if (u.includes("epustaka-borrow")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{ id: "epus-1", organization_id: "org-1" }],
            }),
          ),
        );
      }
      if (u.includes("api/nonce")) return Promise.resolve(new Response(JSON.stringify({ nonce: "n" })));
      if (u.includes("api/attest"))
        return Promise.resolve(new Response(JSON.stringify({ success: true, access_token: "dt" })));

      if (u.includes("api/access")) {
        // Borrow Endpoint
        return Promise.resolve(new Response(JSON.stringify({ success: true, message: "Borrowed" })));
      }

      if (u.includes("book-borrow-shelf")) {
        return Promise.resolve(new Response(JSON.stringify({ data: [] })));
      }

      return Promise.resolve(new Response("{}"));
    }) as any;
  });

  it("should search books with user token", async () => {
    const books = await searchBooks("test");
    expect(books.length).toBe(1);
    expect(books[0].book_title).toBe("Test Book");
  });

  it("should perform full borrow flow", async () => {
    // This tests the orchestration of: Detail -> Epustaka -> Encrypt -> Attest -> Borrow
    const res = await borrowBook("book-101");
    expect(res.success).toBe(true);
  });

  it("should list shelf", async () => {
    const shelf = await listShelf();
    expect(Array.isArray(shelf)).toBe(true);
  });
});
