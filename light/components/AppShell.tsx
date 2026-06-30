/**
 * components/AppShell.tsx
 * AI-SecOS Enterprise Sidebar Layout
 *
 * Light theme: white sidebar, slate page background.
 * Grouped navigation by business function.
 * Collapsible on desktop, drawer on mobile.
 * Platform-only items are never shown to org users.
 */
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { clearOrgSession, getOrgToken } from "../lib/tokens";
import {
  LayoutDashboard, Cpu, Database, Link2, Shield, Zap, PlayCircle,
  TriangleAlert, GitMerge, TrendingUp, BarChart2, ClipboardList,
  Users, Settings, Key, LogOut, Menu, X, ChevronLeft, ChevronRight,
  FileText, Activity,
} from "lucide-react";

// ── Navigation structure ───────────────────────────────────────
const NAV = [
  {
    group: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    group: "AI Inventory",
    items: [
      { label: "Agents",     href: "/agents",     icon: Cpu },
      { label: "Assets",     href: "/assets",     icon: Database },
      { label: "Connectors", href: "/enterprise", icon: Link2 },
      { label: "API Keys",   href: "/enterprise", icon: Key, suffix: "#api-keys" },
    ],
  },
  {
    group: "Security",
    items: [
      { label: "Policies",   href: "/policies",        icon: Shield },
      { label: "Simulator",  href: "/policy-simulator",icon: PlayCircle },
      { label: "Runtime",    href: "/runtime",         icon: Zap },
      { label: "Incidents",  href: "/incidents",       icon: TriangleAlert },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { label: "Graph",      href: "/graph",        icon: GitMerge },
      { label: "Risk",       href: "/risk-timeline",icon: TrendingUp },
    ],
  },
  {
    group: "Compliance",
    items: [
      { label: "Reports",    href: "/reports",    icon: BarChart2 },
      { label: "Audit Logs", href: "/audit-logs", icon: ClipboardList },
    ],
  },
  {
    group: "Administration",
    items: [
      { label: "Users",    href: "/users",    icon: Users },
      { label: "Settings", href: "/settings", icon: Settings },
    ],
  },
];

// ── Component ──────────────────────────────────────────────────
const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const [collapsed, setCollapsed]   = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [orgName, setOrgName]       = useState("Organization");

  useEffect(() => {
    // Collapse mobile menu on route change
    setMobileOpen(false);
  }, [router.pathname]);

  useEffect(() => {
    // Load org name from token (best-effort)
    try {
      const token = getOrgToken();
      if (token) {
        const payload = JSON.parse(atob(token.split(".")[1]));
        // org name not in JWT usually, but try
        if (payload.org_name) setOrgName(payload.org_name);
      }
    } catch {}
  }, []);

  const logout = () => { clearOrgSession(); router.push("/login"); };

  const isActive = (href: string) => {
    if (href === "/dashboard") return router.pathname === "/dashboard";
    if (href === "/enterprise") return router.pathname === "/enterprise";
    return router.pathname.startsWith(href);
  };

  const NavItem = ({ item }: { item: { label: string; href: string; icon: any; suffix?: string } }) => {
    const Icon   = item.icon;
    const active = isActive(item.href);
    return (
      <Link href={item.href + (item.suffix || "")}
        title={collapsed ? item.label : undefined}
        className={`ds-nav-item ${active ? "active" : ""} ${collapsed ? "justify-center px-2" : ""}`}>
        <Icon size={15} className={`flex-shrink-0 ${active ? "text-blue-600" : "text-slate-400"}`} />
        {!collapsed && <span className="truncate text-sm">{item.label}</span>}
      </Link>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Logo */}
      <div className={`flex items-center h-16 border-b border-slate-200 flex-shrink-0 ${collapsed ? "justify-center px-3" : "px-4 gap-3"}`}>
        <div className="w-8 h-8 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
          <Shield size={16} className="text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-bold text-slate-900 text-sm leading-none truncate">AI-SecOS</p>
            <p className="text-[10px] text-slate-400 mt-0.5 truncate">{orgName}</p>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {NAV.map(group => (
          <div key={group.group}>
            {!collapsed && (
              <p className="ds-nav-group-label">{group.group}</p>
            )}
            {collapsed && <div className="border-t border-slate-100 my-1.5" />}
            <div className="space-y-0.5">
              {group.items.map(item => <NavItem key={item.label} item={item} />)}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="flex-shrink-0 border-t border-slate-200 p-2 space-y-0.5">
        {/* Collapse toggle (desktop only) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={`ds-nav-item w-full hidden lg:flex ${collapsed ? "justify-center px-2" : ""}`}
          title={collapsed ? "Expand" : "Collapse sidebar"}>
          {collapsed
            ? <ChevronRight size={15} className="text-slate-400" />
            : <><ChevronLeft size={15} className="text-slate-400" /><span className="text-sm">Collapse</span></>}
        </button>
        {/* Sign out */}
        <button
          onClick={logout}
          className={`ds-nav-item w-full text-slate-500 hover:bg-red-50 hover:text-red-600 ${collapsed ? "justify-center px-2" : ""}`}
          title={collapsed ? "Sign Out" : undefined}>
          <LogOut size={15} className="flex-shrink-0" />
          {!collapsed && <span className="text-sm">Sign Out</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--ds-page-bg)" }}>
      {/* ── Desktop sidebar ────────────────────────────────────── */}
      <aside
        className="hidden lg:flex flex-col flex-shrink-0 transition-all duration-200 border-r border-slate-200"
        style={{
          width: collapsed ? "3.5rem" : "13rem",
          background: "var(--ds-sidebar-bg)",
        }}>
        <SidebarContent />
      </aside>

      {/* ── Mobile drawer ──────────────────────────────────────── */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-slate-900/40 z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className="fixed left-0 top-0 bottom-0 z-50 flex flex-col lg:hidden border-r border-slate-200 ds-slide-in"
            style={{ width: "13rem", background: "var(--ds-sidebar-bg)" }}>
            <SidebarContent />
          </aside>
        </>
      )}

      {/* ── Main content area ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <header
          className="lg:hidden flex items-center h-14 border-b border-slate-200 px-4 gap-3 flex-shrink-0"
          style={{ background: "var(--ds-topbar-bg)" }}>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            {mobileOpen
              ? <X size={20} className="text-slate-600" />
              : <Menu size={20} className="text-slate-600" />}
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded-lg flex items-center justify-center">
              <Shield size={13} className="text-white" />
            </div>
            <span className="font-bold text-slate-900 text-sm">AI-SecOS</span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto" style={{ background: "var(--ds-page-bg)" }}>
          {children}
        </main>
      </div>
    </div>
  );
};

export default AppShell;
