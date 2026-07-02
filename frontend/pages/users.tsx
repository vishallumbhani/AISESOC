import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import orgApi from "../lib/orgApi";
import { getOrgToken } from "../lib/tokens";
import {
  FiUsers, FiPlus, FiX, FiEdit2, FiCheckCircle,
  FiAlertCircle, FiRefreshCw, FiShield, FiToggleLeft, FiToggleRight,
} from "react-icons/fi";

const ROLES = ["org_admin", "security_architect", "security_analyst", "auditor", "read_only"];

const ROLE_CLS: Record<string, string> = {
  org_admin:          "text-red-700 bg-red-50 border-red-200",
  admin:              "text-red-700 bg-red-50 border-red-200",
  security_architect: "text-orange-700 bg-orange-50 border-orange-200",
  security_analyst:   "text-blue-300 bg-blue-900/30 border-blue-700",
  auditor:            "text-purple-300 bg-purple-900/30 border-purple-700",
  read_only:          "text-slate-500 bg-slate-100 border-slate-300",
  user:               "text-slate-500 bg-slate-100 border-slate-300",
};

const fmtDate = (iso?: string | null) => {
  if (!iso) return "Never";
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return "—"; }
};

const Users: React.FC = () => {
  const router = useRouter();
  const [users, setUsers]       = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [success, setSuccess]   = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole]   = useState("");
  const [form, setForm] = useState({ username: "", email: "", password: "", role: "security_analyst" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!getOrgToken()) { router.push("/login"); return; }
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await orgApi.get("/auth/users");
      setUsers(Array.isArray(r.data) ? r.data : []);
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : `Failed to load users (HTTP ${err.response?.status || "unknown"})`
      );
    } finally {
      setLoading(false);
    }
  };

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setSaving(true); setError(null);
    try {
      await orgApi.post("/auth/invite", form);
      setSuccess(`User "${form.username}" created successfully`);
      setInviting(false);
      setForm({ username: "", email: "", password: "", role: "security_analyst" });
      setTimeout(() => setSuccess(null), 3000);
      await load();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Failed to create user");
    } finally { setSaving(false); }
  };

  const updateRole = async (userId: string, role: string) => {
    try {
      await orgApi.patch(`/auth/users/${userId}`, { role });
      setUsers(u => u.map(x => x.id === userId ? { ...x, role } : x));
      setEditingId(null);
      setSuccess("Role updated");
      setTimeout(() => setSuccess(null), 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to update role");
    }
  };

  const toggleActive = async (user: any) => {
    try {
      await orgApi.patch(`/auth/users/${user.id}`, { is_active: !user.is_active });
      setUsers(u => u.map(x => x.id === user.id ? { ...x, is_active: !user.is_active } : x));
      setSuccess(`User ${!user.is_active ? "enabled" : "disabled"}`);
      setTimeout(() => setSuccess(null), 2000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to update user");
    }
  };

  return (
    <>
      <Head><title>Users — AI-SecOS</title></Head>
      <main className="min-h-screen py-8">
        <div className="max-w-5xl mx-auto px-4">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
                <FiUsers className="w-5 h-5 text-slate-900" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                  Users
                  <span className="text-sm text-slate-400 font-normal">({users.length})</span>
                </h1>
                <p className="text-slate-400 text-xs mt-0.5">Manage organization members and roles</p>
              </div>
            </div>

          {/* ── User Summary Cards ───────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Total Users",    value: users.length,                                   color: "text-blue-600",   bg: "bg-blue-50",   icon: "👥" },
              { label: "Admin Users",    value: users.filter((u:any) => u.role === "admin").length, color: "text-purple-600", bg: "bg-purple-50", icon: "🔑" },
              { label: "Active Today",   value: users.filter((u:any) => u.last_login_at).length, color: "text-green-600",  bg: "bg-green-50",  icon: "✅" },
              { label: "Pending Invite", value: 0,                                               color: "text-amber-600",  bg: "bg-amber-50",  icon: "📨" },
            ].map((s, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-4">
                <div className={`w-9 h-9 ${s.bg} rounded-lg flex items-center justify-center text-lg mb-3`}>{s.icon}</div>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-500 font-medium mt-0.5 uppercase tracking-wide">{s.label}</p>
              </div>
            ))}
          </div>

            <div className="flex gap-2">
              <button onClick={load}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-500 hover:text-slate-900 rounded-lg text-sm">
                <FiRefreshCw className="w-4 h-4" />
              </button>
              <button onClick={() => { setInviting(!inviting); setError(null); }}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-slate-900 font-semibold px-4 py-2.5 rounded-xl text-sm">
                {inviting
                  ? <><FiX className="w-4 h-4" /> Cancel</>
                  : <><FiPlus className="w-4 h-4" /> Invite User</>}
              </button>
            </div>
          </div>

          {/* Alerts */}
          {error && (
            <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              <FiAlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)} className="opacity-60 hover:opacity-100"><FiX className="w-4 h-4" /></button>
            </div>
          )}
          {success && (
            <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
              <FiCheckCircle className="w-4 h-4" /> {success}
            </div>
          )}

          {/* Invite form */}
          {inviting && (
            <form onSubmit={invite}
              className="bg-white border border-blue-200/60 rounded-xl p-5 mb-5 space-y-4">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <FiShield className="w-4 h-4 text-blue-600" /> Invite New User
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Username *</label>
                  <input required value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })}
                    placeholder="john.smith"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Email *</label>
                  <input required type="email" value={form.email}
                    onChange={e => setForm({ ...form, email: e.target.value })}
                    placeholder="john@company.com"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Password * (min 8 chars)</label>
                  <input required type="password" value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Role</label>
                  <select value={form.role}
                    onChange={e => setForm({ ...form, role: e.target.value })}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none">
                    {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-slate-900 font-semibold px-4 py-2 rounded-lg text-sm">
                  {saving ? "Creating…" : "Create User"}
                </button>
                <button type="button" onClick={() => setInviting(false)}
                  className="bg-white border border-slate-200 text-slate-600 hover:text-slate-900 px-4 py-2 rounded-lg text-sm">
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Users table */}
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {["User", "Email", "Role", "Status", "Last Login", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs text-slate-400 font-semibold uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <FiUsers className="w-10 h-10 mx-auto mb-3 text-gray-700" />
                        <p className="text-slate-400 font-medium">No users found</p>
                        <p className="text-slate-500 text-xs mt-1">
                          {error ? "Check the error above." : "Click 'Invite User' to add the first member."}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    users.map(u => (
                      <tr key={u.id} className={`hover:bg-slate-50 transition-colors ${!u.is_active ? "opacity-50" : ""}`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900">{u.username}</p>
                          {u.display_name && <p className="text-xs text-slate-400">{u.display_name}</p>}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-sm">{u.email}</td>
                        <td className="px-4 py-3">
                          {editingId === u.id ? (
                            <div className="flex items-center gap-1">
                              <select value={editRole}
                                onChange={e => setEditRole(e.target.value)}
                                className="bg-white border border-slate-200 rounded px-2 py-1 text-slate-900 text-xs focus:outline-none">
                                {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
                              </select>
                              <button onClick={() => updateRole(u.id, editRole)}
                                className="text-green-600 hover:text-green-700 text-xs px-2 py-1 bg-green-50 rounded">Save</button>
                              <button onClick={() => setEditingId(null)} className="text-slate-400 hover:text-slate-900">
                                <FiX className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${ROLE_CLS[u.role] || "text-slate-500 bg-slate-100 border-slate-300"}`}>
                              {(u.role || "user").replace(/_/g, " ")}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold ${u.is_active ? "text-green-600" : "text-red-600"}`}>
                            {u.is_active ? "Active" : "Disabled"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">
                          {fmtDate(u.last_login_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => { setEditingId(u.id); setEditRole(u.role); }}
                              title="Change role"
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded">
                              <FiEdit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => toggleActive(u)}
                              title={u.is_active ? "Disable user" : "Enable user"}
                              className={`p-1.5 rounded hover:bg-slate-100 ${u.is_active ? "text-slate-400 hover:text-orange-400" : "text-slate-400 hover:text-green-400"}`}>
                              {u.is_active
                                ? <FiToggleRight className="w-4 h-4" />
                                : <FiToggleLeft className="w-4 h-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
};

export default Users;
