import { describe, expect, it } from "bun:test";
import {
  decryptJwe,
  decryptReencryptedPassword,
  encryptPp2Borrow,
  generateP256KeyPair,
  popHeaders,
  signPayloadEcdsa,
} from "../core/crypto";

describe("PP2 JWE", () => {
  it("round-trips encrypt/decrypt", () => {
    const jwt = "test-jwt";
    const payload = {
      book_id: "abc",
      user_id: "user1",
      epustaka_id: "epub1",
      organization_id: "org1",
      school_id: "",
      ts: 1234567890,
    };

    const encrypted = encryptPp2Borrow(payload, jwt);
    expect(encrypted.startsWith("PP2.")).toBe(true);

    const decrypted = decryptJwe(encrypted, jwt);
    expect(decrypted.book_id).toBe("abc");
    expect(decrypted.ts).toBe(1234567890);
  });

  it("fails with wrong JWT", () => {
    const encrypted = encryptPp2Borrow(
      { book_id: "x", user_id: "u", epustaka_id: "e", organization_id: "o", school_id: "", ts: 0 },
      "correct",
    );
    expect(() => decryptJwe(encrypted, "wrong")).toThrow();
  });
});

describe("Reencrypted Password", () => {
  it("returns empty for empty input", () => {
    expect(decryptReencryptedPassword("key", "")).toBe("");
  });
});

describe("ECDSA P-256 PoP", () => {
  it("generates valid keypair", () => {
    const { privatePem, publicJwk } = generateP256KeyPair();
    expect(privatePem).toContain("BEGIN PRIVATE KEY");
    expect(publicJwk.kty).toBe("EC");
    expect(publicJwk.crv).toBe("P-256");
    expect(publicJwk.x.length).toBeGreaterThan(0);
  });

  it("signs to base64url", () => {
    const { privatePem } = generateP256KeyPair();
    const signature = signPayloadEcdsa(privatePem, "test");
    expect(signature).not.toMatch(/[+/=]/);
    expect(signature.length).toBeGreaterThan(0);
  });

  it("builds valid PoP headers", () => {
    const { privatePem, publicJwk } = generateP256KeyPair();
    const headers = popHeaders(privatePem, publicJwk, "POST", "/trust/api/access", Buffer.from("body"));

    expect(headers["X-Device-Public-Key"]).toBe(JSON.stringify(publicJwk));
    expect(headers["X-Body-SHA256"]).toMatch(/^[0-9a-f]{64}$/);
    expect(headers["X-Timestamp"]).toMatch(/^\d+$/);
    expect(headers["X-Nonce"]).toMatch(/^[0-9a-f]{16}$/);
    expect(headers["X-Signature-JTI"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
