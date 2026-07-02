/**
 * components/AppShell.tsx
 * AI-SecOS — Oracle Cloud Design Language
 *
 * Exactly matches Oracle Cloud Infrastructure layout:
 * - Black top navbar (Oracle branded)
 * - White left sidebar (flat links, no icons on section headers)
 * - Light grey page background
 * - Clean breadcrumb trail under page title
 */
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { clearOrgSession, getOrgToken } from "../lib/tokens";
import {
  FiGrid, FiCpu, FiDatabase, FiShield, FiPlay,
  FiZap, FiAlertTriangle, FiGitMerge, FiBarChart2,
  FiList, FiUsers, FiSettings, FiLogOut, FiChevronDown,
  FiActivity, FiCheckSquare, FiKey, FiSearch, FiBell, FiHelpCircle,
  FiUser, FiMenu, FiX,
} from "react-icons/fi";

const NAV = [
  {
    section: "Overview",
    items: [
      { label: "Dashboard",      href: "/dashboard",        icon: FiGrid },
    ],
  },
  {
    section: "AI Governance",
    items: [
      { label: "Agents",         href: "/agents",           icon: FiCpu },
      { label: "Assets",         href: "/assets",           icon: FiDatabase },
      { label: "Policies",       href: "/policies",         icon: FiShield },
      { label: "Policy Simulator", href: "/policy-simulator", icon: FiPlay },
    ],
  },
  {
    section: "Security Operations",
    items: [
      { label: "Runtime",        href: "/runtime",          icon: FiZap },
      { label: "Incidents",      href: "/incidents",        icon: FiAlertTriangle },
      { label: "Audit Logs",     href: "/audit-logs",       icon: FiList },
      { label: "Graph Explorer", href: "/graph",            icon: FiGitMerge },
    ],
  },
  {
    section: "Risk & Compliance",
    items: [
      { label: "Risk Timeline",  href: "/risk-timeline",   icon: FiActivity },
      { label: "Reports",        href: "/reports",          icon: FiBarChart2 },
      { label: "API & Connectors", href: "/enterprise",     icon: FiKey },
    ],
  },
  {
    section: "Administration",
    items: [
      { label: "Users",          href: "/users",            icon: FiUsers },
      { label: "Settings",       href: "/settings",         icon: FiSettings },
    ],
  },
];

interface Props { children: React.ReactNode; }

export default function AppShell({ children }: Props) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const logout = () => { clearOrgSession(); router.push("/login"); };

  const isActive = (href: string) =>
    router.pathname === href ||
    (href !== "/dashboard" && router.pathname.startsWith(href));

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#F5F5F5" }}>

      {/* ══ TOP NAVBAR — Oracle black bar ═══════════════════════ */}
      <header style={{
        height: 48,
        background: "#1A1A1A",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        flexShrink: 0,
        zIndex: 100,
        position: "sticky",
        top: 0,
        gap: 0,
      }}>
        {/* Hamburger */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            color: "#FFFFFF", background: "none", border: "none",
            cursor: "pointer", padding: "6px 8px", marginRight: 8,
            display: "flex", alignItems: "center",
          }}
        >
          {sidebarOpen ? <FiX size={18} /> : <FiMenu size={18} />}
        </button>

        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 24 }}>
          {/* Oracle-style logo mark */}
          <div style={{
            width: 28, height: 28,
            background: "#C74634",
            borderRadius: 4,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <FiShield size={14} color="#fff" />
          </div>
          <span style={{ fontSize: 14, fontWeight: 700, color: "#FFFFFF", letterSpacing: "-0.2px" }}>
            AI-SecOS
          </span>
          <span style={{
            fontSize: 10, fontWeight: 500, color: "#909090",
            borderLeft: "1px solid #444", paddingLeft: 8, marginLeft: 4,
          }}>
            Enterprise Security
          </span>
        </div>

        {/* Search bar — centered like Oracle */}
        <div style={{ flex: 1, maxWidth: 480, margin: "0 auto" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "#333333", border: "1px solid #444",
            borderRadius: 4, padding: "5px 10px",
          }}>
            <FiSearch size={13} color="#909090" />
            <input
              placeholder="Search resources, agents, policies, incidents..."
              style={{
                background: "none", border: "none", outline: "none",
                color: "#CCCCCC", fontSize: 12, width: "100%",
              }}
            />
          </div>
        </div>

        {/* Right icons */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 16 }}>
          {[
            { icon: FiBell,       title: "Notifications" },
            { icon: FiHelpCircle, title: "Help" },
          ].map(({ icon: Icon, title }) => (
            <button key={title} title={title} style={{
              background: "none", border: "none", cursor: "pointer",
              color: "#CCCCCC", padding: 7, display: "flex", alignItems: "center",
              borderRadius: 3,
            }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#333"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
            >
              <Icon size={16} />
            </button>
          ))}

          {/* Profile */}
          <button style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "none", border: "none", cursor: "pointer",
            color: "#CCCCCC", padding: "4px 8px", borderRadius: 3,
            marginLeft: 4,
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#333"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "none"}
          >
            <div style={{
              width: 24, height: 24, borderRadius: "50%",
              background: "#555", display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <FiUser size={12} color="#CCC" />
            </div>
            <span style={{ fontSize: 12, color: "#CCCCCC" }}>Admin</span>
            <FiChevronDown size={11} color="#909090" />
          </button>
        </div>
      </header>

      {/* ══ BODY: sidebar + main ════════════════════════════════ */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── LEFT SIDEBAR — Oracle white sidebar ──────────────── */}
        {sidebarOpen && (
          <aside style={{
            width: 236,
            background: "#FFFFFF",
            borderRight: "1px solid #E8E8E8",
            display: "flex",
            flexDirection: "column",
            flexShrink: 0,
            overflowY: "auto",
            position: "sticky",
            top: 48,
            height: "calc(100vh - 48px)",
          }}>

            <nav style={{ flex: 1, padding: "12px 0" }}>
              {NAV.map((group, gi) => (
                <div key={gi}>
                  {/* Section heading — Oracle style: plain uppercase */}
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#767676",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    padding: "10px 16px 4px",
                    marginTop: gi === 0 ? 0 : 8,
                  }}>
                    {group.section}
                  </div>

                  {group.items.map((item) => {
                    const active = isActive(item.href);
                    const Icon = item.icon;
                    return (
                      <Link key={item.href} href={item.href} style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 16px",
                        fontSize: 13,
                        fontWeight: active ? 600 : 400,
                        color: active ? "#0572CE" : "#333333",
                        background: active ? "#F0F8FF" : "transparent",
                        borderLeft: active ? "3px solid #0572CE" : "3px solid transparent",
                        textDecoration: "none",
                        transition: "background 0.1s",
                      }}
                        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "#F5F5F5"; }}
                        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                      >
                        <Icon size={14} style={{ flexShrink: 0, color: active ? "#0572CE" : "#595959" }} />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </nav>

            {/* Footer */}
            <div style={{ borderTop: "1px solid #E8E8E8", padding: "8px 0" }}>
              <button onClick={logout} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 16px", width: "100%",
                fontSize: 13, color: "#595959",
                background: "none", border: "none",
                cursor: "pointer", textAlign: "left",
                borderLeft: "3px solid transparent",
                transition: "background 0.1s",
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#F5F5F5"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <FiLogOut size={14} style={{ color: "#595959", flexShrink: 0 }} />
                Sign Out
              </button>
            </div>
          </aside>
        )}

        {/* ── MAIN CONTENT AREA ────────────────────────────────── */}
        <main style={{
          flex: 1,
          minWidth: 0,
          background: "#F5F5F5",
          overflowY: "auto",
          minHeight: "calc(100vh - 48px)",
        }}>
          <div style={{ padding: "24px 28px 40px", maxWidth: 1600 }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
