import React, { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import orgApi from "../lib/orgApi";
import { getOrgToken } from "../lib/tokens";
import {
  FiBarChart2, FiDownload, FiPlay, FiRefreshCw,
  FiCheckCircle, FiAlertTriangle, FiShield, FiX, FiLoader,
} from "react-icons/fi";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const FRAMEWORKS = [
  { id: "SOC2",        name: "SOC 2 Type II",                     color: "text-blue-600",   bg: "bg-blue-900/20 border-blue-800/60" },
  { id: "ISO27001",    name: "ISO/IEC 27001:2022",                color: "text-purple-600", bg: "bg-purple-900/20 border-purple-800/60" },
  { id: "NIST_AI_RMF", name: "NIST AI Risk Management Framework", color: "text-teal-600",   bg: "bg-teal-900/20 border-teal-800/60" },
  { id: "OWASP_LLM",  name: "OWASP LLM Top 10",                  color: "text-orange-600", bg: "bg-orange-900/20 border-orange-800/60" },
];

/**
 * CSV download using fetch() with Authorization header.
 * Axios causes CORS preflight failures on streaming responses.
 * fetch() with credentials in headers bypasses this cleanly.
 */
async function downloadCsvFile(url: string, filename: string): Promise<string | null> {
  const token = getOrgToken();
  try {
    const res = await fetch(`${BASE}/api/v1${url}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/csv",
      },
    });
    if (!res.ok) {
      const text = await res.text();
      return `Download failed: ${res.status} — ${text.slice(0, 200)}`;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
    return null; // success
  } catch (e: any) {
    return `Download error: ${e.message}`;
  }
}

const Reports: React.FC = () => {
  const router = useRouter();
  const [tab, setTab]               = useState<"executive" | "compliance">("executive");
  const [days, setDays]             = useState(30);
  const [execReport, setExecReport] = useState<any>(null);
  const [summary, setSummary]       = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (!getOrgToken()) { router.push("/login"); return; }
    loadSummary();
  }, []);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const r = await orgApi.get("/reports/summary");
      setSummary(r.data.frameworks || []);
    } catch {
      setSummary(FRAMEWORKS.map(f => ({ framework: f.id, score_pct: 0, passed: 0, total_controls: 3 })));
    } finally {
      setLoading(false);
    }
  }, []);

  const generateExec = async () => {
    setGenerating(true);
    setError(null);
    try {
      const r = await orgApi.get(`/reports/executive?days=${days}`);
      setExecReport(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to generate executive report.");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = async (type: string) => {
    setDownloading(type);
    setError(null);
    const url = type === "executive"
      ? `/reports/executive?days=${days}&format=csv`
      : `/reports/compliance/${type}?days=${days}&format=csv`;
    const filename = `${type}_report_${days}d.csv`;
    const err = await downloadCsvFile(url, filename);
    if (err) setError(err);
    setDownloading(null);
  };

  const ScoreBadge = ({ pct }: { pct: number }) => {
    const color = pct >= 80 ? "text-green-600" : pct >= 60 ? "text-amber-600" : "text-red-600";
    const bar   = pct >= 80 ? "bg-green-500"   : pct >= 60 ? "bg-yellow-500"   : "bg-red-500";
    return (
      <div className="text-right">
        <p className={`text-2xl font-bold ${color}`}>{pct}%</p>
        <div className="w-20 bg-slate-100 rounded-full h-1 mt-1 ml-auto">
          <div className={`h-1 rounded-full ${bar}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  return (
    <>
      <Head><title>Reports — AI-SecOS</title></Head>
      <main className="min-h-screen py-8">
        <div className="max-w-6xl mx-auto px-4">

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <FiBarChart2 className="w-5 h-5 text-slate-900" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
              <p className="text-slate-400 text-xs mt-0.5">Executive summaries and compliance evidence</p>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 flex items-start gap-2 bg-red-900/30 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm">
              <FiAlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)}><FiX className="w-4 h-4 opacity-60 hover:opacity-100" /></button>
            </div>
          )}

          {/* Period + Tabs bar */}
          <div className="bg-white border border-slate-200 rounded-xl px-5 py-3 mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex border-b border-transparent gap-1">
              {[
                { id: "executive",  label: "Executive Report" },
                { id: "compliance", label: "Compliance Reports" },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id as any)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    tab === t.id
                      ? "bg-indigo-600 text-slate-900"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                  }`}>{t.label}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Period:</span>
              {[7, 30, 90].map(d => (
                <button key={d} onClick={() => setDays(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    days === d ? "bg-indigo-600 text-slate-900" : "bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200"
                  }`}>{d}d</button>
              ))}
            </div>
          </div>

          {/* ── Executive Report ── */}
          {tab === "executive" && (
            <div className="space-y-5">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="font-bold text-slate-900 text-lg">Executive Security Report</h2>
                    <p className="text-slate-500 text-sm">Blocked requests, incidents, and risk posture — last {days} days</p>
                  </div>
                  <div className="flex gap-2">
                    {execReport && (
                      <button
                        onClick={() => handleDownload("executive")}
                        disabled={downloading === "executive"}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-600 hover:text-slate-900 rounded-lg text-sm disabled:opacity-50"
                      >
                        {downloading === "executive"
                          ? <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                          : <FiDownload className="w-3.5 h-3.5" />}
                        CSV
                      </button>
                    )}
                    <button onClick={generateExec} disabled={generating}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-slate-900 rounded-lg text-sm font-medium">
                      {generating
                        ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Generating…</>
                        : <><FiPlay className="w-3.5 h-3.5" /> Generate</>}
                    </button>
                  </div>
                </div>

                {!execReport ? (
                  <div className="border border-dashed border-slate-200 rounded-xl p-10 text-center">
                    <FiBarChart2 className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                    <p className="text-slate-400 font-medium">Click Generate to create the executive report</p>
                    <p className="text-slate-500 text-sm mt-1">Analyzes runtime events, incidents, and risk scores</p>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* KPI grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                      {[
                        { label: "Total Requests",   value: execReport.summary?.total_requests    ?? execReport.total_events ?? 0,   color: "text-blue-600" },
                        { label: "Blocked",          value: execReport.summary?.blocked_requests  ?? execReport.deny_events  ?? 0,   color: "text-red-600" },
                        { label: "Block Rate",       value: `${execReport.summary?.block_rate_pct ?? execReport.deny_rate ?? 0}%`,   color: "text-orange-600" },
                        { label: "Open Incidents",   value: execReport.summary?.open_incidents    ?? execReport.open_incidents ?? 0, color: "text-amber-600" },
                        { label: "High Risk Assets", value: execReport.summary?.high_risk_assets  ?? 0,                             color: "text-red-600" },
                        { label: "Period",           value: `${execReport.period_days ?? days} days`,                               color: "text-slate-500" },
                      ].map(s => (
                        <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                          <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Top agents */}
                    {(execReport.top_violating_agents?.length > 0 || execReport.top_agents?.length > 0) && (
                      <div>
                        <p className="text-xs text-slate-400 uppercase font-semibold mb-2 tracking-wide">Top Violating Agents</p>
                        <div className="space-y-1.5">
                          {(execReport.top_violating_agents || execReport.top_agents || []).map((a: any, i: number) => (
                            <div key={i} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-2.5">
                              <span className="text-sm text-slate-900">🤖 {a.agent || a.agent_name}</span>
                              <span className="text-sm font-bold text-red-600">{a.deny_count ?? a.incidents} denials</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Top assets */}
                    {execReport.top_assets?.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-400 uppercase font-semibold mb-2 tracking-wide">Top Targeted Assets</p>
                        <div className="space-y-1.5">
                          {execReport.top_assets.map((a: any, i: number) => (
                            <div key={i} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-2.5">
                              <span className="text-sm text-slate-900">🗄️ {a.asset || a.asset_name}</span>
                              <span className="text-sm font-bold text-orange-600">{a.deny_count ?? a.incidents} events</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Compliance Reports ── */}
          {tab === "compliance" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-slate-500 text-sm">Compliance scores based on live runtime, policy, and incident data.</p>
                <button onClick={loadSummary}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-500 hover:text-slate-900 rounded-lg text-xs">
                  <FiRefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
              </div>

              {loading ? (
                <div className="flex justify-center py-20">
                  <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {FRAMEWORKS.map(fw => {
                    const s = summary.find(x => x.framework === fw.id);
                    const pct = s?.score_pct ?? 0;
                    const isDownloading = downloading === fw.id;
                    return (
                      <div key={fw.id} className={`border rounded-xl p-5 ${fw.bg}`}>
                        {/* Framework header */}
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className={`font-bold text-base ${fw.color}`}>{fw.name}</h3>
                            <p className="text-slate-400 text-xs mt-0.5">
                              {s?.total_controls ?? 3} controls evaluated
                            </p>
                          </div>
                          {!s?.error && <ScoreBadge pct={pct} />}
                        </div>

                        {s?.error ? (
                          <div className="flex items-center gap-2 text-red-600 text-xs bg-red-900/20 rounded-lg px-3 py-2 mb-3">
                            <FiAlertTriangle className="w-3.5 h-3.5" /> {s.error}
                          </div>
                        ) : s ? (
                          <div className="mb-4">
                            {/* Progress bar */}
                            <div className="w-full bg-slate-100 rounded-full h-2 mb-2">
                              <div
                                className={`h-2 rounded-full transition-all ${pct >= 80 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-500"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <p className="text-xs text-slate-400">
                              {s.passed ?? 0} of {s.total_controls ?? 3} controls passing
                            </p>
                          </div>
                        ) : (
                          <div className="mb-4 text-slate-500 text-xs">No data yet — run a compliance check</div>
                        )}

                        {/* Status icons */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className={`flex items-center gap-1.5 text-xs ${pct >= 70 ? "text-green-600" : "text-red-600"}`}>
                            {pct >= 70 ? <FiCheckCircle className="w-3.5 h-3.5" /> : <FiAlertTriangle className="w-3.5 h-3.5" />}
                            {pct >= 70 ? "Compliant" : "Needs attention"}
                          </div>
                          <div className="text-slate-500 text-xs">•</div>
                          <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                            <FiShield className="w-3.5 h-3.5" />
                            {fw.id}
                          </div>
                        </div>

                        {/* Download button */}
                        <button
                          onClick={() => handleDownload(fw.id)}
                          disabled={isDownloading}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-100 hover:bg-slate-200/60 border border-slate-200/60 text-slate-600 hover:text-slate-900 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                          {isDownloading
                            ? <><div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" /> Downloading…</>
                            : <><FiDownload className="w-3.5 h-3.5" /> Download CSV Report</>}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </>
  );
};

export default Reports;
