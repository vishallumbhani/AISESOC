/**
 * components/OrgNavbar.tsx
 *
 * Organization Portal navigation only.
 * Uses organization_access_token.
 * NEVER shows platform admin links.
 * NEVER references platform token.
 */
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  FiHome, FiCpu, FiDatabase, FiShield, FiPlayCircle,
  FiZap, FiAlertTriangle, FiGitMerge, FiBarChart2,
  FiClipboard, FiUsers, FiSettings, FiLogOut,
  FiMenu, FiX,
} from "react-icons/fi";
import clsx from "clsx";
import { clearOrgSession } from "../lib/tokens";

const NAV_ITEMS = [
  { label: "Dashboard",  href: "/dashboard",        icon: <FiHome /> },
  { label: "Agents",     href: "/agents",           icon: <FiCpu /> },
  { label: "Assets",     href: "/assets",           icon: <FiDatabase /> },
  { label: "Policies",   href: "/policies",         icon: <FiShield /> },
  { label: "Simulator",  href: "/policy-simulator", icon: <FiPlayCircle /> },
  { label: "Runtime",    href: "/runtime",          icon: <FiZap /> },
  { label: "Incidents",  href: "/incidents",        icon: <FiAlertTriangle /> },
  { label: "Graph",      href: "/graph",            icon: <FiGitMerge /> },
  { label: "Reports",    href: "/reports",          icon: <FiBarChart2 /> },
  { label: "Audit Logs", href: "/audit-logs",       icon: <FiClipboard /> },
  { label: "Users",      href: "/users",            icon: <FiUsers /> },
  { label: "Settings",   href: "/settings",         icon: <FiSettings /> },
];

const OrgNavbar: React.FC = () => {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const logout = () => {
    clearOrgSession();
    router.push("/login");
  };

  const isActive = (href: string) =>
    router.pathname === href ||
    (href !== "/dashboard" && router.pathname.startsWith(href));

  return (
    <nav className="bg-gray-900 border-b border-gray-800 text-white sticky top-0 z-40">
      <div className="max-w-screen-xl mx-auto px-4">
        <div className="flex items-center h-14 gap-1">
          <Link href="/dashboard" className="flex items-center gap-2 mr-3 flex-shrink-0">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <FiShield className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-sm hidden sm:block">AI-SecOS</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden lg:flex items-center gap-0.5 flex-1 overflow-x-auto">
            {NAV_ITEMS.map(item => (
              <Link key={item.href} href={item.href}
                className={clsx(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all",
                  isActive(item.href)
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                )}>
                <span className="w-3.5 h-3.5 flex-shrink-0">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <button onClick={logout}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-all">
              <FiLogOut className="w-3.5 h-3.5" /> Logout
            </button>
            <button onClick={() => setOpen(!open)}
              className="lg:hidden p-2 text-gray-400 hover:text-white rounded-md">
              {open ? <FiX className="w-5 h-5" /> : <FiMenu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {open && (
          <div className="lg:hidden pb-3 pt-1 grid grid-cols-3 gap-1 border-t border-gray-800">
            {NAV_ITEMS.map(item => (
              <Link key={item.href} href={item.href}
                onClick={() => setOpen(false)}
                className={clsx(
                  "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all",
                  isActive(item.href)
                    ? "bg-indigo-600 text-white"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                )}>
                <span>{item.icon}</span>{item.label}
              </Link>
            ))}
            <button onClick={logout}
              className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-gray-800 rounded-md col-span-3">
              <FiLogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        )}
      </div>
    </nav>
  );
};

export default OrgNavbar;
