/**
 * pages/_app.tsx
 * AI-SecOS Enterprise — Application Shell
 *
 * Route rules:
 *   /platform/*              → PlatformShell  (dark, platform admin only)
 *   /login, /platform/login  → full-page, no shell (white background)
 *   /                        → index / redirect
 *   everything else          → AppShell (light enterprise sidebar)
 *
 * Body class "ds-light" activates light theme CSS overrides on all pages.
 */
import React, { useEffect } from "react";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import AppShell from "../components/AppShell";
import "../styles/globals.css";

// Inline ErrorBoundary (no external dependency)
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[AI-SecOS]", error, info.componentStack?.slice(0, 400));
  }
  render() {
    if (this.state.error) {
      const err = this.state.error as Error;
      return (
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center",
          justifyContent: "center", fontFamily: "Inter, sans-serif",
          background: "#f1f5f9",
        }}>
          <div style={{
            background: "#fff", border: "1px solid #e2e8f0",
            borderRadius: "0.75rem", padding: "2rem", maxWidth: "26rem",
            textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,.08)",
          }}>
            <div style={{
              width: "3rem", height: "3rem", background: "#fef2f2",
              borderRadius: "0.75rem", display: "flex", alignItems: "center",
              justifyContent: "center", margin: "0 auto 1rem",
            }}>⚠️</div>
            <h2 style={{ color: "#0f172a", marginBottom: "0.5rem", fontWeight: 700, fontSize: "1.1rem" }}>
              Something went wrong
            </h2>
            <p style={{ color: "#64748b", fontSize: "0.875rem", marginBottom: "1.25rem" }}>
              {err.message}
            </p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.href = "/dashboard"; }}
              style={{
                background: "#2563eb", color: "#fff", border: "none",
                padding: "0.5rem 1.25rem", borderRadius: "0.5rem",
                cursor: "pointer", fontWeight: 600, fontSize: "0.875rem",
              }}>
              Return to Dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Routes that get NO shell (full-page)
const FULL_PAGE = ["/", "/login", "/platform/login"];

function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  // Ensure body has the ds-light class for CSS variable overrides
  useEffect(() => {
    document.body.classList.add("ds-light");
    document.documentElement.style.setProperty("color-scheme", "light");
  }, []);

  const isPlatform = router.pathname.startsWith("/platform");
  const isFullPage = FULL_PAGE.includes(router.pathname);

  // Platform portal: has its own shell (PlatformShell), no AppShell
  if (isPlatform || isFullPage) {
    return (
      <ErrorBoundary>
        <Component {...pageProps} />
      </ErrorBoundary>
    );
  }

  // Org portal: AppShell sidebar + light theme
  return (
    <ErrorBoundary>
      <AppShell>
        <Component {...pageProps} />
      </AppShell>
    </ErrorBoundary>
  );
}

export default App;
