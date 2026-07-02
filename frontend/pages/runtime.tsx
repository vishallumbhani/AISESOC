/**
 * pages/runtime.tsx
 *
 * Runtime events page — full list with filters, correlation IDs,
 * MITRE mapping, decision badges, and empty/loading/error states.
 * Uses getOrgToken() — never legacy "token".
 */
import React, { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import LoadingSpinner from "../components/LoadingSpinner";
import { getOrgToken } from "../lib/tokens";
import orgApi from "../lib/orgApi";
import {
  FiActivity, FiCheckCircle, FiXCircle, FiFilter,
  FiRefreshCw, FiSearch, FiAlertTriangle, FiLink,
} from "react-icons/fi";

interface RuntimeEvent {
  id:              string;
  agent_name:      string | null;
  asset_name:      string | null;
  end_user_email:  string | null;
  event_type:      string;
  action:          string;
  status:          string;
  session_id:      string | null;
  prompt_preview:  string | null;
  source_ip:       string | null;
  created_at:      string;
  correlation_id:  string | null;
  matched_policy:  string | null;
  reason:          string | null;
  prompt_category: string | null;
  mitre_technique: string | null;
}

const DECISIONS = ["", "allow", "deny"];
const PAGE_SIZE = 50;

const RuntimePage: React.FC = () => {
  const router = useRouter();
  const [events, setEvents]     = useState<RuntimeEvent[]>([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [offset, setOffset]     = useState(0);
  const [decision, setDecision] = useState("");
  const [search, setSearch]     = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetch = useCallback(async (off = 0) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = { limit: PAGE_SIZE, offset: off };
      if (decision) params.decision = decision;
      if (search)   params.search   = search;
      const res = await orgApi.get("/runtime/events", { params });
      setEvents(res.data?.items || []);
      setTotal(res.data?.total || 0);
      setOffset(off);
    } catch (e: any) {
      setError("Failed to load runtime events.");
    } finally {
      setLoading(false);
    }
  }, [decision, search]);

  useEffect(() => {
    if (!getOrgToken()) { router.push("/login"); return; }
    fetch(0);
  }, [decision]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetch(0);
  };

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
  };

  const DecisionBadge = ({ status }: { status: string }) => {
    const isAllow = status?.toLowerCase() === "allow";
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
        isAllow ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
      }`}>
        {isAllow ? <FiCheckCircle className="w-3 h-3" /> : <FiXCircle className="w-3 h-3" />}
        {status?.toUpperCase()}
      </span>
    );
  };

  const CategoryBadge = ({ cat }: { cat: string | null }) => {
    if (!cat) return null;
    const map: Record<string, string> = {
      data_exfiltration:    "bg-red-100 text-red-700",
      credential_access:    "bg-red-100 text-red-700",
      harmful_content:      "bg-red-100 text-red-700",
      privilege_escalation: "bg-orange-100 text-orange-700",
      pii_access:           "bg-orange-100 text-orange-700",
      financial:            "bg-yellow-100 text-yellow-700",
      data_modification:    "bg-yellow-100 text-yellow-700",
      system_discovery:     "bg-blue-100 text-blue-700",
      reconnaissance:       "bg-blue-100 text-blue-700",
      general_query:        "bg-gray-100 text-slate-500",
    };
    return (
      <span className={`px-1.5 py-0.5 rounded text-xs ${map[cat] || "bg-gray-100 text-slate-500"}`}>
        {cat.replace(/_/g, " ")}
      </span>
    );
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <>
      <Head><title>Runtime Events — AI-SecOS</title></Head>
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">

          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <FiActivity className="w-6 h-6 text-blue-600" />
                Runtime Events
              </h1>
              <p className="text-slate-400 text-sm mt-0.5">
                {total.toLocaleString()} total events
              </p>
            </div>
            <button
              onClick={() => fetch(offset)}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-100 text-slate-500"
            >
              <FiRefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-center">
            <FiFilter className="w-4 h-4 text-slate-500" />
            <select
              value={decision}
              onChange={e => setDecision(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700"
            >
              <option value="">All decisions</option>
              <option value="allow">Allow only</option>
              <option value="deny">Deny only</option>
            </select>
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative">
                <FiSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search agent, asset..."
                  className="pl-8 text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 w-48"
                />
              </div>
              <button type="submit" className="px-3 py-1.5 bg-blue-600 text-slate-900 text-sm rounded-lg hover:bg-blue-700">
                Search
              </button>
            </form>
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex justify-center py-16"><LoadingSpinner /></div>
          ) : error ? (
            <div className="bg-white rounded-xl border border-red-200 p-8 text-center">
              <FiAlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
              <p className="text-gray-700">{error}</p>
              <button onClick={() => fetch(offset)} className="mt-4 px-4 py-2 bg-blue-600 text-slate-900 rounded-lg text-sm">Retry</button>
            </div>
          ) : events.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <FiActivity className="w-12 h-12 mx-auto mb-4 text-slate-200" />
              <h3 className="text-slate-700 font-semibold mb-2">No runtime events found</h3>
              <p className="text-slate-400 text-sm max-w-sm mx-auto">
                {decision || search
                  ? "No events match your current filters. Try adjusting the decision filter or clearing your search."
                  : "Runtime events appear here as soon as a connected AI agent makes a request through the AI-SecOS decision endpoint. Check your connector API key is active and routing traffic."}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wide">
                    <th className="px-4 py-3 font-medium">Agent</th>
                    <th className="px-4 py-3 font-medium">Asset</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Decision</th>
                    <th className="px-4 py-3 font-medium">Category</th>
                    <th className="px-4 py-3 font-medium">Correlation ID</th>
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {events.map((e) => (
                    <React.Fragment key={e.id}>
                      <tr
                        className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExpanded(expanded === e.id ? null : e.id)}
                      >
                        <td className="px-4 py-3 font-medium text-gray-800">{e.agent_name || "—"}</td>
                        <td className="px-4 py-3 text-slate-500">{e.asset_name || "—"}</td>
                        <td className="px-4 py-3 text-slate-400">{e.action}</td>
                        <td className="px-4 py-3"><DecisionBadge status={e.status} /></td>
                        <td className="px-4 py-3"><CategoryBadge cat={e.prompt_category} /></td>
                        <td className="px-4 py-3">
                          {e.correlation_id ? (
                            <span className="font-mono text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                              {e.correlation_id}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{formatTime(e.created_at)}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{expanded === e.id ? "▲" : "▼"}</td>
                      </tr>
                      {expanded === e.id && (
                        <tr className="bg-blue-50">
                          <td colSpan={8} className="px-6 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                              {e.reason && (
                                <div>
                                  <p className="text-slate-400 mb-0.5">Reason</p>
                                  <p className="text-gray-800 font-medium">{e.reason}</p>
                                </div>
                              )}
                              {e.matched_policy && (
                                <div>
                                  <p className="text-slate-400 mb-0.5">Policy</p>
                                  <p className="text-gray-800 font-medium">{e.matched_policy}</p>
                                </div>
                              )}
                              {e.mitre_technique && (
                                <div>
                                  <p className="text-slate-400 mb-0.5">MITRE ATT&CK</p>
                                  <p className="text-orange-700 font-mono">{e.mitre_technique}</p>
                                </div>
                              )}
                              {e.end_user_email && (
                                <div>
                                  <p className="text-slate-400 mb-0.5">End User</p>
                                  <p className="text-gray-800">{e.end_user_email}</p>
                                </div>
                              )}
                              {e.source_ip && (
                                <div>
                                  <p className="text-slate-400 mb-0.5">Source IP</p>
                                  <p className="text-gray-700 font-mono">{e.source_ip}</p>
                                </div>
                              )}
                              {e.session_id && (
                                <div>
                                  <p className="text-slate-400 mb-0.5">Session</p>
                                  <p className="text-gray-700 font-mono truncate">{e.session_id}</p>
                                </div>
                              )}
                              {e.prompt_preview && (
                                <div className="col-span-2 md:col-span-3">
                                  <p className="text-slate-400 mb-0.5">Prompt Preview</p>
                                  <p className="text-gray-700 bg-white rounded border border-gray-200 px-2 py-1 italic">
                                    {e.prompt_preview}
                                  </p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="border-t border-gray-100 px-4 py-3 flex items-center justify-between text-sm text-slate-400">
                  <span>Page {currentPage} of {totalPages} ({total.toLocaleString()} events)</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetch(Math.max(0, offset - PAGE_SIZE))}
                      disabled={offset === 0}
                      className="px-3 py-1 border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => fetch(offset + PAGE_SIZE)}
                      disabled={offset + PAGE_SIZE >= total}
                      className="px-3 py-1 border border-gray-200 rounded disabled:opacity-40 hover:bg-gray-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default RuntimePage;
