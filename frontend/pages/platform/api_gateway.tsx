import React, { useState, useEffect } from "react";
import Head from "next/head";
import PlatformShell from "../../components/PlatformShell";
import platformApi from "../../lib/platformApi";
import orgApi from "../../lib/orgApi";
import { hasPlatformToken, clearPlatformSession, startImpersonation, getImpersonatingOrg } from "../../lib/tokens";
import {
  FiKey, FiPlus, FiTrash2, FiRefreshCw, FiCopy,
  FiX, FiAlertCircle, FiCheckCircle, FiShield,
} from "react-icons/fi";

const SCOPE_GROUPS = [
  { group: "Runtime",   scopes: ["runtime:read", "runtime:write"] },
  { group: "Policy",    scopes: ["policy:read", "policy:write"] },
  { group: "Incidents", scopes: ["incident:read"] },
  { group: "Audit",     scopes: ["audit:read", "audit:export"] },
  { group: "Reports",   scopes: ["report:read", "report:generate"] },
  { group: "Agents",    scopes: ["agent:read"] },
  { group: "Assets",    scopes: ["asset:read"] },
];
const ALL_SCOPES = SCOPE_GROUPS.flatMap(g => g.scopes);

const RATE_LIMITS = [
  { tier: "Free",       rps: 10,  rpm: 100,  rpd: 1000  },
  { tier: "Starter",    rps: 50,  rpm: 500,  rpd: 10000 },
  { tier: "Pro",        rps: 200, rpm: 2000, rpd: 50000 },
  { tier: "Enterprise", rps: 999, rpm: 9999, rpd: 999999 },
];

const ApiGateway: React.FC = () => {
  const [keys, setKeys]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [tab, setTab]         = useState<"keys" | "rate-limits" | "scopes">("keys");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey]   = useState<string | null>(null);
  const [copied, setCopied]   = useState(false);
  const [form, setForm] = useState({ name: "", scopes: [] as string[], expires_at: "" });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await orgApi.get("/api-keys");
      setKeys(r.data);
    } catch {
      setError("Failed to load API keys. Ensure the api-keys router is registered.");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim() || form.scopes.length === 0) return;
    try {
      const r = await orgApi.post("/api-keys", {
        name: form.name,
        scopes: form.scopes,
        expires_at: form.expires_at || null,
      });
      setNewKey(r.data.raw_key);
      setKeys(k => [r.data, ...k]);
      setCreating(false);
      setForm({ name: "", scopes: [], expires_at: "" });
    } catch (e: any) { setError(e.response?.data?.detail || "Failed to create API key"); }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    try {
      await orgApi.delete(`/api-keys/${id}`);
      setKeys(k => k.map(x => x.id === id ? { ...x, is_active: false } : x));
    } catch { setError("Failed to revoke key"); }
  };

  const handleRotate = async (id: string) => {
    try {
      const r = await orgApi.post(`/api-keys/${id}/rotate`);
      setNewKey(r.data.raw_key);
      setKeys(k => k.map(x => x.id === id ? r.data : x));
    } catch { setError("Failed to rotate key"); }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fmtTs = (d?: string) => d
    ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Never";

  const TABS = [
    { id: "keys",        label: `API Keys (${keys.length})` },
    { id: "rate-limits", label: "Rate Limits" },
    { id: "scopes",      label: "Scope Reference" },
  ] as const;

  return (
    <>
      <Head><title>API Gateway — AI-SecOS Platform</title></Head>
      <PlatformShell>
        <div className="p-6 max-w-screen-xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-white">API Gateway</h1>
              <p className="text-gray-500 text-sm mt-0.5">Platform API keys, rate limits, and scope management</p>
            </div>
            <button onClick={load} className="p-2.5 bg-gray-900 border border-gray-800 text-gray-400 hover:text-white rounded-xl">
              <FiRefreshCw className="w-4 h-4" />
            </button>
          </div>

          {error && (
            <div className="mb-4 bg-red-900/30 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm flex items-start gap-2">
              <FiAlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
              <button onClick={() => setError(null)} className="ml-auto"><FiX className="w-4 h-4" /></button>
            </div>
          )}

          {/* New key revealed */}
          {newKey && (
            <div className="mb-5 bg-green-900/20 border border-green-700 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <FiCheckCircle className="w-4 h-4 text-green-400" />
                <p className="text-green-300 font-semibold text-sm">API key created — copy it now, it won't be shown again</p>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-950 text-green-400 font-mono text-xs px-3 py-2.5 rounded-lg break-all">
                  {newKey}
                </code>
                <button onClick={() => copy(newKey)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 border border-gray-700 text-gray-300 hover:text-white rounded-lg text-xs">
                  {copied ? <FiCheckCircle className="w-3.5 h-3.5 text-green-400" /> : <FiCopy className="w-3.5 h-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <button onClick={() => setNewKey(null)} className="mt-2 text-xs text-gray-500 hover:text-gray-300">
                I've saved this key — dismiss
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-gray-800 mb-5">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className={`px-5 py-3 text-sm font-medium transition-colors ${tab === t.id ? "border-b-2 border-indigo-500 text-indigo-400" : "text-gray-500 hover:text-white"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* API Keys tab */}
          {tab === "keys" && (
            <>
              <div className="flex justify-between items-center mb-4">
                <p className="text-sm text-gray-400">{keys.filter(k => k.is_active).length} active keys</p>
                <button onClick={() => setCreating(!creating)}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl text-sm">
                  <FiPlus className="w-4 h-4" /> New API Key
                </button>
              </div>

              {creating && (
                <div className="bg-gray-900 border border-indigo-700 rounded-xl p-5 mb-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-white">Create API Key</h3>
                    <button onClick={() => setCreating(false)}><FiX className="w-4 h-4 text-gray-400" /></button>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Key Name *</label>
                      <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                        placeholder="Production Integration Key"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-2">Scopes *</label>
                      <div className="grid grid-cols-3 gap-2">
                        {ALL_SCOPES.map(s => (
                          <label key={s} className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={form.scopes.includes(s)}
                              onChange={e => setForm({ ...form, scopes: e.target.checked ? [...form.scopes, s] : form.scopes.filter(x => x !== s) })}
                              className="rounded border-gray-600 bg-gray-800 text-indigo-500" />
                            <span className="text-xs text-gray-300 font-mono">{s}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Expiry (optional)</label>
                      <input type="datetime-local" value={form.expires_at}
                        onChange={e => setForm({ ...form, expires_at: e.target.value })}
                        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleCreate} disabled={!form.name.trim() || form.scopes.length === 0}
                        className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm">
                        Create Key
                      </button>
                      <button onClick={() => setCreating(false)}
                        className="bg-gray-800 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : keys.length === 0 ? (
                <div className="bg-gray-900 border border-dashed border-gray-700 rounded-xl p-10 text-center">
                  <FiKey className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                  <p className="text-gray-400">No API keys created yet.</p>
                </div>
              ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-800/40 border-b border-gray-800">
                      <tr>{["Name", "Prefix", "Scopes", "Status", "Last Used", "Expires", "Actions"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {keys.map(k => (
                        <tr key={k.id} className={`hover:bg-gray-800/30 ${!k.is_active ? "opacity-50" : ""}`}>
                          <td className="px-4 py-3 font-medium text-white">{k.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-400">{k.key_prefix}***</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {(k.scopes || []).slice(0, 3).map((s: string) => (
                                <span key={s} className="text-xs bg-gray-800 border border-gray-700 text-gray-300 px-1.5 py-0.5 rounded font-mono">{s}</span>
                              ))}
                              {(k.scopes || []).length > 3 && (
                                <span className="text-xs text-gray-500">+{k.scopes.length - 3}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold ${k.is_active ? "text-green-400" : "text-gray-500"}`}>
                              {k.is_active ? "Active" : "Revoked"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{fmtTs(k.last_used_at)}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{k.expires_at ? fmtTs(k.expires_at) : "Never"}</td>
                          <td className="px-4 py-3">
                            {k.is_active && (
                              <div className="flex gap-1">
                                <button onClick={() => handleRotate(k.id)} title="Rotate"
                                  className="p-1.5 text-gray-500 hover:text-yellow-400 hover:bg-gray-800 rounded">
                                  <FiRefreshCw className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleRevoke(k.id)} title="Revoke"
                                  className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded">
                                  <FiTrash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* Rate Limits tab */}
          {tab === "rate-limits" && (
            <div className="space-y-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800/40 border-b border-gray-800">
                    <tr>{["Plan Tier", "Req / Second", "Req / Minute", "Req / Day", "Notes"].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {RATE_LIMITS.map(r => (
                      <tr key={r.tier} className="hover:bg-gray-800/30">
                        <td className="px-4 py-3 font-semibold text-white">{r.tier}</td>
                        <td className="px-4 py-3 text-indigo-400 font-mono">{r.rps === 999 ? "Unlimited" : r.rps}</td>
                        <td className="px-4 py-3 text-indigo-400 font-mono">{r.rpm === 9999 ? "Unlimited" : r.rpm}</td>
                        <td className="px-4 py-3 text-indigo-400 font-mono">{r.rpd === 999999 ? "Unlimited" : r.rpd.toLocaleString()}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {r.tier === "Enterprise" ? "Custom limits available on request" : "Burst allowed up to 2× for 10s"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-sm text-gray-400">
                <p className="font-semibold text-white mb-1">Rate Limit Headers</p>
                <p>Every API response includes: <code className="text-indigo-400 font-mono text-xs">X-RateLimit-Limit</code>, <code className="text-indigo-400 font-mono text-xs">X-RateLimit-Remaining</code>, <code className="text-indigo-400 font-mono text-xs">X-RateLimit-Reset</code></p>
              </div>
            </div>
          )}

          {/* Scopes tab */}
          {tab === "scopes" && (
            <div className="space-y-4">
              {SCOPE_GROUPS.map(g => (
                <div key={g.group} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-800">
                    <h3 className="font-semibold text-white text-sm">{g.group}</h3>
                  </div>
                  <div className="divide-y divide-gray-800">
                    {g.scopes.map(s => {
                      const [resource, action] = s.split(":");
                      return (
                        <div key={s} className="flex items-center gap-4 px-4 py-3">
                          <code className="text-indigo-400 font-mono text-sm w-40 flex-shrink-0">{s}</code>
                          <span className="text-gray-400 text-sm">
                            {action === "read" ? `View ${resource} data` :
                             action === "write" ? `Create and modify ${resource}` :
                             action === "export" ? `Export ${resource} records` :
                             action === "generate" ? `Generate ${resource}` :
                             `${action} access to ${resource}`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PlatformShell>
    </>
  );
};

export default ApiGateway;
