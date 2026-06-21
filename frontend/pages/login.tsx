import React, { useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Button from "../components/Button";
import Alert from "../components/Alert";
import { authApi } from "../lib/apiClient";
import { FiShield, FiMail, FiLock, FiUser } from "react-icons/fi";

type Mode = "login" | "register";

const Login: React.FC = () => {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const response = await authApi.login(username, password);
      localStorage.setItem("token", response.data.access_token);
      setSuccess("Login successful! Redirecting...");
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);

    try {
      const response = await authApi.register(username, email, password);
      localStorage.setItem("token", response.data.access_token);
      setSuccess("Registration successful! Redirecting...");
      setTimeout(() => router.push("/dashboard"), 1500);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = mode === "login" ? handleLogin : handleRegister;

  return (
    <>
      <Head>
        <title>AI-SecOS - {mode === "login" ? "Login" : "Register"}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex items-center justify-center space-x-2 mb-8">
            <FiShield className="w-8 h-8 text-blue-500" />
            <h1 className="text-2xl font-bold text-white">AI-SecOS</h1>
          </div>

          {/* Card */}
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
              {mode === "login" ? "Sign In" : "Create Account"}
            </h2>

            {/* Alerts */}
            {error && <Alert type="error" message={error} onClose={() => setError(null)} />}
            {success && <Alert type="success" message={success} />}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Username */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Username
                </label>
                <div className="flex items-center border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-500">
                  <FiUser className="w-5 h-5 text-gray-400 ml-3" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-3 py-2 border-0 outline-none"
                    placeholder="Enter username"
                    required
                  />
                </div>
              </div>

              {/* Email (Register only) */}
              {mode === "register" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <div className="flex items-center border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-500">
                    <FiMail className="w-5 h-5 text-gray-400 ml-3" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3 py-2 border-0 outline-none"
                      placeholder="Enter email"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <div className="flex items-center border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-500">
                  <FiLock className="w-5 h-5 text-gray-400 ml-3" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 border-0 outline-none"
                    placeholder="Enter password"
                    required
                  />
                </div>
              </div>

              {/* Confirm Password (Register only) */}
              {mode === "register" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm Password
                  </label>
                  <div className="flex items-center border border-gray-300 rounded-md focus-within:ring-2 focus-within:ring-blue-500">
                    <FiLock className="w-5 h-5 text-gray-400 ml-3" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-3 py-2 border-0 outline-none"
                      placeholder="Confirm password"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <Button type="submit" variant="primary" size="md" loading={loading} className="w-full">
                {mode === "login" ? "Sign In" : "Create Account"}
              </Button>
            </form>

            {/* Toggle Mode */}
            <div className="mt-6 text-center text-sm text-gray-600">
              {mode === "login" ? (
                <>
                  Don't have an account?{" "}
                  <button
                    onClick={() => setMode("register")}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Register
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button
                    onClick={() => setMode("login")}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Sign In
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-gray-400 text-xs mt-8">
            AI Security Operations System © 2024
          </p>
        </div>
      </div>
    </>
  );
};

export default Login;
