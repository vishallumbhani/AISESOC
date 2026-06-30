/**
 * pages/_app.tsx
 * AI-SecOS — Application entry point
 *
 * Org pages → AppShell (light sidebar)
 * Platform pages → PlatformShell (handles its own layout)
 * Login/root → full-page, no shell
 */
import React from "react";
import type { AppProps } from "next/app";
import { useRouter } from "next/router";
import AppShell from "../components/AppShell";
import "../styles/globals.css";

// Inline error boundary — no external dep
class Boundary extends React.Component<
  { children: React.ReactNode },
  { err: Error | null }
> {
  state = { err: null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(e: Error, i: React.ErrorInfo) {
    console.error("[AI-SecOS error]", e.message, i.componentStack?.slice(0, 300));
  }
  render() {
    const { err } = this.state;
    if (err) return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center",
        justifyContent: "center", background: "#F8FAFC",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
      }}>
        <div style={{
          background: "#fff", border: "1px solid #E5E7EB",
          borderRadius: 14, padding: "2rem 2.5rem",
          maxWidth: "26rem", width: "100%", textAlign: "center",
          boxShadow: "0 4px 24px rgba(0,0,0,.08)",
        }}>
          <div style={{
            width: 48, height: 48, background: "#FEF2F2",
            borderRadius: 12, display: "flex",
            alignItems: "center", justifyContent: "center",
            margin: "0 auto 1rem", fontSize: 22,
          }}>⚠️</div>
          <h2 style={{ color: "#111827", fontWeight: 700, fontSize: "1.1rem", margin: "0 0 .5rem" }}>
            Something went wrong
          </h2>
          <p style={{ color: "#6B7280", fontSize: ".875rem", margin: "0 0 1.25rem" }}>
            {err.message}
          </p>
          <button
            onClick={() => { this.setState({ err: null }); window.location.href = "/dashboard"; }}
            style={{
              background: "#2563EB", color: "#fff", border: "none",
              borderRadius: 8, padding: "8px 20px",
              fontWeight: 600, fontSize: ".875rem", cursor: "pointer",
            }}>
            Return to Dashboard
          </button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

const FULL_PAGE = ["/", "/login", "/platform/login"];

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const isPlatform = router.pathname.startsWith("/platform");
  const isFullPage = FULL_PAGE.includes(router.pathname);

  if (isPlatform || isFullPage) {
    return <Boundary><Component {...pageProps} /></Boundary>;
  }

  return (
    <Boundary>
      <AppShell>
        <Component {...pageProps} />
      </AppShell>
    </Boundary>
  );
}
