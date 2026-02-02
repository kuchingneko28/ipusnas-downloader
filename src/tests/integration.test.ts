import { describe, expect, it } from "bun:test";
import { attestDevice, loginUser } from "../api/auth";
import { listShelf, searchBooks } from "../api/client";
import { getSession } from "../core/session";

const email = process.env.IPUSNAS_EMAIL;
const password = process.env.IPUSNAS_PASSWORD;

// Only run if credentials are provided
const shouldRun = email && password;

describe("Real API Integration", () => {
  if (!shouldRun) {
    it.skip("check .env for credentials", () => {});
    return;
  }

  it("should login with real credentials", async () => {
    console.log(`Logging in as ${email}...`);
    const data = await loginUser(email, password);
    if (!data) throw new Error("Login returned no data");

    expect(data).toBeDefined();
    expect(data.access_token).toBeDefined(); // User/Sync Token

    const session = getSession();
    expect(session?.email).toBe(email);
    expect(session?.userToken).toBeDefined();
  }, 30000); // Increased timeout for slow login

  it("should attest device (real)", async () => {
    console.log("Attesting device...");
    const token = await attestDevice();
    expect(token).toBeDefined();
    expect(token.length).toBeGreaterThan(10);

    const session = getSession();
    expect(session?.deviceToken).toBe(token); // Device Token
  });

  it("should search for 'prabowo'", async () => {
    const books = await searchBooks("prabowo");
    console.log(`Found ${books.length} books for 'prabowo'`);
    expect(books.length).toBeGreaterThan(0);
    expect(books[0].book_title).toBeDefined();
  });

  it("should list borrowed shelf", async () => {
    const shelf = await listShelf();
    console.log(`Shelf has ${shelf.length} items.`);
    expect(Array.isArray(shelf)).toBe(true);
  });
});
