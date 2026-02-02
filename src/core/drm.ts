/**
 * iPusnas DRM - Decryption Implementation
 * Ported from ipusnas-algorithm-new/index.js
 */

import { createCipheriv, createDecipheriv, createHash, pbkdf2Sync, randomBytes } from "node:crypto";

/**
 * Generate the PBKDF2 password (KeyString) from user/book IDs
 */
export function generateKeyString(userId: string, bookId: string, epustakaId: string): string {
  // Concatenate in specific order: bookId + epustakaId + userId
  const base = bookId + epustakaId + userId;

  // SHA512 hash
  const hash = createHash("sha512").update(base).digest("hex");

  // Extract slices: [3:14] and [73:118]
  const p1 = hash.slice(3, 14); // 11 characters
  const p2 = hash.slice(73, 118); // 45 characters

  // Remove hyphens from base
  const baseStripped = base.replace(/-/g, "");

  // Combine: p1 + baseStripped + p2
  return p1 + baseStripped + p2;
}

/**
 * Decrypt the borrowKey to get the intermediate plaintext
 */
export function decryptBorrowKey(userId: string, bookId: string, epustakaId: string, borrowKey: string): string {
  // 1. Generate PBKDF2 password
  const password = generateKeyString(userId, bookId, epustakaId);

  // 2. Decode borrowKey from Base64
  const decoded = Buffer.from(borrowKey, "base64");

  // 3. Extract components (87 bytes total)
  // Layout: [Salt 16] [Nonce 16] [Tag 16] [Ciphertext 39]
  const salt = decoded.subarray(0, 16);
  const nonce = decoded.subarray(16, 32);
  const tag = decoded.subarray(32, 48);
  const ciphertext = decoded.subarray(48, 87);

  // 4. Derive AES-256 key using PBKDF2
  const aesKey = pbkdf2Sync(password, salt, 200000, 32, "sha256");

  // 5. Decrypt using AES-256-GCM
  const decipher = createDecipheriv("aes-256-gcm", aesKey, nonce);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf-8");
}

/**
 * Generate ZIP password from decrypted plaintext
 */
export function generatePasswordZip(decryptedKey: string): string {
  // BLAKE2s-256 hash
  const blake2s = createHash("blake2s256").update(decryptedKey, "utf-8").digest("hex");

  // SHA512 hash
  const sha512 = createHash("sha512").update(decryptedKey, "utf-8").digest("hex");

  // Combine: blake2s (64 chars) + sha512 (128 chars) = 192 chars
  const combined = blake2s + sha512;

  // Extract slice [14:192] = 178 characters
  return combined.slice(14, 192);
}

/**
 * Generate PDF password from decrypted plaintext
 */
export function generatePasswordPDF(decryptedKey: string): string {
  const sha384 = createHash("sha384").update(decryptedKey, "utf8").digest("hex");
  const blake2b = createHash("blake2b512").update(decryptedKey, "utf8").digest("hex");

  // Formula: SHA384[23:] + BLAKE2b512[:47]
  return sha384.slice(23) + blake2b.slice(0, 47);
}

/**
 * Complete workflow: Get ZIP password from borrowKey
 */
export function getZipPassword(userId: string, bookId: string, epustakaId: string, borrowKey: string): string {
  const decrypted = decryptBorrowKey(userId, bookId, epustakaId, borrowKey);
  return generatePasswordZip(decrypted);
}

/**
 * Complete workflow: Get PDF password from borrowKey
 */
export function getPdfPassword(userId: string, bookId: string, epustakaId: string, borrowKey: string): string {
  const decrypted = decryptBorrowKey(userId, bookId, epustakaId, borrowKey);
  return generatePasswordPDF(decrypted);
}

/**
 * Generate Moco Credential for Borrow API
 */
export function generateMocoCredential(payload: string): string {
  // 1. Static Key and IV (AES-128)
  const key = Buffer.from("65303331396563393435636466646539", "hex");
  const iv = Buffer.from("5770dc8ac73d54b85a979fc790b5b46e", "hex");

  // 2. Padding (Prefix)
  // The app prepends exactly 32 bytes of random padding to randomize the ciphertext.
  const paddingPrefix = randomBytes(32);
  const payloadBuffer = Buffer.from(payload, "utf8");

  // Combine Prefix + JSON
  const dataParams = Buffer.concat([paddingPrefix, payloadBuffer]);

  // 3. PKCS#7 Padding (Suffix)
  // Pad the data to 16-byte block boundary.
  const blockSize = 16;
  const paddingAmount = blockSize - (dataParams.length % blockSize);
  const paddingSuffix = Buffer.alloc(paddingAmount, paddingAmount);

  const dataToEncrypt = Buffer.concat([dataParams, paddingSuffix]);

  // 4. Encrypt using AES-128-CFB with Static IV
  const cipher = createCipheriv("aes-128-cfb", key, iv);
  const encrypted = Buffer.concat([cipher.update(dataToEncrypt), cipher.final()]);

  // 5. Encode: Hex(Base64(Encrypted))
  const base64 = encrypted.toString("base64");
  return Buffer.from(base64, "utf-8").toString("hex");
}

/**
 * Generate the JSON payload for the /agent/api/attest endpoint (Web Platform)
 */
export const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36 Edg/143.0.0.0";

export function generateWebAttestationPayload(nonce: string, deviceId: string): object {
  const userAgent = USER_AGENT;

  return {
    platform: "web",
    nonce: nonce,
    attestation_data: {
      method: "fingerprint",
      fingerprint: {
        user_agent: userAgent,
        screen_resolution: "1084x1066",
        timezone: "Asia/Makassar",
        language: "en-US",
        platform: "Linux x86_64",
        hardware_concurrency: 4,
        device_memory: 8,
        color_depth: 30,
        pixel_ratio: 2,
      },
    },
    device_info: {
      device_id: deviceId,
      user_agent: userAgent,
    },
  };
}
