import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import LoadingSpinner from "../components/LoadingSpinner";
import Alert from "../components/Alert";
import Button from "../components/Button";
import api from "../lib/api";
import { getOrgToken } from "../lib/tokens";
import {
  FiShield, FiKey, FiUsers, FiLink, FiBarChart2,
  FiPlus, FiTrash2, FiRefreshCw, FiCheck, FiX,
  FiAlertTriangle, FiCopy, FiEye, FiEyeOff,
  FiDownload, FiPlay, FiSettings,
} from "react-icons/fi";

// ── Helpers ────────────────────────────────────────────────────
const fmt = (d?: string) => d
  ? new Date(d).toLocaleString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })
  : "Never";

function Badge({ text, color }: { text: string; color: string }) {
  const colors: Record<string,string> = {
    green:  "bg-green-900/40 text-green-400 border-green-700",
    red:    "bg-red-900/40 text-red-400 border-red-700",
    blue:   "bg-blue-900/40 text-blue-400 border-blue-700",
    orange: "bg-orange-900/40 text-orange-400 border-orange-700",
    gray:   "bg-gray-800 text-gray-400 border-gray-600",
    teal:   "bg-teal-900/40 text-teal-400 border-teal-700",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${colors[color] || colors.gray}`}>
      {text}
    </span>
  );
}

// ── Tab definitions ────────────────────────────────────────────
const TABS = [
  { id:"rbac",       label:"Roles & Users",    icon:<FiUsers className="w-4 h-4"/> },
  { id:"apikeys",    label:"API Keys",          icon:<FiKey className="w-4 h-4"/> },
  { id:"connectors", label:"Connectors",        icon:<FiLink className="w-4 h-4"/> },
  { id:"reports",    label:"Reports",           icon:<FiBarChart2 className="w-4 h-4"/> },
] as const;

type Tab = typeof TABS[number]["id"];

// ═══════════════════════════════════════════════════════════════
// RBAC TAB
// ═══════════════════════════════════════════════════════════════
function RbacTab() {
  const [users, setUsers]   = useState<any[]>([]);
  const [roles, setRoles]   = useState<any[]>([]);
  const [myPerms, setMyPerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string|null>(null);
  const [assigning, setAssigning] = useState<{userId:string, role:string}|null>(null);

  useEffect(() => {
    Promise.all([
      api.get("/rbac/users"),
      api.get("/rbac/roles"),
      api.get("/rbac/my-permissions"),
    ]).then(([u, r, p]) => {
      setUsers(u.data);
      setRoles(r.data);
      setMyPerms(p.data.permissions || []);
    }).catch(() => setError("Failed to load RBAC data"))
    .finally(() => setLoading(false));
  }, []);

  const assignRole = async (userId: string, roleName: string) => {
    try {
      await api.post(`/rbac/users/${userId}/roles`, { user_id: userId, role_name: roleName });
      setUsers(u => u.map(usr => usr.id === userId ? { ...usr, role: roleName } : usr));
    } catch { setError("Failed to assign role"); }
    setAssigning(null);
  };

  const seedRoles = async () => {
    await api.post("/rbac/seed");
    const r = await api.get("/rbac/roles");
    setRoles(r.data);
  };

  if (loading) return <LoadingSpinner text="Loading RBAC…" />;

  return (
    <div className="space-y-6">
      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      {/* My permissions */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-gray-300 mb-3">My Permissions ({myPerms.length})</h3>
        <div className="flex flex-wrap gap-1.5">
          {myPerms.map(p => (
            <span key={p} className="text-xs bg-indigo-900/30 border border-indigo-800 text-indigo-300 px-2 py-0.5 rounded-full font-mono">
              {p}
            </span>
          ))}
        </div>
      </div>

      {/* System roles */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-300">System Roles ({roles.length})</h3>
          <button onClick={seedRoles}
            className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
            <FiRefreshCw className="w-3 h-3"/> Seed Defaults
          </button>
        </div>
        {roles.length === 0 ? (
          <div className="bg-gray-900 border border-dashed border-gray-700 rounded-xl p-6 text-center">
            <p className="text-gray-400 text-sm">No roles yet.</p>
            <button onClick={seedRoles}
              className="mt-2 text-indigo-400 text-sm hover:underline">Seed system roles →</button>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {roles.map((r: any) => (
              <div key={r.id} className="bg-gray-900 border border-gray-700 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-white text-sm">{r.display_name}</p>
                  {r.is_system && <Badge text="System" color="blue" />}
                </div>
                <p className="text-gray-400 text-xs">{r.description}</p>
                <p className="text-gray-500 text-xs mt-1">{r.permissions?.length || 0} permissions</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Users table */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 mb-3">Users ({users.length})</h3>
        <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 border-b border-gray-700">
              <tr>
                {["User","Email","Current Role","Status","Action"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {users.map((u: any) => (
                <tr key={u.id} className="hover:bg-gray-800/40">
                  <td className="px-4 py-3 font-medium text-white">{u.username}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <Badge text={u.role || "read_only"} color={
                      u.role === "admin" || u.role === "org_admin" ? "red" :
                      u.role === "security_architect" ? "orange" :
                      u.role === "security_analyst" ? "blue" : "gray"
                    } />
                  </td>
                  <td className="px-4 py-3">
                    <Badge text={u.is_active ? "Active" : "Inactive"} color={u.is_active ? "green" : "gray"} />
                  </td>
                  <td className="px-4 py-3">
                    {assigning?.userId === u.id ? (
                      <div className="flex items-center gap-2">
                        <select onChange={e => assignRole(u.id, e.target.value)} defaultValue=""
                          className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white text-xs">
                          <option value="" disabled>Select role…</option>
                          {roles.map((r: any) => <option key={r.name} value={r.name}>{r.display_name}</option>)}
                        </select>
                        <button onClick={() => setAssigning(null)}><FiX className="w-3.5 h-3.5 text-gray-400"/></button>
                      </div>
                    ) : (
                      <button onClick={() => setAssigning({ userId: u.id, role: u.role })}
                        className="text-xs text-indigo-400 hover:text-indigo-300">
                        Change Role
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// API KEYS TAB
// ═══════════════════════════════════════════════════════════════
function ApiKeysTab() {
  const [keys, setKeys]     = useState<any[]>([]);
  const [scopes, setScopes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string|null>(null);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string|null>(null); // shown once
  const [form, setForm]     = useState({ name:"", scopes:[] as string[], expires_at:"" });

  useEffect(() => {
    Promise.all([api.get("/api-keys"), api.get("/api-keys/scopes")])
      .then(([k, s]) => { setKeys(k.data); setScopes(s.data.scopes || []); })
      .catch(() => setError("Failed to load API keys"))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    try {
      const r = await api.post("/api-keys", {
        name: form.name,
        scopes: form.scopes,
        expires_at: form.expires_at || null,
      });
      setNewKey(r.data.raw_key);
      setKeys(k => [r.data, ...k]);
      setCreating(false);
      setForm({ name:"", scopes:[], expires_at:"" });
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to create key");
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this API key?")) return;
    await api.delete(`/api-keys/${id}`);
    setKeys(k => k.map(x => x.id === id ? {...x, is_active: false} : x));
  };

  const handleRotate = async (id: string) => {
    const r = await api.post(`/api-keys/${id}/rotate`);
    setNewKey(r.data.raw_key);
    setKeys(k => [...k.filter(x => x.id !== id), r.data]);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      {/* New key revealed */}
      {newKey && (
        <div className="bg-green-900/20 border border-green-600 rounded-xl p-4">
          <p className="text-green-300 font-semibold text-sm mb-2">
            ⚠ Copy this key now — it will never be shown again
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-950 text-green-400 font-mono text-xs px-3 py-2 rounded-lg break-all">
              {newKey}
            </code>
            <button onClick={() => {
                      try {
                        if (navigator.clipboard && window.isSecureContext) {
                          navigator.clipboard.writeText(newKey);
                        } else {
                          // Fallback for HTTP (non-HTTPS) contexts
                          const ta = document.createElement("textarea");
                          ta.value = newKey;
                          ta.style.position = "fixed";
                          ta.style.opacity = "0";
                          document.body.appendChild(ta);
                          ta.focus(); ta.select();
                          document.execCommand("copy");
                          document.body.removeChild(ta);
                        }
                      } catch {}
                    }}
              className="p-2 bg-gray-800 rounded-lg text-gray-300 hover:text-white">
              <FiCopy className="w-4 h-4"/>
            </button>
          </div>
          <button onClick={() => setNewKey(null)} className="mt-2 text-xs text-gray-400 hover:text-white">
            I've copied it — dismiss
          </button>
        </div>
      )}

      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-300">{keys.length} API Keys</h3>
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}
          className="flex items-center gap-1">
          <FiPlus className="w-3.5 h-3.5"/> New Key
        </Button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="bg-gray-900 border border-indigo-700 rounded-xl p-4 space-y-3">
          <h4 className="font-semibold text-white text-sm">Create API Key</h4>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Key Name *</label>
            <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              placeholder="e.g. Production Runtime Key"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"/>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-2">Scopes</label>
            <div className="flex flex-wrap gap-2">
              {scopes.map(s => (
                <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={form.scopes.includes(s)}
                    onChange={e => setForm({...form, scopes: e.target.checked
                      ? [...form.scopes, s] : form.scopes.filter(x => x !== s)})}
                    className="rounded border-gray-600 bg-gray-800 text-indigo-500"/>
                  <span className="text-xs text-gray-300 font-mono">{s}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Expiry (optional)</label>
            <input type="datetime-local" value={form.expires_at}
              onChange={e => setForm({...form, expires_at: e.target.value})}
              className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"/>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleCreate} disabled={!form.name || form.scopes.length===0}>Create</Button>
            <Button variant="outline" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Keys table */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 border-b border-gray-700">
            <tr>
              {["Name","Prefix","Scopes","Status","Last Used","Expires","Actions"].map(h => (
                <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {keys.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">No API keys yet.</td></tr>
            ) : keys.map((k: any) => (
              <tr key={k.id} className="hover:bg-gray-800/40">
                <td className="px-3 py-3 text-white font-medium">{k.name}</td>
                <td className="px-3 py-3 font-mono text-xs text-gray-400">{k.key_prefix}***</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(k.scopes||[]).map((s:string) => (
                      <span key={s} className="text-xs bg-gray-800 border border-gray-600 text-gray-300 px-1.5 py-0.5 rounded font-mono">{s}</span>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <Badge text={k.is_active ? "Active" : "Revoked"} color={k.is_active ? "green" : "gray"} />
                </td>
                <td className="px-3 py-3 text-gray-400 text-xs">{fmt(k.last_used_at)}</td>
                <td className="px-3 py-3 text-gray-400 text-xs">{k.expires_at ? fmt(k.expires_at) : "Never"}</td>
                <td className="px-3 py-3">
                  <div className="flex gap-1">
                    {k.is_active && (
                      <>
                        <button onClick={() => handleRotate(k.id)} title="Rotate"
                          className="p-1.5 text-gray-400 hover:text-yellow-400 hover:bg-gray-700 rounded">
                          <FiRefreshCw className="w-3.5 h-3.5"/>
                        </button>
                        <button onClick={() => handleRevoke(k.id)} title="Revoke"
                          className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded">
                          <FiTrash2 className="w-3.5 h-3.5"/>
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CONNECTORS TAB
// ═══════════════════════════════════════════════════════════════
function ConnectorsTab() {
  const [connectors, setConnectors] = useState<any[]>([]);
  const [types, setTypes]     = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string|null>(null);
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState<string|null>(null);
  const [syncing, setSyncing] = useState<string|null>(null);
  const [form, setForm] = useState({ name:"", connector_type:"openai", config:{ api_key:"" } });

  useEffect(() => {
    Promise.all([api.get("/connectors"), api.get("/connectors/types")])
      .then(([c, t]) => { setConnectors(c.data); setTypes(t.data.types || []); })
      .catch(() => setError("Failed to load connectors"))
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    try {
      const r = await api.post("/connectors", form);
      setConnectors(c => [r.data, ...c]);
      setCreating(false);
      setForm({ name:"", connector_type:"openai", config:{ api_key:"" } });
    } catch (e: any) { setError(e.response?.data?.detail || "Failed to create"); }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const r = await api.post(`/connectors/${id}/test`);
      setConnectors(c => c.map(x => x.id===id ? {...x, sync_status: r.data.connected ? "ok" : "error"} : x));
    } finally { setTesting(null); }
  };

  const handleSync = async (id: string) => {
    setSyncing(id);
    try {
      const r = await api.post(`/connectors/${id}/sync`);
      setConnectors(c => c.map(x => x.id===id ? {...x, agent_count: r.data.agents_found, sync_status:"ok"} : x));
    } catch (e: any) { setError(e.response?.data?.detail || "Sync failed"); }
    finally { setSyncing(null); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete connector?")) return;
    await api.delete(`/connectors/${id}`);
    setConnectors(c => c.filter(x => x.id !== id));
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-5">
      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-300">{connectors.length} Connectors</h3>
        <Button variant="primary" size="sm" onClick={() => setCreating(true)}
          className="flex items-center gap-1">
          <FiPlus className="w-3.5 h-3.5"/> Add Connector
        </Button>
      </div>

      {creating && (
        <div className="bg-gray-900 border border-indigo-700 rounded-xl p-4 space-y-3">
          <h4 className="font-semibold text-white text-sm">New Connector</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name *</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                placeholder="Production OpenAI"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"/>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Type</label>
              <select value={form.connector_type} onChange={e => setForm({...form, connector_type: e.target.value})}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">API Key</label>
            <input type="password" placeholder="sk-..." value={form.config.api_key}
              onChange={e => setForm({...form, config: {...form.config, api_key: e.target.value}})}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-indigo-500"/>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleCreate} disabled={!form.name}>Create</Button>
            <Button variant="outline" size="sm" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {connectors.length === 0 ? (
        <div className="bg-gray-900 border border-dashed border-gray-700 rounded-xl p-8 text-center text-gray-500">
          <FiLink className="w-8 h-8 mx-auto mb-2 opacity-40"/>
          No connectors yet. Add your first AI platform connector.
        </div>
      ) : (
        <div className="space-y-3">
          {connectors.map((c: any) => (
            <div key={c.id} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-white">{c.name}</span>
                    <Badge text={c.connector_type} color="blue" />
                    <Badge text={c.is_active ? "Active" : "Disabled"} color={c.is_active ? "green" : "gray"} />
                    {c.sync_status && (
                      <Badge text={c.sync_status} color={c.sync_status==="ok" ? "green" : c.sync_status==="syncing" ? "orange" : "red"} />
                    )}
                  </div>
                  <div className="flex gap-4 text-xs text-gray-400">
                    <span>🤖 {c.agent_count} agents discovered</span>
                    {c.last_sync_at && <span>Last sync: {fmt(c.last_sync_at)}</span>}
                  </div>
                  {c.sync_error && <p className="text-xs text-red-400 mt-1">{c.sync_error}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => handleTest(c.id)} disabled={testing===c.id}
                    title="Test connection"
                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-teal-400 hover:bg-gray-800 rounded border border-gray-700 disabled:opacity-40">
                    <FiCheck className="w-3 h-3"/>{testing===c.id ? "Testing…" : "Test"}
                  </button>
                  <button onClick={() => handleSync(c.id)} disabled={syncing===c.id}
                    title="Discover agents"
                    className="flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-indigo-400 hover:bg-gray-800 rounded border border-gray-700 disabled:opacity-40">
                    <FiRefreshCw className="w-3 h-3"/>{syncing===c.id ? "Syncing…" : "Sync"}
                  </button>
                  <button onClick={() => handleDelete(c.id)}
                    className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded border border-gray-700">
                    <FiTrash2 className="w-3.5 h-3.5"/>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// REPORTS TAB
// ═══════════════════════════════════════════════════════════════
function ReportsTab() {
  const [frameworks, setFrameworks] = useState<any[]>([]);
  const [summary, setSummary]       = useState<any>(null);
  const [execReport, setExecReport] = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState<string|null>(null);
  const [days, setDays]             = useState(30);

  useEffect(() => {
    Promise.all([api.get("/reports/frameworks"), api.get("/reports/summary")])
      .then(([f, s]) => { setFrameworks(f.data.frameworks); setSummary(s.data); })
      .finally(() => setLoading(false));
  }, []);

  const generateExec = async () => {
    setGenerating("exec");
    const r = await api.get(`/reports/executive?days=${days}`);
    setExecReport(r.data);
    setGenerating(null);
  };

  const downloadCsv = async (type: string) => {
    const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const url = type === "executive"
      ? `/reports/executive?days=${days}&format=csv`
      : `/reports/compliance/${type}?days=${days}&format=csv`;
    try {
      const token = getOrgToken();
      const res = await fetch(`${BASE}/api/v1${url}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "text/csv" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${type}_report_${days}d.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      console.error("CSV download failed:", e.message);
      alert(`Download failed: ${e.message}`);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* Days selector */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-400">Report period:</span>
        {[7, 30, 90].map(d => (
          <button key={d} onClick={() => setDays(d)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              days===d ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700"
            }`}>
            {d}d
          </button>
        ))}
      </div>

      {/* Executive report */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-white">Executive Security Report</h3>
            <p className="text-gray-400 text-sm">Blocked requests, incidents, risk posture</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadCsv("executive")}
              className="flex items-center gap-1">
              <FiDownload className="w-3.5 h-3.5"/> CSV
            </Button>
            <Button variant="primary" size="sm" onClick={generateExec} loading={generating==="exec"}
              className="flex items-center gap-1">
              <FiPlay className="w-3.5 h-3.5"/> Generate
            </Button>
          </div>
        </div>

        {execReport && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label:"Total Requests",   value:execReport.summary.total_requests,    color:"text-blue-400" },
                { label:"Blocked",          value:execReport.summary.blocked_requests,  color:"text-red-400" },
                { label:"Block Rate",       value:`${execReport.summary.block_rate_pct}%`, color:"text-orange-400" },
                { label:"Open Incidents",   value:execReport.summary.open_incidents,    color:"text-yellow-400" },
                { label:"High Risk Assets", value:execReport.summary.high_risk_assets,  color:"text-red-400" },
                { label:"Period",           value:`${execReport.period_days} days`,     color:"text-gray-400" },
              ].map(s => (
                <div key={s.label} className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-center">
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              ))}
            </div>
            {execReport.top_violating_agents?.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-2 uppercase font-semibold">Top Violating Agents</p>
                <div className="space-y-1">
                  {execReport.top_violating_agents.map((a: any) => (
                    <div key={a.agent} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2">
                      <span className="text-sm text-white">🤖 {a.agent}</span>
                      <span className="text-sm font-bold text-red-400">{a.deny_count} denials</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Compliance framework cards */}
      <div>
        <h3 className="font-semibold text-white mb-3">Compliance Reports</h3>
        <div className="grid grid-cols-2 gap-3">
          {frameworks.map((f: any) => {
            const sum = summary?.frameworks?.find((s: any) => s.framework === f.id);
            return (
              <div key={f.id} className="bg-gray-900 border border-gray-700 rounded-xl p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-semibold text-white text-sm">{f.name}</p>
                    <p className="text-gray-500 text-xs">{f.controls} controls</p>
                  </div>
                  {sum && (
                    <div className="text-right">
                      <p className={`text-xl font-bold ${sum.score_pct >= 80 ? "text-green-400" : sum.score_pct >= 60 ? "text-yellow-400" : "text-red-400"}`}>
                        {sum.score_pct}%
                      </p>
                      <p className="text-xs text-gray-500">{sum.passed}/{sum.total_controls} pass</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" onClick={() => downloadCsv(f.id)}
                    className="flex-1 flex items-center justify-center gap-1 text-xs">
                    <FiDownload className="w-3 h-3"/> CSV
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
const EnterprisePage: React.FC = () => {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("rbac");

  useEffect(() => {
    if (!getOrgToken()) { router.push("/login"); return; }
  }, []);

  return (
    <>
      <Head><title>Enterprise Admin - AI-SecOS</title></Head>
      <main className="min-h-screen bg-gray-950 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <FiSettings className="w-7 h-7 text-indigo-400"/> Enterprise Admin
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              RBAC · API Keys · Connector Framework · Compliance Reports
            </p>
          </div>

          {/* Tab nav */}
          <div className="flex bg-gray-900 border border-gray-700 rounded-xl p-1 mb-6 gap-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  tab === t.id
                    ? "bg-indigo-600 text-white shadow"
                    : "text-gray-400 hover:text-white hover:bg-gray-800"
                }`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div>
            {tab === "rbac"       && <RbacTab />}
            {tab === "apikeys"    && <ApiKeysTab />}
            {tab === "connectors" && <ConnectorsTab />}
            {tab === "reports"    && <ReportsTab />}
          </div>
        </div>
      </main>
    </>
  );
};

export default EnterprisePage;
