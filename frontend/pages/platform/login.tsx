/**
 * pages/platform/login.tsx
 *
 * Platform Admin login page.
 * Uses publicApi → /auth/platform/login.
 * Stores token in platform_access_token key (never "token").
 * Redirects to /platform/dashboard on success.
 */
import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { setPlatformToken, hasPlatformToken } from "../../lib/tokens";
import publicApi from "../../lib/publicApi";
import { FiShield, FiAlertCircle } from "react-icons/fi";

const PlatformLogin: React.FC = () => {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (hasPlatformToken()) {
      router.replace("/platform/dashboard");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError("Username and password are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await publicApi.post("/auth/platform/login", { username, password });
      setPlatformToken(res.data.access_token);
      router.push("/platform/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Invalid credentials. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head><title>Platform Admin Login — AI-SecOS</title></Head>
      <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">

          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-lg">
              <FiShield className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">AI-SecOS</h1>
            <p className="text-gray-400 text-sm mt-1">Platform Administration</p>
          </div>

          {/* Card */}
          <div className="bg-gray-800 rounded-2xl border border-gray-700 p-8 shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-1">Platform Admin Sign In</h2>
            <p className="text-gray-400 text-xs mb-6">
              This portal is for AI-SecOS staff only.
            </p>

            {error && (
              <div className="flex items-center gap-2 bg-red-900/40 border border-red-700 text-red-300 rounded-lg px-3 py-2.5 mb-4 text-sm">
                <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="superadmin"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition"
              >
                {loading ? "Signing in..." : "Sign In to Platform"}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-gray-700 text-center">
              <p className="text-xs text-gray-500">
                Looking for the organization portal?{" "}
                <a href="/login" className="text-blue-400 hover:underline">Sign in here</a>
              </p>
            </div>
          </div>

          <p className="text-center text-gray-600 text-xs mt-6">
            AI-SecOS Platform Administration • All actions are audited
          </p>
        </div>
      </div>
    </>
  );
};

export default PlatformLogin;
