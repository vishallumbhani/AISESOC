import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { getOrgToken } from "../lib/tokens";
import orgApi from "../lib/orgApi";
import {
  FiClipboard, FiDownload, FiSearch, FiFilter, FiRefreshCw,
  FiAlertTriangle, FiX, FiChevronDown, FiChevronUp, FiShield,
  FiActivity, FiKey, FiUser,
} from "react-icons/fi";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function downloadCsvFetch(params: Record<string, string>, token: string) {
  const qs = new URLSearchParams(params).toString();
  fetch(`${BASE}/api/v1/audit-logs/export/csv?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(async r => {
      if (!r.ok) throw new Error(`${r.status}`);
      const blob = await r.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "audit_logs.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    })
    .catch(e => alert(`Download failed: ${e.message}`));
}

const ACTION_COLORS: Record<string, string> = {
  connector_runtime_decision: "text-blue-600",
  runtime_decision:           "text-blue-600",
  incident_auto_created:      "text-red-600",
  incident_updated:           "text-orange-600",
  policy_created:             "text-green-600",
  policy_updated:             "text-amber-600",
  policy_deleted:             "text-red-600",
  agent_created:              "text-purple-600",
  asset_created:              "text-teal-600",
};

const DECISION_CLASSES: Record<string, string> = {
  ALLOW: "bg-green-50 text-green-600 border border-green-800",
  DENY:  "bg-red-50 text-red-600 border border-red-800",
};

const AuditLogsPage: React.FC = () => {
  const router = useRouter();
  const [logs, setLogs]         = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Filters
  const [search, setSearch]         = useState("");
  const [actionFilter, setAction]   = useState("");
  const [decisionFilter, setDecision] = useState("");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");
  const [limit, setLimit]           = useState(100);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = { limit };
      if (actionFilter)   params.action    = actionFilter;
      if (decisionFilter) params.decision  = decisionFilter;
      if (dateFrom)       params.date_from = dateFrom;
      if (dateTo)         params.date_to   = dateTo;

      const [logsRes, analyticsRes] = await Promise.all([
        orgApi.get("/audit-logs", { params }),
        orgApi.get("/audit-logs/analytics/summary"),
      ]);
      setLogs(Array.isArray(logsRes.data) ? logsRes.data : []);
      setAnalytics(analyticsRes.data);
    } catch (e: any) {
      setError("Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  }, [actionFilter, decisionFilter, dateFrom, dateTo, limit]);

  useEffect(() => {
    if (!getOrgToken()) { router.push("/login"); return; }
    load();
  }, [actionFilter, decisionFilter, limit]);

  const handleSearch = (e: React.FormEvent) => { e.preventDefault(); load(); };

  const handleDownload = () => {
    setDownloading(true);
    const token = getOrgToken() || "";
    const params: Record<string, string> = {};
    if (actionFilter) params.action = actionFilter;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    downloadCsvFetch(params, token);
    setTimeout(() => setDownloading(false), 2000);
  };

  const fmt = (iso: string) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  // Client-side search filter
  const filtered = search
    ? logs.filter(l =>
        l.action?.toLowerCase().includes(search.toLowerCase()) ||
        (l.changes?.agent || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.changes?.asset || "").toLowerCase().includes(search.toLowerCase()) ||
        (l.changes?.correlation_id || "").toLowerCase().includes(search.toLowerCase())
      )
    : logs;

  const analyticsCards = analytics ? [
    { label: "Total Events",    value: analytics.total         ?? 0, color: "text-blue-600",   icon: <FiClipboard className="w-4 h-4" /> },
    { label: "Policy Changes",  value: analytics.policy_changes ?? 0, color: "text-green-600",  icon: <FiShield className="w-4 h-4" /> },
    { label: "Access Denials",  value: analytics.access_denials ?? 0, color: "text-red-600",    icon: <FiAlertTriangle className="w-4 h-4" /> },
    { label: "Incident Updates",value: analytics.incident_updates ?? 0, color: "text-orange-600", icon: <FiActivity className="w-4 h-4" /> },
  ] : [];

  return (
    <>
      <Head><title>Audit Logs — AI-SecOS</title></Head>
      <main className="min-h-screen py-8">
        <div className="max-w-7xl mx-auto px-4">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
                <FiClipboard className="w-5 h-5 text-slate-900" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Audit Logs</h1>
                <p className="text-slate-400 text-xs mt-0.5">Immutable record of all platform actions</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={load}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-500 hover:text-slate-900 rounded-lg text-sm">
                <FiRefreshCw className="w-4 h-4" /> Refresh
              </button>
              <button onClick={handleDownload} disabled={downloading}
                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-slate-900 rounded-lg text-sm disabled:opacity-50">
                <FiDownload className="w-4 h-4" />
                {downloading ? "Downloading…" : "Export CSV"}
              </button>
            </div>
          </div>

          {/* Analytics cards */}
          {analytics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              {analyticsCards.map(c => (
                <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                  <div className={`${c.color} opacity-70`}>{c.icon}</div>
                  <div>
                    <p className={`text-xl font-bold ${c.color}`}>{c.value.toLocaleString()}</p>
                    <p className="text-slate-400 text-xs">{c.label}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4 flex flex-wrap gap-3 items-end">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative">
                <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search agent, asset, correlation…"
                  className="pl-8 bg-white border border-slate-200 text-slate-700 placeholder-slate-400 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              </div>
              <button type="submit" className="px-3 py-1.5 bg-blue-600 text-slate-900 text-sm rounded-lg hover:bg-blue-700">Search</button>
            </form>

            <select value={actionFilter} onChange={e => setAction(e.target.value)}
              className="bg-white border border-slate-200 text-slate-600 rounded-lg px-3 py-1.5 text-sm">
              <option value="">All Actions</option>
              <option value="connector_runtime_decision">Connector Decision</option>
              <option value="runtime_decision">Runtime Decision</option>
              <option value="incident_auto_created">Incident Created</option>
              <option value="incident_updated">Incident Updated</option>
              <option value="policy_created">Policy Created</option>
              <option value="policy_updated">Policy Updated</option>
            </select>

            <select value={decisionFilter} onChange={e => setDecision(e.target.value)}
              className="bg-white border border-slate-200 text-slate-600 rounded-lg px-3 py-1.5 text-sm">
              <option value="">All Decisions</option>
              <option value="ALLOW">Allow</option>
              <option value="DENY">Deny</option>
            </select>

            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="bg-white border border-slate-200 text-slate-600 rounded-lg px-3 py-1.5 text-sm" />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="bg-white border border-slate-200 text-slate-600 rounded-lg px-3 py-1.5 text-sm" />

            <select value={limit} onChange={e => setLimit(Number(e.target.value))}
              className="bg-white border border-slate-200 text-slate-600 rounded-lg px-3 py-1.5 text-sm">
              <option value={50}>50 rows</option>
              <option value={100}>100 rows</option>
              <option value={250}>250 rows</option>
              <option value={500}>500 rows</option>
            </select>

            {(actionFilter || decisionFilter || dateFrom || dateTo || search) && (
              <button onClick={() => { setAction(""); setDecision(""); setDateFrom(""); setDateTo(""); setSearch(""); }}
                className="text-xs text-blue-600 hover:text-blue-500 flex items-center gap-1">
                <FiX className="w-3 h-3" /> Clear filters
              </button>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4 flex items-center gap-2">
              <FiAlertTriangle className="w-4 h-4" /> {error}
            </div>
          )}

          {/* Table */}
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
              <FiClipboard className="w-12 h-12 mx-auto mb-4 text-gray-700" />
              <p className="text-slate-400 font-medium">No audit logs found</p>
              <p className="text-slate-500 text-sm mt-1">
                {search || actionFilter || decisionFilter ? "Try adjusting filters" : "Logs appear as platform actions occur"}
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <span className="text-slate-500 text-sm">{filtered.length.toLocaleString()} entries</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                      <th className="px-4 py-3 font-medium">Action</th>
                      <th className="px-4 py-3 font-medium">Agent / Asset</th>
                      <th className="px-4 py-3 font-medium">Decision</th>
                      <th className="px-4 py-3 font-medium">Correlation</th>
                      <th className="px-4 py-3 font-medium">Time</th>
                      <th className="px-4 py-3 font-medium w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filtered.map(log => {
                      const isOpen = expanded === log.id;
                      const changes = log.changes || {};
                      const decision = changes.decision || (log.meta_data || {}).decision;
                      const corrId = changes.correlation_id || log.correlation_id;
                      return (
                        <React.Fragment key={log.id}>
                          <tr
                            className="hover:bg-slate-50 cursor-pointer"
                            onClick={() => setExpanded(isOpen ? null : log.id)}
                          >
                            <td className="px-4 py-3">
                              <span className={`font-medium ${ACTION_COLORS[log.action] || "text-slate-600"}`}>
                                {log.action?.replace(/_/g, " ")}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-xs">
                              {changes.agent && <div className="text-slate-600">🤖 {changes.agent}</div>}
                              {changes.asset && <div className="text-slate-400">🗄️ {changes.asset}</div>}
                              {!changes.agent && !changes.asset && <span className="text-slate-500">{log.resource_type || "—"}</span>}
                            </td>
                            <td className="px-4 py-3">
                              {decision ? (
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${DECISION_CLASSES[decision] || "text-slate-500"}`}>
                                  {decision}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3">
                              {corrId ? (
                                <span className="font-mono text-xs bg-blue-950 text-blue-600 px-1.5 py-0.5 rounded">
                                  {corrId}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{fmt(log.created_at)}</td>
                            <td className="px-4 py-3 text-slate-500 text-xs">
                              {isOpen ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-slate-50">
                              <td colSpan={6} className="px-6 py-4">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                                  {Object.entries(changes).filter(([, v]) => v).map(([k, v]) => (
                                    <div key={k} className="bg-slate-100 rounded-lg px-3 py-2">
                                      <p className="text-slate-400 mb-0.5 capitalize">{k.replace(/_/g, " ")}</p>
                                      <p className="text-slate-700 font-mono break-all">{String(v)}</p>
                                    </div>
                                  ))}
                                  <div className="bg-slate-100 rounded-lg px-3 py-2">
                                    <p className="text-slate-400 mb-0.5">Log ID</p>
                                    <p className="text-slate-500 font-mono text-xs">{log.id}</p>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
};

export default AuditLogsPage;
