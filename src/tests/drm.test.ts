import { createCipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { describe, expect, it } from 'bun:test';
import {
  decryptDrmPassword,
  decryptJwe,
  decryptReencryptedPassword,
  encryptPp2Borrow,
  generateP256KeyPair,
  popHeaders,
  signPayloadEcdsa,
} from '../core/crypto';

describe('PP2 JWE', () => {
  it('round-trips encrypt/decrypt', () => {
    const jwt = 'test-jwt';
    const payload = {
      book_id: 'abc',
      user_id: 'user1',
      epustaka_id: 'epub1',
      organization_id: 'org1',
      school_id: '',
      ts: 1234567890,
    };

    const encrypted = encryptPp2Borrow(payload, jwt);
    expect(encrypted.startsWith('PP2.')).toBe(true);

    const decrypted = decryptJwe<typeof payload>(encrypted, jwt);
    expect(decrypted.book_id).toBe('abc');
    expect(decrypted.ts).toBe(1234567890);
  });

  it('fails with wrong JWT', () => {
    const encrypted = encryptPp2Borrow(
      { book_id: 'x', user_id: 'u', epustaka_id: 'e', organization_id: 'o', school_id: '', ts: 0 },
      'correct',
    );
    expect(() => decryptJwe<Record<string, unknown>>(encrypted, 'wrong')).toThrow();
  });
});

describe('Reencrypted Password', () => {
  it('returns empty for empty input', () => {
    expect(decryptReencryptedPassword('key', '')).toBe('');
  });

  it('round-trips an encrypted password', () => {
    const tempKey = randomBytes(32).toString('base64url');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(tempKey, 'base64url'), nonce);
    const ct = Buffer.concat([cipher.update('my-pw', 'utf8'), cipher.final()]);
    const encrypted = Buffer.concat([nonce, ct, cipher.getAuthTag()]).toString('base64url');

    expect(decryptReencryptedPassword(tempKey, encrypted)).toBe('my-pw');
  });
});

describe('decryptDrmPassword', () => {
  // Build a PP2 envelope the same way src/core/crypto.ts does (scrypt key from
  // the JWT, AES-256-GCM with the pp2 AAD) so the real download path is tested.
  function pp2Envelope(payload: Record<string, string>, jwt: string): string {
    const salt = randomBytes(16);
    const key = scryptSync(createHash('sha256').update(jwt).digest(), salt, 32, { N: 16384, r: 8, p: 1 });
    const aad = Buffer.from(
      `payloadprotectv2-context:1:${createHash('sha256').update(jwt).digest('hex').slice(0, 24)}`,
    );
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(aad);
    const ct = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
    const envelope = {
      v: '1',
      alg: 'AES-256-GCM+SCRYPT',
      s: salt.toString('base64url'),
      n: nonce.toString('base64url'),
      c: Buffer.concat([ct, cipher.getAuthTag()]).toString('base64url'),
    };
    return 'PP2.' + Buffer.from(JSON.stringify(envelope)).toString('base64url');
  }

  function reencrypt(tempKey: string, plain: string): string {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', Buffer.from(tempKey, 'base64url'), nonce);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([nonce, ct, cipher.getAuthTag()]).toString('base64url');
  }

  it('decrypts a PP2 payload into URL and passwords', () => {
    const tempKey = randomBytes(32).toString('base64url');
    const payload = {
      temporary_key: tempKey,
      reencrypted_zip_password: reencrypt(tempKey, 'zip-secret'),
      reencrypted_pdf_password: reencrypt(tempKey, 'pdf-secret'),
      file_url: 'https://cdn/book.zip',
    };

    const result = decryptDrmPassword({ payload: pp2Envelope(payload, 'jwt') }, 'jwt');
    expect(result.urlFile).toBe('https://cdn/book.zip');
    expect(result.zipPassword).toBe('zip-secret');
    expect(result.pdfPassword).toBe('pdf-secret');
  });

  it('falls back to the raw password for non-PP2 payloads', () => {
    const result = decryptDrmPassword({ password: 'raw-pw', url_file: 'https://cdn/x.zip' }, 'jwt');
    expect(result).toEqual({ urlFile: 'https://cdn/x.zip', zipPassword: 'raw-pw', pdfPassword: 'raw-pw' });
  });
});

describe('ECDSA P-256 PoP', () => {
  it('generates valid keypair', () => {
    const { privatePem, publicJwk } = generateP256KeyPair();
    expect(privatePem).toContain('BEGIN PRIVATE KEY');
    expect(publicJwk.kty).toBe('EC');
    expect(publicJwk.crv).toBe('P-256');
    expect(publicJwk.x.length).toBeGreaterThan(0);
  });

  it('signs to base64url', () => {
    const { privatePem } = generateP256KeyPair();
    const signature = signPayloadEcdsa(privatePem, 'test');
    expect(signature).not.toMatch(/[+/=]/);
    expect(signature.length).toBeGreaterThan(0);
  });

  it('builds valid PoP headers', () => {
    const { privatePem, publicJwk } = generateP256KeyPair();
    const headers = popHeaders(privatePem, publicJwk, 'POST', '/trust/api/access', Buffer.from('body'));

    expect(headers['X-Device-Public-Key']).toBe(JSON.stringify(publicJwk));
    expect(headers['X-Body-SHA256']).toMatch(/^[0-9a-f]{64}$/);
    expect(headers['X-Timestamp']).toMatch(/^\d+$/);
    expect(headers['X-Nonce']).toMatch(/^[0-9a-f]{16}$/);
    expect(headers['X-Signature-JTI']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
