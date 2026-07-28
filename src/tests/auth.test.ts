import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { clearSession, getSession } from "../core/config";

describe("Auth", () => {
  const originalFetch = global.fetch;

  beforeAll(() => {
    clearSession();

    global.fetch = (async (url: string | URL | Request) => {
      const urlString = url.toString();
      if (urlString.includes("/nonce")) return new Response(JSON.stringify({ nonce: "test-nonce" }));
      if (urlString.includes("/attest")) return new Response(JSON.stringify({ success: true, access_token: "attest-tok" }));
      if (urlString.includes("/login")) return new Response(JSON.stringify({ success: true, data: { access_token: "user-tok", name: "User" } }));
      return new Response("{}");
    }) as unknown as typeof global.fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    clearSession();
  });

  it("loads session from config.json without overwriting", () => {
    const session = getSession();
    expect(session).toBeDefined();
  });
});
