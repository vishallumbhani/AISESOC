import React from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { FiHome, FiDatabase, FiShield, FiZap, FiLogOut, FiMenu, FiX } from "react-icons/fi";
import clsx from "clsx";

const Navbar: React.FC = () => {
  const router = useRouter();
  const [isOpen, setIsOpen] = React.useState(false);

  const handleLogout = () => {
    localStorage.removeItem("token");
    router.push("/login");
  };

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: FiHome },
    { label: "Assets", href: "/assets", icon: FiDatabase },
    { label: "Policies", href: "/policies", icon: FiShield },
    { label: "Runtime Test", href: "/runtime", icon: FiZap },
  ];

  return (
    <nav className="bg-gray-900 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center space-x-2 font-bold text-xl">
            <FiShield className="w-6 h-6" />
            <span>AI-SecOS</span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center space-x-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = router.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex items-center space-x-1 px-3 py-2 rounded-md transition-colors",
                    isActive ? "bg-blue-600" : "hover:bg-gray-800"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Logout Button */}
          <div className="hidden md:flex items-center space-x-4">
            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
            >
              <FiLogOut className="w-5 h-5" />
              <span>Logout</span>
            </button>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center space-x-4">
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-gray-800 rounded-md"
              title="Logout"
            >
              <FiLogOut className="w-5 h-5" />
            </button>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 hover:bg-gray-800 rounded-md"
            >
              {isOpen ? <FiX className="w-5 h-5" /> : <FiMenu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="md:hidden pb-4 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = router.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex items-center space-x-2 px-3 py-2 rounded-md transition-colors block",
                    isActive ? "bg-blue-600" : "hover:bg-gray-800"
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <Icon className="w-5 h-5" />
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
