import { describe, expect, it } from "bun:test";
import {
  generateKeyString,
  generateMocoCredential,
  generatePasswordZip,
  generateWebAttestationPayload,
} from "../core/drm";

describe("DRM Core Algorithms", () => {
  it("should generate consistent PBKDF2 passwords", () => {
    const userId = "user-123";
    const bookId = "book-456";
    const epustakaId = "epub-789";

    // Run twice to ensure determinism
    const output1 = generateKeyString(userId, bookId, epustakaId);
    const output2 = generateKeyString(userId, bookId, epustakaId);

    expect(output1).toBe(output2);
    expect(output1.length).toBeGreaterThan(10);
  });

  it("should generate encrypted moco credential", () => {
    const payload = JSON.stringify({ test: "data" });
    const credential = generateMocoCredential(payload);

    // Should be a hex string
    expect(credential).toMatch(/^[0-9a-f]+$/);

    // Encrypted length should be significant (base64 -> hex)
    expect(credential.length).toBeGreaterThan(50);
  });

  it("should generate web attestation payload", () => {
    const nonce = "nonce-123";
    const deviceId = "device-456";
    const payload: any = generateWebAttestationPayload(nonce, deviceId);

    expect(payload.nonce).toBe(nonce);
    expect(payload.device_info.device_id).toBe(deviceId);
    expect(payload.platform).toBe("web");
  });

  it("should generate zip password from dummy decrypted key", () => {
    // Dummy decrypted key (needs to be somewhat long to match typical usage, but hash doesn't care)
    const dummyKey = "decrypted-key-content-example";
    const zipPass = generatePasswordZip(dummyKey);

    // Implementation slices output to be 178 chars
    expect(zipPass.length).toBe(178);
  });
});
