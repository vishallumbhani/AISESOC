/**
 * lib/orgApi.ts
 *
 * API client for the Organization Portal.
 * ONLY reads organization_access_token.
 * NEVER reads platform_access_token.
 * 401 → redirect to /login (org portal).
 */
import axios, { AxiosInstance } from "axios";
import { getOrgToken, clearOrgSession } from "./tokens";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const orgApi: AxiosInstance = axios.create({
  baseURL: `${BASE}/api/v1`,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

// ── Request: attach org token ──────────────────────────────────
orgApi.interceptors.request.use(
  config => {
    const token = getOrgToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error),
);

// ── Response: handle 401 → org login ──────────────────────────
orgApi.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      clearOrgSession();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

export default orgApi;
