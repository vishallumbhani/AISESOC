import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import LoadingSpinner from "../components/LoadingSpinner";
import Alert from "../components/Alert";
import Button from "../components/Button";
import api from "../lib/api";
import { getOrgToken } from "../lib/tokens";
import {
  FiShield, FiKey, FiUsers, FiLink,
  FiPlus, FiTrash2, FiRefreshCw, FiCheck, FiX,
  FiAlertTriangle, FiCopy, FiEye, FiEyeOff,
  FiSettings,
} from "react-icons/fi";

const fmt = (d?: string) => d
  ? new Date(d).toLocaleString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })
  : "Never";

// ── Unified badge using light theme ───────────────────────────
function Badge({ text, color }: { text: string; color: string }) {
  const colors: Record<string, string> = {
    green:  "bg-green-50 text-green-700 border border-green-200",
    red:    "bg-red-50 text-red-700 border border-red-200",
    blue:   "bg-blue-50 text-blue-700 border border-blue-200",
    orange: "bg-orange-50 text-orange-700 border border-orange-200",
    gray:   "bg-slate-100 text-slate-600 border border-slate-200",
    teal:   "bg-teal-50 text-teal-700 border border-teal-200",
    indigo: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${colors[color] || colors.gray}`}>
      {text}
    </span>
  );
}

// ── Tabs — Reports removed (item 4), single Integration tab (item 3)
const TABS = [
  { id:"apikeys",    label:"API Keys",      icon:<FiKey className="w-4 h-4"/> },
  { id:"connectors", label:"Connectors",    icon:<FiLink className="w-4 h-4"/> },
] as const;

type Tab = typeof TABS[number]["id"];

// ═══════════════════════════════════════════════════════════════
// RBAC TAB
// ═══════════════════════════════════════════════════════════════
function RbacTab() {
  const [users, setUsers]     = useState<any[]>([]);
  const [roles, setRoles]     = useState<any[]>([]);
  const [myPerms, setMyPerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [u, r, p] = await Promise.all([
        api.get("/auth/users"),
        api.get("/rbac/roles"),
        api.get("/rbac/my-permissions"),
      ]);
      setUsers(u.data);
      setRoles(r.data.roles || r.data);
      setMyPerms(p.data.permissions || []);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to load RBAC data");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const changeRole = async (userId: string, role: string) => {
    try {
      await api.patch(`/auth/users/${userId}`, { role });
      setUsers(u => u.map(x => x.id === userId ? { ...x, role } : x));
    } catch (e: any) { setError(e.response?.data?.detail || "Failed to update role"); }
  };

  const seedDefaults = async () => {
    setSeeding(true);
    try { await api.post("/rbac/seed-defaults"); await load(); }
    catch (e: any) { setError(e.response?.data?.detail || "Failed to seed defaults"); }
    finally { setSeeding(false); }
  };

  if (loading) return <div className="flex justify-center py-12"><LoadingSpinner /></div>;

  return (
    <div className="space-y-5">
      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      {/* My Permissions — light theme chips (fix item 2) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 mb-3">
          My Permissions ({myPerms.length})
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {myPerms.map(p => (
            <span key={p}
              className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.5 rounded-full font-mono">
              {p}
            </span>
          ))}
          {myPerms.length === 0 && (
            <p className="text-slate-400 text-sm">No permissions assigned.</p>
          )}
        </div>
      </div>

      {/* System Roles */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">System Roles ({roles.length})</h3>
          <Button variant="outline" size="sm" onClick={seedDefaults} loading={seeding}
            className="flex items-center gap-1 text-xs">
            <FiRefreshCw className="w-3 h-3" /> Seed Defaults
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {roles.map((r: any) => (
            <div key={r.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <div className="flex items-start justify-between mb-1.5">
                <p className="font-semibold text-slate-900 text-sm">{r.display_name || r.name}</p>
                {r.is_system && <Badge text="System" color="blue" />}
              </div>
              <p className="text-slate-500 text-xs mb-2 leading-relaxed">{r.description || "—"}</p>
              <p className="text-slate-400 text-xs">{r.permissions?.length || 0} permissions</p>
            </div>
          ))}
        </div>
      </div>

      {/* Users */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Users ({users.length})</h3>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {["User","Email","Current Role","Status","Action"].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No users found.</td></tr>
              ) : users.map((u: any) => (
                <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-900">{u.username}</td>
                  <td className="px-4 py-3 text-slate-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <Badge text={u.role || "user"} color={
                      u.role === "admin" || u.role === "org_admin" ? "red" :
                      u.role === "security_analyst" || u.role === "security_architect" ? "blue" :
                      u.role === "auditor" ? "teal" : "gray"
                    } />
                  </td>
                  <td className="px-4 py-3">
                    <Badge text={u.is_active ? "Active" : "Inactive"} color={u.is_active ? "green" : "gray"} />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      defaultValue={u.role}
                      onChange={e => changeRole(u.id, e.target.value)}
                      className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {["org_admin","security_architect","security_analyst","auditor","read_only"].map(r => (
                        <option key={r} value={r}>{r.replace(/_/g," ")}</option>
                      ))}
                    </select>
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
  const [keys, setKeys]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newKeyData, setNewKey] = useState<any>(null);
  const [form, setForm]       = useState({ name: "", scopes: ["runtime:write","runtime:read"] });
  const [showForm, setShowForm] = useState(false);
  const [showKey, setShowKey] = useState<Record<string,boolean>>({});

  const SCOPES = ["runtime:write","runtime:read","policy:read","policy:write","incident:read","incident:write","audit:read","audit:export","report:read"];

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/api-keys"); setKeys(r.data.api_keys || r.data); }
    catch (e: any) { setError(e.response?.data?.detail || "Failed to load API keys"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim()) { setError("Key name is required"); return; }
    setCreating(true); setError(null);
    try {
      const r = await api.post("/api-keys", { name: form.name, scopes: form.scopes });
      setNewKey(r.data);
      setShowForm(false);
      setForm({ name: "", scopes: ["runtime:write","runtime:read"] });
      await load();
    } catch (e: any) { setError(e.response?.data?.detail || "Failed to create key"); }
    finally { setCreating(false); }
  };

  const revoke = async (id: string) => {
    try { await api.delete(`/api-keys/${id}`); await load(); }
    catch (e: any) { setError(e.response?.data?.detail || "Failed to revoke key"); }
  };

  const copyKey = (key: string) => { navigator.clipboard.writeText(key); };

  if (loading) return <div className="flex justify-center py-12"><LoadingSpinner /></div>;

  return (
    <div className="space-y-5">
      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      {/* New key reveal */}
      {newKeyData && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-start gap-2 mb-2">
            <FiCheck className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-green-800">API key created — copy it now</p>
              <p className="text-xs text-green-600 mt-0.5">This key will not be shown again.</p>
            </div>
            <button onClick={() => setNewKey(null)} className="text-green-500 hover:text-green-700">
              <FiX className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-2 bg-white border border-green-200 rounded-lg px-3 py-2">
            <code className="text-xs text-slate-800 flex-1 font-mono break-all">
              {newKeyData.raw_key || newKeyData.key}
            </code>
            <button onClick={() => copyKey(newKeyData.raw_key || newKeyData.key)}
              className="text-slate-500 hover:text-blue-600 flex-shrink-0">
              <FiCopy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header + create */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">API Keys ({keys.length})</h3>
        <Button variant="primary" size="sm" onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 text-xs">
          <FiPlus className="w-3.5 h-3.5" /> New API Key
        </Button>
      </div>

      {showForm && (
        <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Create New API Key</h4>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Key Name *</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                placeholder="e.g. n8n-connector"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Scopes</label>
              <div className="flex flex-wrap gap-2">
                {SCOPES.map(s => (
                  <label key={s} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox"
                      checked={form.scopes.includes(s)}
                      onChange={e => setForm({...form, scopes:
                        e.target.checked ? [...form.scopes, s] : form.scopes.filter(x => x !== s)
                      })}
                      className="rounded border-slate-300 text-blue-600" />
                    <span className="text-slate-700 font-mono">{s}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" onClick={create} loading={creating}
                className="flex items-center gap-1 text-xs">
                <FiCheck className="w-3.5 h-3.5" /> Create Key
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}
                className="text-xs">Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {/* Keys table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {["Name","Prefix","Scopes","Last Used","Status","Actions"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {keys.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No API keys yet.</td></tr>
            ) : keys.map((k: any) => (
              <tr key={k.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-900">{k.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{k.key_prefix}…</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(k.scopes || []).map((s: string) => (
                      <span key={s} className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono border border-slate-200">{s}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">{fmt(k.last_used_at)}</td>
                <td className="px-4 py-3">
                  <Badge text={k.is_active ? "Active" : "Revoked"} color={k.is_active ? "green" : "gray"} />
                </td>
                <td className="px-4 py-3">
                  {k.is_active && (
                    <button onClick={() => revoke(k.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Revoke key">
                      <FiTrash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
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
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [syncing, setSyncing]       = useState<string | null>(null);
  const [showForm, setShowForm]     = useState(false);
  const [creating, setCreating]     = useState(false);
  const [form, setForm] = useState({ name:"", connector_type:"n8n", webhook_url:"", api_key:"" });

  const CONNECTOR_TYPES = ["n8n","langchain","langgraph","crewai","openai","azure_openai","anthropic","mcp","custom_rest","microsoft_copilot"];

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/connectors"); setConnectors(r.data); }
    catch (e: any) { setError(e.response?.data?.detail || "Failed to load connectors"); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name.trim()) { setError("Connector name is required"); return; }
    setCreating(true); setError(null);
    try {
      await api.post("/connectors", {
        name: form.name,
        connector_type: form.connector_type,
        config: { webhook_url: form.webhook_url, api_key: form.api_key },
      });
      setShowForm(false);
      setForm({ name:"", connector_type:"n8n", webhook_url:"", api_key:"" });
      await load();
    } catch (e: any) { setError(e.response?.data?.detail || "Failed to create connector"); }
    finally { setCreating(false); }
  };

  const sync = async (id: string) => {
    setSyncing(id);
    try { await api.post(`/connectors/${id}/sync`); await load(); }
    catch (e: any) { setError(e.response?.data?.detail || "Sync failed"); }
    finally { setSyncing(null); }
  };

  if (loading) return <div className="flex justify-center py-12"><LoadingSpinner /></div>;

  return (
    <div className="space-y-5">
      {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Connectors ({connectors.length})</h3>
        <Button variant="primary" size="sm" onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 text-xs">
          <FiPlus className="w-3.5 h-3.5" /> Add Connector
        </Button>
      </div>

      {showForm && (
        <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
          <h4 className="text-sm font-semibold text-slate-700 mb-4">Add AI Connector</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Name *</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                placeholder="e.g. Production n8n"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Type</label>
              <select value={form.connector_type} onChange={e => setForm({...form, connector_type: e.target.value})}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {CONNECTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Webhook URL</label>
              <input value={form.webhook_url} onChange={e => setForm({...form, webhook_url: e.target.value})}
                placeholder="https://..."
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">API Key (optional)</label>
              <input value={form.api_key} type="password" onChange={e => setForm({...form, api_key: e.target.value})}
                placeholder="••••••••"
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="primary" size="sm" onClick={create} loading={creating}
              className="flex items-center gap-1 text-xs">
              <FiCheck className="w-3.5 h-3.5" /> Add Connector
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)} className="text-xs">Cancel</Button>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {["Name","Type","Status","Agents","Last Sync","Actions"].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {connectors.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                No connectors configured. Add your first AI connector above.
              </td></tr>
            ) : connectors.map((c: any) => (
              <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-900">{c.display_name || c.name}</td>
                <td className="px-4 py-3">
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 font-mono">{c.connector_type}</span>
                </td>
                <td className="px-4 py-3">
                  <Badge
                    text={c.sync_status === "error" ? "Error" : c.is_active ? "Active" : "Inactive"}
                    color={c.sync_status === "error" ? "red" : c.is_active ? "green" : "gray"}
                  />
                </td>
                <td className="px-4 py-3 text-slate-600">{c.agent_count || 0}</td>
                <td className="px-4 py-3 text-slate-500 text-xs">{fmt(c.last_sync_at)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => sync(c.id)} disabled={syncing === c.id}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40">
                    <FiRefreshCw className={`w-3.5 h-3.5 ${syncing === c.id ? "animate-spin" : ""}`} />
                    {syncing === c.id ? "Syncing…" : "Sync"}
                  </button>
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
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════
const EnterprisePage: React.FC = () => {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("apikeys");

  useEffect(() => {
    // Fix: was localStorage.getItem("token") — now uses getOrgToken()
    if (!getOrgToken()) { router.push("/login"); return; }
    // Open API Keys tab if navigated with #api-keys hash
    if (typeof window !== "undefined" && window.location.hash === "#api-keys") {
      setTab("apikeys");
    }
  }, []);

  return (
    <>
      <Head><title>Enterprise Admin — AI-SecOS</title></Head>
      <main className="min-h-screen" style={{ background: "#F8FAFC" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
                <FiSettings className="w-5 h-5 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900">API &amp; Connectors</h1>
            </div>
            <p className="text-slate-500 text-sm mt-0.5 ml-12">
              Manage API keys for connector authentication and configure platform integrations.
            </p>
          </div>

          {/* Tab nav — clean light style */}
          <div className="flex border-b border-[#D8D8D8] mb-5">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors ${
                  tab === t.id
                    ? "border-b-2 border-[#0572CE] text-[#0572CE]"
                    : "border-b-2 border-transparent text-[#595959] hover:text-[#161616]"
                }`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          
          {tab === "apikeys"    && <ApiKeysTab />}
          {tab === "connectors" && <ConnectorsTab />}
        </div>
      </main>
    </>
  );
};

export default EnterprisePage;
