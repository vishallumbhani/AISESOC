/**
 * lib/tokens.ts
 *
 * Centralized token management. NEVER copy tokens between portals.
 *
 * Organization portal:  organization_access_token
 * Platform portal:      platform_access_token
 *
 * Each portal has its own isolated localStorage keys.
 * The old "token" key is only kept during migration — removed after login.
 */

const KEYS = {
  ORG:      "organization_access_token",
  PLATFORM: "platform_access_token",
} as const;

type Portal = "org" | "platform";

function isBrowser() { return typeof window !== "undefined"; }

// ── Store ──────────────────────────────────────────────────────

export function setOrgToken(token: string) {
  if (!isBrowser()) return;
  localStorage.setItem(KEYS.ORG, token);
  // Also write legacy "token" key so existing org pages (dashboard, agents, etc.)
  // that use localStorage.getItem("token") continue to work without modification.
  localStorage.setItem("token", token);
  localStorage.removeItem("platform_token");
}

export function setPlatformToken(token: string) {
  if (!isBrowser()) return;
  localStorage.setItem(KEYS.PLATFORM, token);
  // NEVER set "token" — that's the org key
  localStorage.removeItem("platform_token");  // remove legacy key
}

// ── Retrieve ───────────────────────────────────────────────────

export function getOrgToken(): string | null {
  if (!isBrowser()) return null;
  return (
    localStorage.getItem(KEYS.ORG) ||
    localStorage.getItem("token") ||  // legacy migration
    null
  );
}

export function getPlatformToken(): string | null {
  if (!isBrowser()) return null;
  return (
    localStorage.getItem(KEYS.PLATFORM) ||
    localStorage.getItem("platform_token") ||  // legacy migration
    null
  );
}

// ── Clear ──────────────────────────────────────────────────────

export function clearOrgSession() {
  if (!isBrowser()) return;
  localStorage.removeItem(KEYS.ORG);
  localStorage.removeItem("token");  // legacy
  localStorage.removeItem("impersonating_org");
  localStorage.removeItem("pre_impersonation_token");
}

export function clearPlatformSession() {
  if (!isBrowser()) return;
  localStorage.removeItem(KEYS.PLATFORM);
  localStorage.removeItem("platform_token");  // legacy
  localStorage.removeItem("impersonating_org");
  localStorage.removeItem("pre_impersonation_token");
}

export function clearAllSessions() {
  clearOrgSession();
  clearPlatformSession();
}

// ── Check ──────────────────────────────────────────────────────

export function hasOrgToken(): boolean {
  return !!getOrgToken();
}

export function hasPlatformToken(): boolean {
  return !!getPlatformToken();
}

// ── Decode JWT (no library) ────────────────────────────────────

export function decodeJwt(token: string): Record<string, any> {
  try {
    const b64 = token.split(".")[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded = b64.padEnd(b64.length + (4 - b64.length % 4) % 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

export function isTokenExpired(token: string): boolean {
  const { exp } = decodeJwt(token);
  if (!exp) return false;
  return Date.now() >= exp * 1000;
}

export function getTokenClaims(token: string) {
  const claims = decodeJwt(token);
  return {
    userId:         claims.sub as string | undefined,
    orgId:          claims.org as string | undefined,
    role:           claims.role as string | undefined,
    isPlatform:     claims.is_platform as boolean ?? false,
    impersonatedBy: claims.impersonated_by as string | undefined,
    exp:            claims.exp as number | undefined,
  };
}

// ── Impersonation ──────────────────────────────────────────────

export function startImpersonation(orgToken: string, orgName: string) {
  if (!isBrowser()) return;
  // Save current platform token so we can restore it
  const platformToken = getPlatformToken();
  if (platformToken) {
    localStorage.setItem("pre_impersonation_platform_token", platformToken);
  }
  localStorage.setItem("impersonating_org", orgName);
  // Set org token so org pages work
  localStorage.setItem(KEYS.ORG, orgToken);
}

export function stopImpersonation() {
  if (!isBrowser()) return;
  const savedPlatform = localStorage.getItem("pre_impersonation_platform_token");
  if (savedPlatform) {
    localStorage.setItem(KEYS.PLATFORM, savedPlatform);
    localStorage.removeItem("pre_impersonation_platform_token");
  }
  localStorage.removeItem(KEYS.ORG);
  localStorage.removeItem("impersonating_org");
}

export function getImpersonatingOrg(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem("impersonating_org");
}
