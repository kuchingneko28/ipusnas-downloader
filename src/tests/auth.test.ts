import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { attestDevice, loginUser } from "../api/auth";
import { getSession } from "../core/session";

// Mock FS to prevent real file writes
mock.module("node:fs", () => ({
  existsSync: mock(() => false),
  readFileSync: mock(() => ""),
  writeFileSync: mock(() => {}),
  unlinkSync: mock(() => {}), // Support clearSession
}));

describe("Auth Logic", () => {
  const originalFetch = global.fetch;

  beforeAll(() => {
    // Mock global fetch
    global.fetch = mock((url: string | URL | Request) => {
      const urlStr = url.toString();

      if (urlStr.includes("/nonce")) {
        return Promise.resolve(new Response(JSON.stringify({ nonce: "test-nonce" })));
      }
      if (urlStr.includes("/attest")) {
        return Promise.resolve(new Response(JSON.stringify({ success: true, access_token: "mock-access-token" })));
      }
      if (urlStr.includes("/login")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: { access_token: "mock-user-token", name: "User" },
            }),
          ),
        );
      }
      return Promise.resolve(new Response("{}"));
    }) as any;

    // Reset Session state via clearSession (hits mocked fs.unlinkSync)
    const { clearSession } = require("../core/session");
    clearSession();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("should attest device and save session", async () => {
    const token = await attestDevice();
    expect(token).toBe("mock-access-token");

    const session = getSession();
    expect(session?.deviceToken).toBe("mock-access-token");
    expect(session?.deviceId).toBeDefined();
  });

  it("should login user and update session", async () => {
    const data = await loginUser("test@test.com", "password");

    expect(data?.access_token).toBe("mock-user-token");

    const session = getSession();
    expect(session?.userToken).toBe("mock-user-token");
    expect(session?.email).toBe("test@test.com");
  });
});
