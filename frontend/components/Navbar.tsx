import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  FiHome, FiDatabase, FiShield, FiZap, FiLogOut,
  FiMenu, FiX, FiClipboard, FiActivity, FiGitMerge,
  FiAlertTriangle, FiPlayCircle, FiCpu, FiSettings,
} from "react-icons/fi";
import clsx from "clsx";

const Navbar: React.FC = () => {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);

  const handleLogout = () => {
    localStorage.removeItem("token");
    router.push("/login");
  };

  // Organization portal navigation only
  // Enterprise / Platform admin NEVER appears here
  const navItems = [
    { label: "Dashboard",  href: "/dashboard",        icon: FiHome },
    { label: "Agents",     href: "/agents",           icon: FiCpu },
    { label: "Assets",     href: "/assets",           icon: FiDatabase },
    { label: "Policies",   href: "/policies",         icon: FiShield },
    { label: "Simulator",  href: "/policy-simulator", icon: FiPlayCircle },
    { label: "Runtime",    href: "/runtime",          icon: FiZap },
    { label: "Incidents",  href: "/incidents",        icon: FiAlertTriangle },
    { label: "Graph",      href: "/graph",            icon: FiGitMerge },
    { label: "Audit Logs", href: "/audit-logs",       icon: FiClipboard },
    { label: "System",     href: "/system",           icon: FiActivity },
  ];

  return (
    <nav className="bg-gray-900 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/dashboard"
            className="flex items-center space-x-2 font-bold text-lg flex-shrink-0">
            <FiShield className="w-6 h-6 text-indigo-400" />
            <span>AI-SecOS</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center space-x-0.5 overflow-x-auto">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = router.pathname === item.href ||
                (item.href === "/assets" && router.pathname.startsWith("/assets/"));
              return (
                <Link key={item.href} href={item.href}
                  className={clsx(
                    "flex items-center space-x-1 px-2.5 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                    isActive
                      ? "bg-indigo-600 text-white"
                      : "text-gray-300 hover:bg-gray-800 hover:text-white"
                  )}>
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center flex-shrink-0">
            <button onClick={handleLogout}
              className="flex items-center space-x-1 px-3 py-2 rounded-md text-xs text-gray-300 hover:bg-gray-800 hover:text-white transition-colors">
              <FiLogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>

          {/* Mobile hamburger */}
          <div className="md:hidden flex items-center space-x-2">
            <button onClick={handleLogout} className="p-2 hover:bg-gray-800 rounded-md" title="Logout">
              <FiLogOut className="w-5 h-5" />
            </button>
            <button onClick={() => setIsOpen(!isOpen)} className="p-2 hover:bg-gray-800 rounded-md">
              {isOpen ? <FiX className="w-5 h-5" /> : <FiMenu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {isOpen && (
          <div className="md:hidden pb-4 grid grid-cols-2 gap-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = router.pathname === item.href;
              return (
                <Link key={item.href} href={item.href}
                  className={clsx(
                    "flex items-center space-x-2 px-3 py-2 rounded-md transition-colors text-sm",
                    isActive ? "bg-indigo-600 text-white" : "text-gray-300 hover:bg-gray-800"
                  )}
                  onClick={() => setIsOpen(false)}>
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
