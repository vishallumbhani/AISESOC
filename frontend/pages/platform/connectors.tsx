import React, { useState, useEffect } from "react";
import Head from "next/head";
import PlatformShell from "../../components/PlatformShell";
import platformApi from "../../lib/platformApi";
import { hasPlatformToken, clearPlatformSession, startImpersonation, getImpersonatingOrg } from "../../lib/tokens";
import { FiPlus, FiX, FiCheck, FiRefreshCw, FiTrash2, FiLink, FiAlertCircle } from "react-icons/fi";

const CONNECTOR_ICONS: Record<string, string> = {
  openai: "🤖", azure_openai: "☁️", anthropic: "🔮",
  crewai: "👥", langgraph: "🕸️", mcp: "🔌", manual: "⚙️",
};

const STATUS_CLS: Record<string, string> = {
  ok:      "text-green-300 bg-green-900/30 border-green-700",
  error:   "text-red-300 bg-red-900/30 border-red-700",
  syncing: "text-yellow-300 bg-yellow-900/20 border-yellow-700",
};

const Connectors: React.FC = () => {
  const [connectors, setConnectors] = useState<any[]>([]);
  const [types, setTypes]           = useState<string[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [creating, setCreating]     = useState(false);
  const [testing, setTesting]       = useState<string | null>(null);
  const [syncing, setSyncing]       = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", connector_type: "openai", config: { api_key: "" } });

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const [c, t] = await Promise.all([
        platformApi.get("/connectors"),
        platformApi.get("/connectors/types"),
      ]);
      setConnectors(c.data);
      setTypes(t.data.types || []);
    } catch {
      setError("Failed to load connectors. Ensure the connectors router is registered in main.py.");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.name.trim()) return;
    try {
      const r = await platformApi.post("/connectors", form);
      setConnectors(c => [r.data, ...c]);
      setCreating(false);
      setForm({ name: "", connector_type: "openai", config: { api_key: "" } });
    } catch (e: any) { setError(e.response?.data?.detail || "Failed to create connector"); }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const r = await platformApi.post(`/connectors/${id}/test`);
      setConnectors(c => c.map(x => x.id === id ? { ...x, sync_status: r.data.connected ? "ok" : "error" } : x));
    } catch { setError("Connection test failed"); }
    finally { setTesting(null); }
  };

  const handleSync = async (id: string) => {
    setSyncing(id);
    try {
      const r = await platformApi.post(`/connectors/${id}/sync`);
      setConnectors(c => c.map(x => x.id === id ? { ...x, agent_count: r.data.agents_found, sync_status: "ok", last_sync_at: new Date().toISOString() } : x));
    } catch (e: any) { setError(e.response?.data?.detail || "Sync failed"); }
    finally { setSyncing(null); }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete connector "${name}"?`)) return;
    try {
      await platformApi.delete(`/connectors/${id}`);
      setConnectors(c => c.filter(x => x.id !== id));
    } catch { setError("Failed to delete connector"); }
  };

  const fmtTs = (d?: string) => d
    ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Never";

  return (
    <>
      <Head><title>Connectors — AI-SecOS Platform</title></Head>
      <PlatformShell>
        <div className="p-6 max-w-screen-xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-white">Connectors</h1>
              <p className="text-gray-500 text-sm mt-0.5">
                Connect AI platforms once — available to all customer organizations
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={load} className="p-2.5 bg-gray-900 border border-gray-800 text-gray-400 hover:text-white rounded-xl">
                <FiRefreshCw className="w-4 h-4" />
              </button>
              <button onClick={() => setCreating(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm">
                <FiPlus className="w-4 h-4" /> Add Connector
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 bg-red-900/30 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm flex items-start gap-2">
              <FiAlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
              <button onClick={() => setError(null)} className="ml-auto"><FiX className="w-4 h-4" /></button>
            </div>
          )}

          {/* Create form */}
          {creating && (
            <div className="bg-gray-900 border border-indigo-700 rounded-xl p-5 mb-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white">New Connector</h3>
                <button onClick={() => setCreating(false)}><FiX className="w-4 h-4 text-gray-400" /></button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Name *</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Production OpenAI"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Platform Type</label>
                  <select value={form.connector_type} onChange={e => setForm({ ...form, connector_type: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                    {(types.length > 0 ? types : ["openai", "azure_openai", "anthropic", "manual"]).map(t => (
                      <option key={t} value={t}>{CONNECTOR_ICONS[t] || "🔌"} {t}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-400 mb-1">API Key (optional — can be added later)</label>
                  <input type="password" value={form.config.api_key}
                    onChange={e => setForm({ ...form, config: { ...form.config, api_key: e.target.value } })}
                    placeholder="sk-..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleCreate} disabled={!form.name.trim()}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm">
                  Create Connector
                </button>
                <button onClick={() => setCreating(false)}
                  className="bg-gray-800 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-700">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : connectors.length === 0 ? (
            <div className="bg-gray-900 border border-dashed border-gray-700 rounded-xl p-12 text-center">
              <FiLink className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-400 font-medium">No connectors configured</p>
              <p className="text-gray-600 text-sm mt-1">Add your first AI platform connector to start discovering agents.</p>
              <button onClick={() => setCreating(true)}
                className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
                Add Connector
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {connectors.map(c => (
                <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-2xl flex-shrink-0">{CONNECTOR_ICONS[c.connector_type] || "🔌"}</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="font-semibold text-white truncate">{c.name}</p>
                          <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full flex-shrink-0">
                            {c.connector_type}
                          </span>
                          {c.sync_status && (
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold flex-shrink-0 ${STATUS_CLS[c.sync_status] || "text-gray-400 bg-gray-800 border-gray-600"}`}>
                              {c.sync_status}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {c.agent_count || 0} agents discovered
                          {c.last_sync_at && ` · Last sync: ${fmtTs(c.last_sync_at)}`}
                        </p>
                        {c.sync_error && (
                          <p className="text-xs text-red-400 mt-0.5">{c.sync_error}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                      <button onClick={() => handleTest(c.id)} disabled={testing === c.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-400 hover:text-teal-400 border border-gray-700 hover:border-teal-700 rounded-lg disabled:opacity-40 transition-colors">
                        <FiCheck className="w-3 h-3" />
                        {testing === c.id ? "Testing…" : "Test"}
                      </button>
                      <button onClick={() => handleSync(c.id)} disabled={syncing === c.id}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-400 hover:text-indigo-400 border border-gray-700 hover:border-indigo-700 rounded-lg disabled:opacity-40 transition-colors">
                        <FiRefreshCw className={`w-3 h-3 ${syncing === c.id ? "animate-spin" : ""}`} />
                        {syncing === c.id ? "Syncing…" : "Sync Agents"}
                      </button>
                      <button onClick={() => handleDelete(c.id, c.name)}
                        className="p-1.5 text-gray-500 hover:text-red-400 border border-gray-700 hover:border-red-700 rounded-lg transition-colors">
                        <FiTrash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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

export default Connectors;
