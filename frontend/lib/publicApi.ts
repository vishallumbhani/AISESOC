/**
 * lib/publicApi.ts
 *
 * Unauthenticated API client for login and registration.
 * NEVER attaches any token.
 * Used by: /login, /platform/login, /register flows.
 */
import axios from "axios";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const publicApi = axios.create({
  baseURL: `${BASE}/api/v1`,
  headers: { "Content-Type": "application/json" },
  timeout: 15000,
});

export default publicApi;
