/**
 * iPusnas API Client — PP2-only
 */

import { encryptPp2Borrow, popHeaders, type PopHeaders } from '../core/crypto';
import { getSession, saveSession } from '../core/config';
import { attestDevice, loginUser, BASE, HEADERS } from './auth';
import { logger } from '../cli/ui';
import type { AccessData, Book, BookDetail, Epustaka, LoginData, Profile, ShelfItem } from './types';

// ─── Endpoints ───────────────────────────────────────────────────────────────

// Fallback organization used when neither the book detail nor the epustaka
// record carries one.
const DEFAULT_ORG_ID = '1fe99d3c-b272-40cd-8d9c-a4871f4eaef2';

const EP = {
  SEARCH: `${BASE}/api/webhook/search-book`,
  BOOK_DETAIL: `${BASE}/api/webhook/book-detail`,
  EPUSTAKA: `${BASE}/api/webhook/epustaka-borrow`,
  PROFILE: `${BASE}/api/webhook/profile`,
  ACCESS: '/trust/api/access',
  SECURE_KEY: '/trust/api/secure_borrowkey',
  RETURN: `${BASE}/api/webhook/return-book`,
  SHELF: `${BASE}/api/webhook/book-borrow-shelf`,
  REFRESH_TOKEN: `${BASE}/api/auth/refresh-token`,
} as const;

// ─── Fetch Helpers ───────────────────────────────────────────────────────────

async function refreshUserToken(): Promise<string> {
  const session = getSession();
  const refreshToken = session?.user?.refresh_token;
  if (!refreshToken) throw new Error('No user refresh token available.');

  logger.debug('[API] POST /api/auth/refresh-token');
  const response = await fetch(EP.REFRESH_TOKEN, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  if (!response.ok) throw new Error(`Token refresh failed: ${response.status}`);

  const responseBody = (await response.json()) as { data: LoginData } | { access_token: string };
  const loginData = 'data' in responseBody ? responseBody.data : responseBody;
  const newToken = loginData.access_token;

  const updated = { ...session, userToken: newToken, user: { ...session.user, ...loginData } as LoginData };
  saveSession(updated);
  return newToken;
}

async function reLogin(): Promise<string> {
  // Try refresh first
  try {
    return await refreshUserToken();
  } catch {
    // Fall back to full login
  }
  const session = getSession();
  const email = session?.email || process.env.IPUSNAS_EMAIL;
  const password = session?.password || process.env.IPUSNAS_PASSWORD;
  if (!email || !password) throw new Error('No credentials to re-login (set IPUSNAS_EMAIL / IPUSNAS_PASSWORD)');
  await loginUser(email, password);
  return getSession()?.userToken || '';
}

async function getUserToken(): Promise<string> {
  const session = getSession();
  if (session?.userToken) return session.userToken;
  return reLogin();
}

async function apiGet<T>(url: string): Promise<T> {
  let token = await getUserToken();
  logger.debug(`[API] GET ${url}`);
  let response = await fetch(url, { headers: { ...HEADERS, Authorization: `Bearer ${token}` } });

  if (response.status === 401) {
    logger.debug('[API] Token expired. Re-logging in...');
    token = await reLogin();
    response = await fetch(url, { headers: { ...HEADERS, Authorization: `Bearer ${token}` } });
  }

  const responseJson = (await response.json()) as Record<string, unknown>;
  if (!response.ok) throw new Error(`API request failed: ${response.status} ${JSON.stringify(responseJson)}`);
  logger.debug(`[API] Response: ${JSON.stringify(responseJson).slice(0, 200)}`);
  return (responseJson.data ?? responseJson) as T;
}

/**
 * A rejected request must not be logged here: the command envelope
 * (runCommand) prints every error it catches exactly once, so logging in a
 * guard that propagates to it would double-print the message.
 */
async function trustPost<T>(path: string, body: Record<string, unknown>, deviceToken: string): Promise<T> {
  const userToken = await getUserToken();
  const session = getSession();
  if (!session?.privatePem || !session?.publicJwk) {
    throw new Error('No device PoP key registered — run `ipusnas register` first.');
  }
  const bodyString = JSON.stringify(body);
  const bodyBytes = Buffer.from(bodyString);

  function buildTrustHeaders(deviceToken: string, userToken: string, signed: PopHeaders): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${deviceToken}`,
      'X-User-Authorization': `Bearer ${userToken}`,
      ...signed,
    };
  }

  let headers = buildTrustHeaders(
    deviceToken,
    userToken,
    popHeaders(session.privatePem, session.publicJwk, 'POST', path, bodyBytes),
  );

  const url = `${BASE}${path}`;
  logger.debug(`[API] POST ${url}`);
  let response: Response;
  try {
    response = await fetch(url, { method: 'POST', headers, body: bodyString });
  } catch (error: unknown) {
    throw new Error(`Network error: ${(error as Error).message}`);
  }

  if (response.status === 401) {
    logger.debug('[API] 401 on trust endpoint. Refreshing device token...');
    const refreshed = await attestDevice(true);
    // attestDevice(true) only rotates the PoP keypair when the refresh path is
    // unavailable or fails — re-read the session and re-sign with the current keys.
    const newSession = getSession();
    if (!newSession?.privatePem || !newSession?.publicJwk) {
      throw new Error('Device re-attestation did not produce a PoP key.');
    }
    headers = buildTrustHeaders(
      refreshed,
      userToken,
      popHeaders(newSession.privatePem, newSession.publicJwk, 'POST', path, bodyBytes),
    );
    response = await fetch(url, { method: 'POST', headers, body: bodyString });
  }

  const responseJson = (await response.json()) as { data?: T; [key: string]: unknown };
  logger.debug(`[API] Response: ${JSON.stringify(responseJson).slice(0, 300)}`);
  if (!response.ok || responseJson.error || responseJson.success === false) {
    throw new Error(`API error: ${responseJson.message || JSON.stringify(responseJson)}`);
  }
  return (responseJson.data ?? responseJson) as T;
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

export async function searchBooks(query: string, limit = 25, offset = 0): Promise<Book[]> {
  return apiGet<Book[]>(`${EP.SEARCH}?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`);
}

export async function getBookDetail(bookId: string): Promise<BookDetail> {
  return apiGet<BookDetail>(`${EP.BOOK_DETAIL}?book_id=${bookId}`);
}

export async function getEpustaka(bookId: string): Promise<Epustaka> {
  const list = await apiGet<Epustaka[] | Epustaka>(`${EP.EPUSTAKA}?book_id=${bookId}`);
  return Array.isArray(list) ? list[0] : list;
}

export async function getProfile(): Promise<Profile> {
  return apiGet<Profile>(EP.PROFILE);
}

export async function listShelf(): Promise<ShelfItem[]> {
  return apiGet<ShelfItem[]>(`${EP.SHELF}?limit=50`);
}

// ─── Borrow ──────────────────────────────────────────────────────────────────

export async function borrowBook(bookId: string): Promise<void> {
  const session = getSession();
  if (!session?.user) throw new Error('User not logged in');

  const [detail, epustaka, profile] = await Promise.all([getBookDetail(bookId), getEpustaka(bookId), getProfile()]);

  if (!epustaka) throw new Error('No epustaka found for this book.');

  const deviceToken = await attestDevice();
  const orgId = String(
    detail.catalog_info?.organization_id || epustaka.organization_id || DEFAULT_ORG_ID,
  );

  const credential = encryptPp2Borrow(
    {
      book_id: bookId,
      user_id: profile.id,
      epustaka_id: epustaka.id,
      organization_id: orgId,
      school_id: '',
      ts: Math.floor(Date.now() / 1000),
    },
    deviceToken,
  );

  await trustPost(EP.ACCESS, { credential, device_id: session.deviceId }, deviceToken);
}

// ─── DRM Key ─────────────────────────────────────────────────────────────────

export async function getSecureBorrowKey(
  bookId: string,
  deviceToken: string,
  borrowId = '',
  epustakaId = '',
): Promise<AccessData> {
  return trustPost<AccessData>(
    EP.SECURE_KEY,
    {
      book_id: bookId,
      borrow_id: borrowId || bookId,
      device_id: getSession()?.deviceId || '',
      epustaka_id: epustakaId,
      type: 'borrow',
    },
    deviceToken,
  );
}

// ─── Return ──────────────────────────────────────────────────────────────────

export async function returnBook(borrowId: string): Promise<void> {
  const token = await getUserToken();
  const response = await fetch(EP.RETURN, {
    method: 'POST',
    headers: { ...HEADERS, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ borrow_id: borrowId }),
  });
  if (!response.ok)
    throw new Error(`Return failed (${response.status}): ${await response.text().catch(() => response.statusText)}`);
}
