import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { generateP256KeyPair, type JwkPublicKey } from "../core/crypto";

/**
 * Hermetic config: the real config module reads ./config.json from the cwd,
 * which would make tests depend on a live login session. Mock it before
 * importing the module under test.
 */
interface FakeSession {
  deviceId: string;
  userToken?: string;
  privatePem?: string;
  publicJwk?: JwkPublicKey;
  attestationRefreshToken?: string;
  user?: { access_token: string; refresh_token?: string; id: string };
}

let session: FakeSession | null = null;
const saveCalls: unknown[] = [];

mock.module("../core/config", () => ({
  getSession: () => session,
  saveSession: (data: unknown) => {
    saveCalls.push(data);
  },
}));

const { searchBooks, listShelf, getSecureBorrowKey } = await import("../api/client");

type Route = (url: string) => Response | Promise<Response>;

const requests: { url: string; init?: RequestInit }[] = [];
let route: Route = () => new Response("{}");
const originalFetch = global.fetch;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

beforeAll(() => {
  global.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const url = input.toString();
    requests.push({ url, init });
    return route(url);
  }) as unknown as typeof global.fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
});

beforeEach(() => {
  requests.length = 0;
  saveCalls.length = 0;
  session = null;
  route = () => new Response("{}");
});

function headersOf(index: number): Record<string, string> {
  return (requests[index].init?.headers as Record<string, string>) || {};
}

describe("API client", () => {
  it("searches with auth header and query params", async () => {
    session = { deviceId: "d1", userToken: "tok1" };
    route = (url) =>
      url.includes("search-book")
        ? json({ data: [{ id: "1", book_title: "Test", author_name: "Author", cover_url: "" }] })
        : json({}, 500);

    const results = await searchBooks("test", 10, 5);
    expect(results).toHaveLength(1);
    expect(results[0].book_title).toBe("Test");

    expect(requests[0].url).toContain("q=test");
    expect(requests[0].url).toContain("limit=10");
    expect(requests[0].url).toContain("offset=5");
    expect(headersOf(0).Authorization).toBe("Bearer tok1");
  });

  it("lists the shelf", async () => {
    session = { deviceId: "d1", userToken: "tok1" };
    route = (url) => (url.includes("book-borrow-shelf") ? json({ data: [] }) : json({}, 500));

    const shelf = await listShelf();
    expect(shelf).toEqual([]);
    expect(requests[0].url).toContain("book-borrow-shelf");
  });

  it("refreshes the user token on 401 and retries once", async () => {
    session = {
      deviceId: "d1",
      userToken: "old",
      user: { access_token: "old", refresh_token: "rt1", id: "u1" },
    };
    let searchCalls = 0;
    route = (url) => {
      if (url.includes("refresh-token")) {
        return json({ data: { access_token: "new", refresh_token: "rt2", id: "u1" } });
      }
      if (url.includes("search-book")) {
        searchCalls += 1;
        return searchCalls === 1
          ? json({}, 401)
          : json({ data: [{ id: "1", book_title: "Retried", author_name: "Author", cover_url: "" }] });
      }
      return json({}, 500);
    };

    const results = await searchBooks("test");
    expect(results[0].book_title).toBe("Retried");
    expect(requests).toHaveLength(3); // search(401), refresh, search(retry)
    expect(headersOf(2).Authorization).toBe("Bearer new");
    expect(saveCalls[0]).toMatchObject({ userToken: "new" });
  });

  it("posts to the trust endpoint with signed PoP headers", async () => {
    const { privatePem, publicJwk } = generateP256KeyPair();
    session = { deviceId: "d1", userToken: "tok1", privatePem, publicJwk };
    route = (url) =>
      url.includes("secure_borrowkey")
        ? json({ data: { payload: "PP2.x", url_file: "https://cdn/book.zip" } })
        : json({}, 500);

    const access = await getSecureBorrowKey("book-1", "device-tok");
    expect(access.url_file).toBe("https://cdn/book.zip");

    expect(headersOf(0).Authorization).toBe("Bearer device-tok");
    expect(headersOf(0)["X-User-Authorization"]).toBe("Bearer tok1");
    expect(headersOf(0)["X-Device-Signature"]).toBeTruthy();
    expect(headersOf(0)["X-Body-SHA256"]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(String(requests[0].init?.body)).book_id).toBe("book-1");
  });

  it("re-attests the device on a trust 401 and retries with the new token", async () => {
    const { privatePem, publicJwk } = generateP256KeyPair();
    session = { deviceId: "d1", userToken: "tok1", privatePem, publicJwk };
    let keyCalls = 0;
    route = (url) => {
      if (url.includes("secure_borrowkey")) {
        keyCalls += 1;
        return keyCalls === 1 ? json({}, 401) : json({ data: { payload: "PP2.x" } });
      }
      if (url.includes("/trust/api/nonce")) return json({ nonce: "nonce-1" });
      if (url.includes("/trust/api/attest")) {
        return json({ success: true, access_token: "device-2", refresh_token: "dr", device_id: "d2" });
      }
      return json({}, 500);
    };

    const access = await getSecureBorrowKey("book-1", "device-tok");
    expect(access.payload).toBe("PP2.x");
    expect(requests).toHaveLength(4); // key(401), nonce, attest, key(retry)
    expect(headersOf(3).Authorization).toBe("Bearer device-2");
  });

  it("throws on a non-OK search response", async () => {
    session = { deviceId: "d1", userToken: "tok1" };
    route = () => json({ message: "boom" }, 500);

    await expect(searchBooks("test")).rejects.toThrow(/API request failed/);
  });

  it("throws an API error when the trust endpoint reports failure", async () => {
    const { privatePem, publicJwk } = generateP256KeyPair();
    session = { deviceId: "d1", userToken: "tok1", privatePem, publicJwk };
    route = () => json({ success: false, message: "nope" });

    await expect(getSecureBorrowKey("book-1", "device-tok")).rejects.toThrow(/API error/);
  });

  it("wraps network failures on trust posts", async () => {
    const { privatePem, publicJwk } = generateP256KeyPair();
    session = { deviceId: "d1", userToken: "tok1", privatePem, publicJwk };
    route = () => {
      throw new TypeError("fetch failed");
    };

    await expect(getSecureBorrowKey("book-1", "device-tok")).rejects.toThrow(/Network error/);
  });
});
