/**
 * lib/platformApi.ts
 *
 * API client for the Platform Admin Portal.
 * ONLY reads platform_access_token.
 * NEVER reads organization_access_token.
 * 401 → redirect to /platform/login.
 */
import axios, { AxiosInstance } from "axios";
import { getPlatformToken, clearPlatformSession } from "./tokens";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const platformApi: AxiosInstance = axios.create({
  baseURL: `${BASE}/api/v1`,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

// ── Request: attach platform token ────────────────────────────
platformApi.interceptors.request.use(
  (config) => {
    const token = getPlatformToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ── Response: handle 401 → platform login ─────────────────────
platformApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      clearPlatformSession();
      window.location.href = "/platform/login";
    }
    return Promise.reject(error);
  },
);

export default platformApi;
