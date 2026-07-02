/**
 * components/AppShell.tsx
 * AI-SecOS Enterprise Layout — RC2 Fixed
 *
 * Layout: CSS Grid with fixed sidebar column.
 * The sidebar NEVER overlaps content — grid handles separation.
 *
 * Grid:
 *   [sidebar 220px] [main 1fr]
 *
 * Sidebar: position sticky, full viewport height.
 * Main: scrolls independently.
 */
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { clearOrgSession } from "../lib/tokens";
import {
  FiGrid, FiCpu, FiDatabase, FiShield, FiPlay,
  FiZap, FiAlertTriangle, FiGitMerge, FiBarChart2,
  FiList, FiUsers, FiSettings, FiLogOut, FiChevronRight,
  FiActivity, FiCheckSquare, FiKey, FiLink,
} from "react-icons/fi";

const SIDEBAR_W = 220;

const NAV = [
  {
    section: null,
    items: [
      { label: "Dashboard",   href: "/dashboard",         icon: FiGrid },
    ],
  },
  {
    section: "Inventory",
    items: [
      { label: "Agents",      href: "/agents",            icon: FiCpu },
      { label: "Assets",      href: "/assets",            icon: FiDatabase },
      { label: "Connectors",  href: "/enterprise",        icon: FiLink },
    ],
  },
  {
    section: "Security",
    items: [
      { label: "Policies",    href: "/policies",          icon: FiShield },
      { label: "Runtime",     href: "/runtime",           icon: FiZap },
      { label: "Incidents",   href: "/incidents",         icon: FiAlertTriangle },
      { label: "Simulator",   href: "/policy-simulator",  icon: FiPlay },
    ],
  },
  {
    section: "Governance",
    items: [
      { label: "Compliance",  href: "/reports",           icon: FiCheckSquare },
      { label: "Reports",     href: "/reports",           icon: FiBarChart2 },
      { label: "Audit Logs",  href: "/audit-logs",        icon: FiList },
    ],
  },
  {
    section: "Investigation",
    items: [
      { label: "Graph",       href: "/graph",             icon: FiGitMerge },
      { label: "Risk",        href: "/risk-timeline",     icon: FiActivity },
    ],
  },
  {
    section: "Administration",
    items: [
      { label: "Users",       href: "/users",             icon: FiUsers },
      { label: "Settings",    href: "/settings",          icon: FiSettings },
    ],
  },
];

interface Props {
  children: React.ReactNode;
}

export default function AppShell({ children }: Props) {
  const router = useRouter();

  const logout = () => {
    clearOrgSession();
    router.push("/login");
  };

  const active = (href: string) =>
    router.pathname === href ||
    (href !== "/dashboard" && router.pathname.startsWith(href));

  return (
    /**
     * ROOT: CSS Grid — sidebar fixed width, main fills rest.
     * This is the ONLY place sidebar width is set.
     * No page-level margins needed.
     */
    <div style={{
      display: "grid",
      gridTemplateColumns: `${SIDEBAR_W}px 1fr`,
      minHeight: "100vh",
    }}>

      {/* ── SIDEBAR ─────────────────────────────────────────
          position: sticky + top:0 + height:100vh means it
          sticks to viewport while main scrolls.
          It NEVER overlaps main — the grid column handles separation.
      ────────────────────────────────────────────────────── */}
      <aside style={{
        position: "sticky",
        top: 0,
        height: "100vh",
        background: "#0F172A",
        borderRight: "1px solid #1E293B",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        zIndex: 40,
        flexShrink: 0,
      }}>

        {/* Logo */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "18px 16px 16px",
          borderBottom: "1px solid #1E293B",
          flexShrink: 0,
        }}>
          <div style={{
            width: 32, height: 32,
            background: "#2563EB",
            borderRadius: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <FiShield size={16} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#F1F5F9", letterSpacing: "-0.3px" }}>
              AI-SecOS
            </div>
            <div style={{ fontSize: 10, color: "#3B82F6", fontWeight: 500, letterSpacing: "0.2px" }}>
              Enterprise Security
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "8px 0" }}>
          {NAV.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 4 }}>
              {group.section && (
                <div style={{
                  fontSize: 10, fontWeight: 700, color: "#334155",
                  textTransform: "uppercase", letterSpacing: "0.8px",
                  padding: "10px 16px 4px",
                }}>
                  {group.section}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = active(item.href);
                return (
                  <Link
                    key={item.href + item.label}
                    href={item.href}
                    style={{
                      display: "flex", alignItems: "center", gap: 9,
                      padding: "7px 12px 7px 14px",
                      margin: "1px 8px",
                      borderRadius: 7,
                      fontSize: 13,
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? "#F1F5F9" : "#64748B",
                      background: isActive ? "#1E3A5F" : "transparent",
                      textDecoration: "none",
                      transition: "all 0.1s",
                      borderLeft: isActive ? "2px solid #3B82F6" : "2px solid transparent",
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = "#1E293B";
                        (e.currentTarget as HTMLElement).style.color = "#CBD5E1";
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                        (e.currentTarget as HTMLElement).style.color = "#64748B";
                      }
                    }}
                  >
                    <Icon size={14} style={{ flexShrink: 0, color: isActive ? "#3B82F6" : "currentColor" }} />
                    <span style={{ flex: 1 }}>{item.label}</span>
                    {isActive && <FiChevronRight size={11} style={{ color: "#3B82F6", opacity: 0.6 }} />}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #1E293B", padding: "8px", flexShrink: 0 }}>
          <button
            onClick={logout}
            style={{
              display: "flex", alignItems: "center", gap: 9,
              padding: "7px 14px", margin: "1px 0",
              borderRadius: 7, width: "100%",
              fontSize: 13, fontWeight: 400, color: "#64748B",
              background: "none", border: "none",
              cursor: "pointer", transition: "all 0.1s",
              textAlign: "left",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = "#1E293B";
              (e.currentTarget as HTMLElement).style.color = "#CBD5E1";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.color = "#64748B";
            }}
          >
            <FiLogOut size={14} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── MAIN ────────────────────────────────────────────
          Occupies the second grid column (1fr = all remaining width).
          Content scrolls here. Sidebar never touches this.
      ────────────────────────────────────────────────────── */}
      <main style={{
        minHeight: "100vh",
        background: "#F8FAFC",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minWidth: 0,  /* prevents grid blowout */
      }}>
        {children}
      </main>

    </div>
  );
}
