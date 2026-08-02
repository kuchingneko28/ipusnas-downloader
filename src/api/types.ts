/**
 * iPusnas API Types
 */

export interface AttestResponse {
  success?: boolean;
  access_token?: string;
  refresh_token?: string;
  device_id?: string;
  message?: string;
  data?: AttestResponse;
}

export interface LoginData {
  access_token: string;
  refresh_token?: string;
  email?: string;
  name?: string;
  id: string;
  organizations?: { id: string; name: string };
}

export interface LoginResponse {
  success: boolean;
  data?: LoginData;
  message?: string;
}

export interface NonceResponse {
  nonce: string;
  expires_in?: number;
}

export interface Book {
  id: string;
  book_title: string;
  author_name: string;
  cover_url: string;
}

export interface BookDetail {
  catalog_info?: { organization_id?: string };
}

export interface ShelfItem {
  id: string;
  book_id: string;
  book_title: string;
  book_author?: string;
  borrow_end_date?: string;
  epustaka_id?: string;
  organization_id?: string;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  organizations?: { id: string; name: string };
}

export interface Epustaka {
  id: string;
  organization_id: string;
}

export interface AccessData {
  payload?: string;
  url_file?: string;
  file_url?: string;
  borrow_id?: string;
  id?: string;
  password?: string;
}

export interface BorrowPayload {
  book_id: string;
  user_id: string;
  epustaka_id: string;
  organization_id: string;
  school_id: string;
  ts: number;
}

