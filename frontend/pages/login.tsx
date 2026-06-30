/**
 * pages/login.tsx
 *
 * Organization user login.
 * Uses publicApi (no auth header).
 * Stores token with setOrgToken() — writes both keys for compatibility.
 */
import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { setOrgToken, hasOrgToken } from "../lib/tokens";
import publicApi from "../lib/publicApi";
import { FiShield, FiAlertCircle, FiEye, FiEyeOff } from "react-icons/fi";

const Login: React.FC = () => {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (hasOrgToken()) {
      router.replace("/dashboard");
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
      const res = await publicApi.post("/auth/login", null, {
        params: { username: username.trim(), password },
      });
      setOrgToken(res.data.access_token);
      router.push("/dashboard");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Invalid username or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head><title>Sign In — AI-SecOS</title></Head>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">

          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4 shadow-xl">
              <FiShield className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">AI-SecOS</h1>
            <p className="text-blue-300 text-sm mt-1">AI Governance & Security Platform</p>
          </div>

          {/* Card */}
          <div className="bg-white/5 backdrop-blur rounded-2xl border border-white/10 p-8 shadow-2xl">
            <h2 className="text-lg font-semibold text-white mb-1">Welcome back</h2>
            <p className="text-white/50 text-xs mb-6">Sign in to your organization</p>

            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-3 py-2.5 mb-4 text-sm">
                <FiAlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1.5">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full px-3 py-2.5 bg-white/10 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="your username"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full px-3 py-2.5 pr-10 bg-white/10 border border-white/10 rounded-lg text-white text-sm placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                  >
                    {showPw ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold rounded-lg text-sm transition"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-white/10 text-center">
              <p className="text-xs text-white/40">
                Platform admin?{" "}
                <a href="/platform/login" className="text-blue-400 hover:underline">Platform sign in</a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Login;
