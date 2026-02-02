export interface AttestResponse {
  success?: boolean;
  access_token?: string;
  error?: string;
  status?: number;
  description?: string;
  message?: string;
}

export interface LoginResponse {
  success: boolean;
  data?: {
    access_token: string;
    refresh_token?: string;
    email?: string;
    name?: string;
    id?: number;
    [key: string]: unknown;
  };
  message?: string;
}

export interface NonceResponse {
  nonce: string;
  expires_in?: number;
  nonce_length?: number;
  algorithm?: string;
}
