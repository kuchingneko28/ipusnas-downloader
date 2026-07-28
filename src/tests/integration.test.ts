import { describe, expect, it } from "bun:test";
import { attestDevice, loginUser } from "../api/auth";
import { listShelf, searchBooks } from "../api/client";
import { getSession } from "../core/config";

const email = process.env.IPUSNAS_EMAIL;
const password = process.env.IPUSNAS_PASSWORD;
const hasCreds = email && password;

describe("Real API Integration", () => {
  if (!hasCreds) {
    it.skip("no .env credentials", () => {});
    return;
  }

  it("logs in", async () => {
    const data = await loginUser(email, password);
    expect(data).toBeDefined();
    expect(data?.access_token).toBeDefined();

    const session = getSession();
    expect(session?.email).toBe(email);
    expect(session?.userToken).toBeDefined();
  }, 30000);

  it("attests device", async () => {
    const token = await attestDevice();
    expect(token.length).toBeGreaterThan(10);

    const session = getSession();
    expect(session?.attestationToken).toBe(token);
  });

  it("searches", async () => {
    const books = await searchBooks("prabowo");
    expect(books.length).toBeGreaterThan(0);
  });

  it("lists shelf", async () => {
    const shelf = await listShelf();
    expect(Array.isArray(shelf)).toBe(true);
  });
});
