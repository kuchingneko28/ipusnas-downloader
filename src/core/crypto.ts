/**
 * iPusnas DRM — PP2 JWE + ECDSA P-256 PoP
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  generateKeyPairSync,
  randomBytes,
  scryptSync,
  sign as cryptoSign,
} from 'node:crypto';
import type { AccessData, BorrowPayload } from '../api/types';
import { logger } from '../cli/ui';

export interface JwkPublicKey {
  kty: string;
  crv: string;
  x: string;
  y: string;
}

interface JweEnvelope {
  v?: string;
  alg: string;
  s: string;
  n: string;
  c: string;
}

interface Pp2Payload {
  temporary_key: string;
  reencrypted_pdf_password: string;
  reencrypted_zip_password: string;
  password?: string;
  file_url: string;
}

interface DrmResult {
  urlFile: string;
  zipPassword: string;
  pdfPassword: string;
}

interface P256KeyPair {
  privatePem: string;
  publicJwk: JwkPublicKey;
}

export interface PopHeaders {
  'X-Device-Public-Key': string;
  'X-Body-SHA256': string;
  'X-Timestamp': string;
  'X-Nonce': string;
  'X-Signature-JTI': string;
  'X-Device-Signature': string;
  'User-Agent': string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;

// ─── PP2 Internals ───────────────────────────────────────────────────────────

function pp2Aad(jwt: string): Buffer {
  const hex = createHash('sha256').update(jwt).digest('hex').slice(0, 24);
  return Buffer.from(`payloadprotectv2-context:1:${hex}`);
}

function pp2DeriveKey(jwt: string, salt: Buffer): Buffer {
  const hash = createHash('sha256').update(jwt).digest();
  return scryptSync(hash, salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
}

// ─── PP2 JWE Decrypt ─────────────────────────────────────────────────────────

export function decryptJwe<T>(encryptedPayload: string, jwt: string): T {
  const input = encryptedPayload.startsWith('PP2.') ? encryptedPayload.slice(4) : encryptedPayload;
  const jwe: JweEnvelope = JSON.parse(Buffer.from(input, 'base64url').toString());

  const salt = Buffer.from(jwe.s, 'base64url');
  const nonce = Buffer.from(jwe.n, 'base64url');
  const enc = Buffer.from(jwe.c, 'base64url');
  const ct = enc.subarray(0, enc.length - 16);
  const tag = enc.subarray(enc.length - 16);

  const decipher = createDecipheriv('aes-256-gcm', pp2DeriveKey(jwt, salt), nonce);
  decipher.setAuthTag(tag);
  decipher.setAAD(pp2Aad(jwt));

  return JSON.parse(Buffer.concat([decipher.update(ct), decipher.final()]).toString()) as T;
}

export function decryptReencryptedPassword(tempKeyB64: string, encB64: string): string {
  if (!encB64) return '';
  const encrypted = Buffer.from(encB64, 'base64url');
  const nonce = encrypted.subarray(0, 12);
  const ct = encrypted.subarray(12, encrypted.length - 16);
  const tag = encrypted.subarray(encrypted.length - 16);

  const decipher = createDecipheriv('aes-256-gcm', Buffer.from(tempKeyB64, 'base64url'), nonce);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString();
}

export function decryptDrmPassword(accessData: AccessData, jwt: string): DrmResult {
  const drmPayload = accessData.payload || accessData.password || '';
  let urlFile = accessData.url_file || accessData.file_url || '';

  if (drmPayload.startsWith('PP2.') || drmPayload.startsWith('{') || drmPayload.startsWith('eyJ')) {
    logger.debug('[CRYPTO] decrypting PP2 JWE payload');
    const decrypted = decryptJwe<Pp2Payload>(drmPayload, jwt);
    urlFile = decrypted.file_url || urlFile;
    logger.debug(`[CRYPTO] url_file=${urlFile.slice(0, 60)}...`);

    const tempKey = decrypted.temporary_key || '';
    let zipPassword = decryptReencryptedPassword(tempKey, decrypted.reencrypted_zip_password || '');
    let pdfPassword = decryptReencryptedPassword(tempKey, decrypted.reencrypted_pdf_password || '');

    if (!zipPassword) zipPassword = decryptReencryptedPassword(tempKey, decrypted.password || '');
    if (!pdfPassword) pdfPassword = zipPassword;

    logger.debug(
      `[CRYPTO] zipPassword=${zipPassword ? 'ok' : 'missing'} pdfPassword=${pdfPassword ? 'ok' : 'missing'}`,
    );
    return { urlFile, zipPassword, pdfPassword };
  }

  logger.debug('[CRYPTO] payload is not PP2 — using raw password');
  return { urlFile, zipPassword: drmPayload, pdfPassword: drmPayload };
}

// ─── PP2 JWE Encrypt ─────────────────────────────────────────────────────────

export function encryptPp2Borrow(payload: BorrowPayload, jwt: string): string {
  const plaintext = Buffer.from(JSON.stringify(payload));
  const salt = randomBytes(16);
  const nonce = randomBytes(12);

  const cipher = createCipheriv('aes-256-gcm', pp2DeriveKey(jwt, salt), nonce);
  cipher.setAAD(pp2Aad(jwt));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const jwe: JweEnvelope = {
    v: '1',
    alg: 'AES-256-GCM+SCRYPT',
    s: salt.toString('base64url'),
    n: nonce.toString('base64url'),
    c: Buffer.concat([ct, tag]).toString('base64url'),
  };

  return 'PP2.' + Buffer.from(JSON.stringify(jwe)).toString('base64url');
}

// ─── ECDSA P-256 PoP ─────────────────────────────────────────────────────────

export function generateP256KeyPair(): P256KeyPair {
  logger.debug('[CRYPTO] generating P-256 key pair');
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    publicJwk: { kty: jwk.kty!, crv: jwk.crv!, x: jwk.x!, y: jwk.y! },
  };
}

export function signPayloadEcdsa(privatePem: string, payload: string): string {
  return cryptoSign('SHA256', Buffer.from(payload), privatePem).toString('base64url');
}

export function popHeaders(
  privatePem: string,
  publicJwk: JwkPublicKey,
  method: string,
  path: string,
  body: Buffer = Buffer.alloc(0),
): PopHeaders {
  const bodySha = createHash('sha256').update(body).digest('hex');
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(8).toString('hex');
  const jti = crypto.randomUUID();
  const sig = signPayloadEcdsa(privatePem, `${method.toUpperCase()}\n${path}\n${bodySha}\n${ts}\n${nonce}\n${jti}`);

  return {
    'X-Device-Public-Key': JSON.stringify(publicJwk),
    'X-Body-SHA256': bodySha,
    'X-Timestamp': ts,
    'X-Nonce': nonce,
    'X-Signature-JTI': jti,
    'X-Device-Signature': sig,
    'User-Agent': 'okhttp/5.3.2',
  };
}
