/**
 * components/PlatformShell.tsx
 *
 * Layout for all /platform/* pages.
 * Auth guard: reads platform_access_token ONLY.
 * Never reads or writes organization_access_token.
 * 401/403 → /platform/login.
 */
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  FiShield, FiGrid, FiGlobe, FiDollarSign, FiShoppingBag,
  FiAlertCircle, FiLayout, FiLink, FiActivity, FiClipboard,
  FiSettings, FiLogOut, FiMenu, FiX, FiCpu, FiKey,
} from "react-icons/fi";
import clsx from "clsx";
import {
  hasPlatformToken, clearPlatformSession,
  getImpersonatingOrg, stopImpersonation,
} from "../lib/tokens";

interface NavItem { label: string; href: string; icon: React.ReactNode; }
interface NavGroup { label: string; items: NavItem[]; }

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { label: "Dashboard",      href: "/platform/dashboard",     icon: <FiGrid /> },
      { label: "Organizations",  href: "/platform/organizations", icon: <FiGlobe /> },
      { label: "Health",         href: "/platform/health",        icon: <FiActivity /> },
    ],
  },
  {
    label: "Business",
    items: [
      { label: "Licensing",      href: "/platform/licensing",     icon: <FiDollarSign /> },
      { label: "Billing",        href: "/platform/billing",       icon: <FiDollarSign /> },
      { label: "Marketplace",    href: "/platform/marketplace",   icon: <FiShoppingBag /> },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { label: "Threat Intel",   href: "/platform/threat-intel",  icon: <FiAlertCircle /> },
      { label: "Templates",      href: "/platform/templates",     icon: <FiLayout /> },
    ],
  },
  {
    label: "Infrastructure",
    items: [
      { label: "Connectors",     href: "/platform/connectors",    icon: <FiLink /> },
      { label: "API Gateway",    href: "/platform/api-gateway",   icon: <FiKey /> },
      { label: "Platform Audit", href: "/platform/audit",         icon: <FiClipboard /> },
      { label: "Settings",       href: "/platform/settings",      icon: <FiSettings /> },
    ],
  },
];

interface Props { children: React.ReactNode; }

const PlatformShell: React.FC<Props> = ({ children }) => {
  const router        = useRouter();
  const [ready, setReady]       = useState(false);
  const [mobileOpen, setMobile] = useState(false);
  const [impOrg, setImpOrg]     = useState<string | null>(null);

  useEffect(() => {
    // Auth guard: platform token only
    if (!hasPlatformToken()) {
      router.push("/platform/login");
      return;
    }
    setImpOrg(getImpersonatingOrg());
    setReady(true);
  }, []);

  const handleStopImpersonation = () => {
    stopImpersonation();
    setImpOrg(null);
    router.push("/platform/dashboard");
  };

  const handleSignOut = () => {
    clearPlatformSession();
    router.push("/platform/login");
  };

  const isActive = (href: string) => router.pathname === href;

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* ── Top bar ─────────────────────────────────────────── */}
      <header className="bg-gray-950 border-b border-gray-800 sticky top-0 z-50 h-13">
        <div className="flex items-center h-full px-4 gap-3">
          <Link href="/platform/dashboard" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <FiShield className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-sm">AI-SecOS</span>
            <span className="ml-1 text-xs bg-red-900/70 text-red-300 border border-red-700/60 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
              Platform
            </span>
          </Link>

          {/* Impersonation banner */}
          {impOrg && (
            <div className="flex items-center gap-2 bg-yellow-900/30 border border-yellow-700/50 text-yellow-300 text-xs px-3 py-1.5 rounded-full ml-2">
              <FiCpu className="w-3 h-3" />
              Viewing as <strong>{impOrg}</strong>
              <button onClick={handleStopImpersonation}
                className="ml-1 underline hover:text-white text-xs">
                Stop
              </button>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden md:block text-xs text-gray-600">Platform Administration Portal</span>
            <button onClick={handleSignOut}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-all">
              <FiLogOut className="w-3.5 h-3.5" /> Sign Out
            </button>
            <button onClick={() => setMobile(!mobileOpen)}
              className="lg:hidden p-2 text-gray-400 hover:text-white">
              {mobileOpen ? <FiX className="w-5 h-5" /> : <FiMenu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar desktop ─────────────────────────────── */}
        <aside className="hidden lg:flex flex-col w-52 bg-gray-950 border-r border-gray-800 pt-4 pb-6 flex-shrink-0 overflow-y-auto">
          {NAV_GROUPS.map(group => (
            <div key={group.label} className="mb-5">
              <p className="px-4 mb-1 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                {group.label}
              </p>
              {group.items.map(item => (
                <Link key={item.href} href={item.href}
                  className={clsx(
                    "flex items-center gap-2.5 mx-2 px-3 py-2 text-sm rounded-lg transition-all",
                    isActive(item.href)
                      ? "bg-indigo-600 text-white"
                      : "text-gray-400 hover:text-white hover:bg-gray-800"
                  )}>
                  <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}
        </aside>

        {/* ── Mobile sidebar ──────────────────────────────── */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex">
            <div className="w-60 bg-gray-950 border-r border-gray-800 pt-4 pb-6 overflow-y-auto">
              {NAV_GROUPS.map(group => (
                <div key={group.label} className="mb-5">
                  <p className="px-4 mb-1 text-xs font-semibold text-gray-600 uppercase tracking-wider">{group.label}</p>
                  {group.items.map(item => (
                    <Link key={item.href} href={item.href}
                      onClick={() => setMobile(false)}
                      className={clsx(
                        "flex items-center gap-2.5 mx-2 px-3 py-2 text-sm rounded-lg transition-all",
                        isActive(item.href) ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800"
                      )}>
                      <span>{item.icon}</span>{item.label}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
            <div className="flex-1 bg-black/50" onClick={() => setMobile(false)} />
          </div>
        )}

        {/* ── Main content ─────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto bg-gray-950">
          {children}
        </main>
      </div>
    </div>
  );
};

export default PlatformShell;
