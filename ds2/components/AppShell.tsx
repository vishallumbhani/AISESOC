/**
 * components/AppShell.tsx
 * AI-SecOS Enterprise Sidebar — Production Quality
 *
 * Design targets: Microsoft Defender, Datadog, Palo Alto Cortex
 * - Clean white sidebar, no thick outlines
 * - Soft blue active state (no box borders)
 * - Properly spaced group labels
 * - Collapse + Sign Out separated from nav
 * - Lucide icons, consistent 16px size
 */
import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { clearOrgSession } from "../lib/tokens";
import {
  LayoutDashboard, Bot, Database, Link2, ShieldCheck,
  PlayCircle, Zap, TriangleAlert, GitMerge, TrendingUp,
  BarChart3, ClipboardList, Users, Settings, Key,
  LogOut, Menu, X, ChevronLeft, ChevronRight,
  Activity, FileCheck2,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────
interface NavItem {
  label: string;
  href:  string;
  icon:  React.ElementType;
}
interface NavGroup {
  label:   string;
  emoji:   string;
  items:   NavItem[];
}

// ── Navigation structure ───────────────────────────────────────
const NAV_GROUPS: NavGroup[] = [
  {
    label: "AI Governance",
    emoji: "🛡",
    items: [
      { label: "Agents",           href: "/agents",          icon: Bot },
      { label: "Assets",           href: "/assets",          icon: Database },
      { label: "Policies",         href: "/policies",        icon: ShieldCheck },
      { label: "Policy Simulator", href: "/policy-simulator",icon: PlayCircle },
    ],
  },
  {
    label: "Security Operations",
    emoji: "🚨",
    items: [
      { label: "Runtime",    href: "/runtime",    icon: Zap },
      { label: "Incidents",  href: "/incidents",  icon: TriangleAlert },
      { label: "Audit Logs", href: "/audit-logs", icon: ClipboardList },
      { label: "Graph",      href: "/graph",      icon: GitMerge },
    ],
  },
  {
    label: "Risk & Compliance",
    emoji: "📈",
    items: [
      { label: "Risk",     href: "/risk-timeline", icon: TrendingUp },
      { label: "Reports",  href: "/reports",       icon: BarChart3 },
      { label: "Audit",    href: "/audit-logs",    icon: FileCheck2 },
    ],
  },
  {
    label: "Integrations",
    emoji: "🔌",
    items: [
      { label: "Connectors", href: "/enterprise",   icon: Link2 },
      { label: "API Keys",   href: "/enterprise",   icon: Key },
    ],
  },
  {
    label: "Administration",
    emoji: "⚙",
    items: [
      { label: "Users",    href: "/users",    icon: Users },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

// ── AppShell ───────────────────────────────────────────────────
const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [collapsed, setCollapsed]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile on route change
  useEffect(() => { setMobileOpen(false); }, [router.pathname]);

  const logout = useCallback(() => { clearOrgSession(); router.push("/login"); }, []);

  const isActive = (href: string): boolean => {
    if (href === "/dashboard")  return router.pathname === "/dashboard";
    if (href === "/enterprise") return router.pathname === "/enterprise";
    return router.pathname === href || router.pathname.startsWith(href + "/");
  };

  // ── Single nav item ──────────────────────────────────────────
  const NavItem: React.FC<{ item: NavItem }> = ({ item }) => {
    const Icon   = item.icon;
    const active = isActive(item.href);
    return (
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        className={[
          "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-100 no-underline group",
          collapsed ? "justify-center" : "",
          active
            ? "bg-blue-50 text-blue-700 font-semibold"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium",
        ].join(" ")}
        style={{ fontSize: "0.8125rem" }}
      >
        <Icon
          size={15}
          strokeWidth={active ? 2.5 : 2}
          className={[
            "flex-shrink-0 transition-colors",
            active ? "text-blue-600" : "text-slate-400 group-hover:text-slate-600",
          ].join(" ")}
        />
        {!collapsed && <span className="truncate leading-none">{item.label}</span>}
        {!collapsed && active && (
          <span className="ml-auto w-1 h-1 rounded-full bg-blue-500 flex-shrink-0" />
        )}
      </Link>
    );
  };

  // ── Sidebar inner content ────────────────────────────────────
  const SidebarInner: React.FC = () => (
    <div className="flex flex-col h-full">

      {/* Logo */}
      <div
        className={[
          "flex items-center h-[60px] border-b border-slate-100 flex-shrink-0",
          collapsed ? "justify-center px-3" : "px-4 gap-3",
        ].join(" ")}
      >
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <ShieldCheck size={16} className="text-white" strokeWidth={2.5} />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-bold text-slate-900 leading-none" style={{ fontSize: "0.9rem" }}>
              AI-SecOS
            </p>
            <p className="text-slate-400 mt-0.5 truncate" style={{ fontSize: "0.7rem" }}>
              Enterprise Security
            </p>
          </div>
        )}
      </div>

      {/* Dashboard link — pinned above groups */}
      <div className="px-3 pt-4 pb-2">
        <Link
          href="/dashboard"
          title={collapsed ? "Dashboard" : undefined}
          className={[
            "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-100 no-underline",
            collapsed ? "justify-center" : "",
            isActive("/dashboard")
              ? "bg-blue-50 text-blue-700 font-semibold"
              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium",
          ].join(" ")}
          style={{ fontSize: "0.8125rem" }}
        >
          <LayoutDashboard
            size={15}
            strokeWidth={isActive("/dashboard") ? 2.5 : 2}
            className={isActive("/dashboard") ? "text-blue-600" : "text-slate-400"}
          />
          {!collapsed && <span className="leading-none">Dashboard</span>}
          {!collapsed && isActive("/dashboard") && (
            <span className="ml-auto w-1 h-1 rounded-full bg-blue-500" />
          )}
        </Link>
      </div>

      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 pb-2 space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {!collapsed ? (
              <p
                className="text-slate-400 font-semibold uppercase tracking-widest mb-2 px-3 select-none"
                style={{ fontSize: "0.625rem", letterSpacing: "0.1em" }}
              >
                {group.label}
              </p>
            ) : (
              <div className="border-t border-slate-100 my-2" />
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem key={item.label + item.href} item={item} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer — separated from nav */}
      <div className="flex-shrink-0 border-t border-slate-100 px-3 py-3 space-y-0.5">
        {/* Collapse (desktop only) */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={[
            "hidden lg:flex items-center gap-2.5 w-full px-3 py-2 rounded-lg",
            "text-slate-400 hover:bg-slate-50 hover:text-slate-600",
            "transition-all duration-100",
            collapsed ? "justify-center" : "",
          ].join(" ")}
          style={{ fontSize: "0.8125rem" }}
          title={collapsed ? "Expand" : "Collapse sidebar"}
        >
          {collapsed
            ? <ChevronRight size={15} />
            : <><ChevronLeft size={15} /><span className="font-medium">Collapse</span></>
          }
        </button>

        {/* Sign out */}
        <button
          onClick={logout}
          className={[
            "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg",
            "text-slate-400 hover:bg-red-50 hover:text-red-600",
            "transition-all duration-100",
            collapsed ? "justify-center" : "",
          ].join(" ")}
          style={{ fontSize: "0.8125rem" }}
          title={collapsed ? "Sign Out" : undefined}
        >
          <LogOut size={15} className="flex-shrink-0" />
          {!collapsed && <span className="font-medium">Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#F8FAFC" }}>

      {/* ── Desktop sidebar ──────────────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col flex-shrink-0 border-r border-slate-200 transition-all duration-200"
        style={{
          width:      collapsed ? "3.5rem" : "13.5rem",
          background: "#ffffff",
          boxShadow:  "1px 0 0 0 #e2e8f0",
        }}
      >
        <SidebarInner />
      </aside>

      {/* ── Mobile drawer ────────────────────────────────────── */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 lg:hidden"
            style={{ background: "rgba(15,23,42,0.4)" }}
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="fixed left-0 top-0 bottom-0 z-50 flex flex-col border-r border-slate-200 lg:hidden"
            style={{ width: "13.5rem", background: "#ffffff" }}
          >
            <SidebarInner />
          </aside>
        </>
      )}

      {/* ── Page area ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile topbar */}
        <header
          className="lg:hidden flex items-center h-[60px] border-b border-slate-200 px-4 gap-3 flex-shrink-0"
          style={{ background: "#ffffff" }}
        >
          <button
            onClick={() => setMobileOpen((o) => !o)}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors text-slate-600"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="w-6 h-6 bg-blue-600 rounded-md flex items-center justify-center">
            <ShieldCheck size={13} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-slate-900 text-sm">AI-SecOS</span>
        </header>

        {/* Page content */}
        <main
          className="flex-1 overflow-y-auto"
          style={{ background: "#F8FAFC" }}
        >
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppShell;
