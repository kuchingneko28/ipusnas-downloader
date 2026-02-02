import { USER_AGENT, generateMocoCredential } from "../core/drm";
import { getSession } from "../core/session";
import { attestDevice } from "./auth";

const API_BASE = "https://api2-ipusnas.perpusnas.go.id/api";
const AGENT_BASE = "https://api2-ipusnas.perpusnas.go.id/agent";

const URLS = {
  SEARCH: `${API_BASE}/webhook/search-book`,
  BOOK_DETAIL: `${API_BASE}/webhook/book-detail`,
  EPUSTAKA: `${API_BASE}/webhook/epustaka-borrow`,
  BORROW_ACCESS: `${AGENT_BASE}/api/access`, // New Algo Endpoint
  RETURN: `${API_BASE}/webhook/book-return`,
  BORROW_SHELF: `${API_BASE}/webhook/book-borrow-shelf`,
};

export interface Book {
  id: string; // Real API returns UUID
  book_title: string;
  author_name: string;
  cover_url: string;
  [key: string]: any;
}

export interface SearchResult {
  success: boolean;
  data: Book[];
  total?: number;
  meta?: any;
}

const BASE_HEADERS = {
  Origin: "https://ipusnas2.perpusnas.go.id",
  Referer: "https://ipusnas2.perpusnas.go.id/",
  "User-Agent": USER_AGENT,
  "Content-Type": "application/vnd.api+json",
  Accept: "application/json, text/plain, */*",
};

import { logger } from "../cli/ui";
import { loginUser } from "./auth";

/**
 * Helper to get User Token
 */
async function getUserToken(): Promise<string> {
  let session = getSession();

  // Auto-login if session missing but env vars exist
  if (!session?.userToken && process.env.IPUSNAS_EMAIL && process.env.IPUSNAS_PASSWORD) {
    await loginUser();
    session = getSession();
  }

  if (!session || !session.userToken) {
    throw new Error("User not logged in. Run 'ipusnas login' or set IPUSNAS_EMAIL/PASSWORD.");
  }
  return session.userToken;
}

/**
 * Smart Fetch Wrapper for User Token endpoints
 * Handles:
 * 1. Token retrieval
 * 2. Logging (Verbose)
 * 3. Auto-Refresh (401 -> Login -> Retry)
 */
async function fetchWithUserAuth(url: string, options: RequestInit = {}): Promise<Response> {
  let token = await getUserToken();

  // MERGE HEADERS properly
  const headers = {
    ...BASE_HEADERS,
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  } as any;

  const method = options.method || "GET";
  logger.debug(`[API] ${method} ${url}`);

  let res = await fetch(url, { ...options, headers });

  // Handle Expiration
  if (res.status === 401 || res.status === 403) {
    logger.debug(`[API] ${res.status} Unauthorized. Checking for auto-recovery...`);

    // Check if we can auto-login
    if (process.env.IPUSNAS_EMAIL && process.env.IPUSNAS_PASSWORD) {
      logger.info("Session expired. Auto-refreshing...");
      try {
        await loginUser();
        token = await getUserToken();

        // Retry with new token
        headers.Authorization = `Bearer ${token}`;
        logger.debug(`[API] RETRY ${method} ${url}`);
        res = await fetch(url, { ...options, headers });
      } catch (e: any) {
        logger.error(`Auto-refresh failed: ${e.message}`);
        throw new Error("Session expired and auto-login failed.");
      }
    } else {
      throw new Error("Session expired. Please login again.");
    }
  }

  return res;
}

export async function searchBooks(query: string, offset = 0): Promise<Book[]> {
  const url = `${URLS.SEARCH}?q=${encodeURIComponent(query)}&limit=25&offset=${offset}`;
  const res = await fetchWithUserAuth(url);
  const json = (await res.json()) as SearchResult;
  return json.data || [];
}

export async function getBookDetail(bookId: string): Promise<any> {
  const res = await fetchWithUserAuth(`${URLS.BOOK_DETAIL}?book_id=${bookId}`);
  const json: any = await res.json();
  return json.data || json;
}

async function getEpustaka(bookId: string): Promise<any> {
  const res = await fetchWithUserAuth(`${URLS.EPUSTAKA}?book_id=${bookId}`);
  const json: any = await res.json();
  const list = json.data || json;
  return Array.isArray(list) ? list[0] : list;
}

export async function borrowBook(bookId: string): Promise<any> {
  const session = getSession();
  if (!session || !session.user) throw new Error("User not logged in");
  const userId = session.user.id; // User ID from login data

  // 1. Get Details for Borrow Params
  const [detail, epustaka] = await Promise.all([getBookDetail(bookId), getEpustaka(bookId)]);

  if (!epustaka) throw new Error("No copy available for this book (Epustaka not found)");

  const orgId =
    detail.catalog_info?.organization_id || epustaka.organization_id || "1fe99d3c-b272-40cd-8d9c-a4871f4eaef2";

  // 2. Prepare Payload for Encryption
  const payloadData = {
    epustaka_id: epustaka.id,
    user_id: userId,
    book_id: bookId,
    organization_id: orgId,
    ts: Date.now(),
  };

  // 3. Encrypt Credential
  const credential = generateMocoCredential(JSON.stringify(payloadData));

  // 4. Get Device Token (Attest)
  const deviceToken = await attestDevice();

  // 5. Send Borrow Request
  logger.debug(`[API] POST ${URLS.BORROW_ACCESS} (Device Token)`);

  let res = await fetch(URLS.BORROW_ACCESS, {
    method: "POST",
    headers: {
      ...BASE_HEADERS,
      Authorization: `Bearer ${deviceToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ credential }),
  });

  // Handle Device Token Expiration (401)
  if (res.status === 401) {
    logger.debug("[API] Device Token Expired (401). Refreshing...");
    const newDeviceToken = await attestDevice(true);

    logger.debug(`[API] RETRY POST ${URLS.BORROW_ACCESS}`);
    res = await fetch(URLS.BORROW_ACCESS, {
      method: "POST",
      headers: {
        ...BASE_HEADERS,
        Authorization: `Bearer ${newDeviceToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ credential }),
    });
  }

  const json: any = await res.json();

  if (json.error || json.success === false) {
    throw new Error("Borrow failed: " + (json.message || JSON.stringify(json)));
  }

  return json;
}

export async function returnBook(borrowBookId: string): Promise<any> {
  const res = await fetchWithUserAuth(URLS.RETURN, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ borrow_book_id: borrowBookId }),
  });
  return await res.json();
}

export async function getDownloadInfo(bookId: string): Promise<any> {
  const url = `${URLS.BORROW_SHELF.replace("book-borrow-shelf", "check-borrow-status")}?book_id=${bookId}`;
  const res = await fetchWithUserAuth(url);
  const json: any = await res.json();
  return json.data || json;
}

export async function listShelf(): Promise<any[]> {
  const res = await fetchWithUserAuth(URLS.BORROW_SHELF);
  const json: any = await res.json();
  return json.data || [];
}
