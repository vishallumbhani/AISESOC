import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import orgApi from "../lib/orgApi";
import { getOrgToken } from "../lib/tokens";
import {
  FiBarChart2, FiDownload, FiPlay, FiRefreshCw,
  FiCheckCircle, FiAlertTriangle, FiShield, FiX,
  FiInfo, FiChevronDown, FiChevronUp,
} from "react-icons/fi";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const FRAMEWORKS = [
  { id: "SOC2",        name: "SOC 2 Type II",                      controls: 3 },
  { id: "ISO27001",    name: "ISO/IEC 27001:2022",                 controls: 3 },
  { id: "NIST_AI_RMF", name: "NIST AI Risk Management Framework",  controls: 3 },
  { id: "OWASP_LLM",   name: "OWASP LLM Top 10",                   controls: 3 },
];

const STATUS_STYLE: Record<string, string> = {
  PASS:          "bg-green-50 text-green-700 border-green-200",
  PARTIAL:       "bg-amber-50 text-amber-700 border-amber-200",
  NEEDS_REVIEW:  "bg-red-50 text-red-700 border-red-200",
};

const Reports: React.FC = () => {
  const router = useRouter();
  const [tab, setTab]                 = useState<"executive"|"compliance">("executive");
  const [days, setDays]               = useState(30);
  const [execReport, setExecReport]   = useState<any>(null);
  const [summary, setSummary]         = useState<any[]>([]);
  const [generating, setGenerating]   = useState(false);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Per-framework detail (controls + rationale) loaded on expand
  const [expanded, setExpanded]   = useState<string | null>(null);
  const [detail, setDetail]       = useState<Record<string, any>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [methodology, setMethodology]     = useState<Record<string, any>>({});
  const [showMethodology, setShowMethodology] = useState<string | null>(null);

  useEffect(() => {
    if (!getOrgToken()) { router.push("/login"); return; }
    loadSummary();
  }, []);

  const loadSummary = async () => {
    setLoading(true);
    try {
      const r = await orgApi.get("/reports/summary");
      setSummary(r.data.frameworks || []);
    } catch {
      setSummary(FRAMEWORKS.map(f => ({ framework: f.id, score_pct: 0, passed: 0, total_controls: 0 })));
    } finally { setLoading(false); }
  };

  const generateExec = async () => {
    setGenerating(true); setError(null);
    try {
      const r = await orgApi.get(`/reports/executive?days=${days}`);
      setExecReport(r.data);
    } catch {
      setError("Failed to generate executive report.");
    } finally { setGenerating(false); }
  };

  // ── Fixed: CSV download via fetch() with Authorization header.
  // Axios + blob + custom auth interceptor triggers CORS preflight
  // failures on file-download responses in this deployment — fetch()
  // with a manually attached header avoids that entirely.
  const downloadCsv = async (type: string) => {
    setDownloading(type); setError(null);
    try {
      const token = getOrgToken();
      if (!token) { router.push("/login"); return; }

      const url = type === "executive"
        ? `${BASE}/api/v1/reports/executive?days=${days}&format=csv`
        : `${BASE}/api/v1/reports/compliance/${type}?days=${days}&format=csv`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 150)}` : ""}`);
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `${type}_report_${days}d.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);

      setSuccess(`${type === "executive" ? "Executive" : type} report downloaded.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(`Download failed: ${e.message || "Network error — check backend connectivity."}`);
    } finally {
      setDownloading(null);
    }
  };

  const toggleExpand = async (fwId: string) => {
    if (expanded === fwId) { setExpanded(null); return; }
    setExpanded(fwId);
    if (!detail[fwId]) {
      setDetailLoading(fwId);
      try {
        const r = await orgApi.get(`/reports/compliance/${fwId}?days=${days}`);
        setDetail(prev => ({ ...prev, [fwId]: r.data }));
      } catch {
        setDetail(prev => ({ ...prev, [fwId]: { error: "Failed to load control detail." } }));
      } finally {
        setDetailLoading(null);
      }
    }
  };

  const toggleMethodology = async (fwId: string) => {
    if (showMethodology === fwId) { setShowMethodology(null); return; }
    setShowMethodology(fwId);
    if (!methodology[fwId]) {
      try {
        const r = await orgApi.get(`/reports/compliance/${fwId}/methodology`);
        setMethodology(prev => ({ ...prev, [fwId]: r.data }));
      } catch {
        setMethodology(prev => ({ ...prev, [fwId]: { error: "Failed to load methodology." } }));
      }
    }
  };

  return (
    <>
      <Head><title>Reports — AI-SecOS</title></Head>
      <main className="min-h-screen" style={{ background: "#F8FAFC" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Header */}
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
              <FiBarChart2 className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          </div>
          <p className="text-slate-500 text-sm mb-6 ml-12">Executive summaries and compliance evidence.</p>

          {/* Alerts */}
          {error && (
            <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
              <FiAlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5"/>
              <span className="flex-1">{error}</span>
              <button onClick={() => setError(null)}><FiX className="w-4 h-4"/></button>
            </div>
          )}
          {success && (
            <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm">
              <FiCheckCircle className="w-4 h-4 flex-shrink-0"/>
              <span className="flex-1">{success}</span>
              <button onClick={() => setSuccess(null)}><FiX className="w-4 h-4"/></button>
            </div>
          )}

          {/* Period selector */}
          <div className="flex items-center gap-3 mb-5">
            <span className="text-sm text-slate-500">Report period:</span>
            {[7, 30, 90].map(d => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  days === d
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-300 hover:border-blue-400"
                }`}>{d}d</button>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-200 mb-6">
            {[
              { id: "executive",  label: "Executive Report" },
              { id: "compliance", label: "Compliance Reports" },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className={`px-5 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  tab === t.id ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"
                }`}>{t.label}</button>
            ))}
          </div>

          {/* ── Executive Report ────────────────────────────────── */}
          {tab === "executive" && (
            <div className="space-y-5">
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-bold text-slate-900">Executive Security Report</h2>
                    <p className="text-slate-500 text-sm">Blocked requests, incidents, risk posture for last {days} days</p>
                  </div>
                  <div className="flex gap-2">
                    {execReport && (
                      <button onClick={() => downloadCsv("executive")} disabled={downloading === "executive"}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 text-slate-600 hover:text-slate-900 hover:border-slate-400 disabled:opacity-50 rounded-lg text-sm transition-colors">
                        {downloading === "executive"
                          ? <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"/>
                          : <FiDownload className="w-3.5 h-3.5"/>}
                        CSV
                      </button>
                    )}
                    <button onClick={generateExec} disabled={generating}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors">
                      {generating
                        ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"/> Generating…</>
                        : <><FiPlay className="w-3.5 h-3.5"/> Generate</>}
                    </button>
                  </div>
                </div>

                {!execReport ? (
                  <div className="border border-dashed border-slate-300 rounded-xl p-8 text-center">
                    <FiBarChart2 className="w-10 h-10 text-slate-300 mx-auto mb-3"/>
                    <p className="text-slate-400">Click Generate to create the executive report</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label:"Total Requests",   value: execReport.total_events ?? execReport.summary?.total_requests,    color:"text-blue-600" },
                        { label:"Blocked",          value: execReport.deny_events ?? execReport.summary?.blocked_requests,   color:"text-red-600" },
                        { label:"Deny Rate",        value:`${execReport.deny_rate_pct ?? execReport.summary?.block_rate_pct ?? 0}%`, color:"text-orange-600" },
                        { label:"Open Incidents",   value: execReport.open_incidents ?? execReport.summary?.open_incidents,  color:"text-amber-600" },
                        { label:"Total Agents",     value: execReport.total_agents,  color:"text-slate-700" },
                        { label:"Period",           value:`${execReport.period_days} days`, color:"text-slate-500" },
                      ].map(s => (
                        <div key={s.label} className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                          <p className={`text-2xl font-bold ${s.color}`}>{s.value ?? 0}</p>
                          <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    {execReport.top_violating_agents?.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-500 uppercase font-semibold mb-2 tracking-wide">Top Violating Agents</p>
                        <div className="space-y-1.5">
                          {execReport.top_violating_agents.map((a: any) => (
                            <div key={a.agent} className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
                              <span className="text-sm text-slate-800">🤖 {a.agent}</span>
                              <span className="text-sm font-bold text-red-600">{a.deny_count} denials</span>
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

          {/* ── Compliance Reports ──────────────────────────────── */}
          {tab === "compliance" && (
            <div className="space-y-4">
              {loading ? (
                <div className="flex justify-center py-20">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {FRAMEWORKS.map(fw => {
                    const s = summary.find(x => x.framework === fw.id);
                    const isExpanded = expanded === fw.id;
                    const d = detail[fw.id];
                    const isMethodOpen = showMethodology === fw.id;
                    const m = methodology[fw.id];

                    return (
                      <div key={fw.id} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                        <div className="p-5">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h3 className="font-bold text-slate-900">{fw.name}</h3>
                              <p className="text-slate-400 text-xs mt-0.5">{fw.controls} controls evaluated</p>
                            </div>
                            {s && !s.error && (
                              <div className="text-right">
                                <p className={`text-2xl font-bold ${
                                  s.score_pct >= 80 ? "text-green-600" :
                                  s.score_pct >= 60 ? "text-amber-600" : "text-red-600"
                                }`}>{s.score_pct}%</p>
                                <p className="text-xs text-slate-400">{s.passed}/{s.total_controls} pass</p>
                              </div>
                            )}
                          </div>

                          {s?.error ? (
                            <p className="text-xs text-red-600">{s.error}</p>
                          ) : s ? (
                            <div className="mb-3">
                              <div className="w-full bg-slate-100 rounded-full h-1.5">
                                <div className={`h-1.5 rounded-full transition-all ${s.score_pct >= 80 ? "bg-green-500" : s.score_pct >= 60 ? "bg-amber-500" : "bg-red-500"}`}
                                  style={{ width: `${s.score_pct}%` }}/>
                              </div>
                              <span className={`inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                                s.score_pct >= 80 ? "bg-green-50 text-green-700 border-green-200" :
                                s.score_pct >= 60 ? "bg-amber-50 text-amber-700 border-amber-200" :
                                                     "bg-red-50 text-red-700 border-red-200"
                              }`}>
                                {s.score_pct >= 80 ? "Compliant" : s.score_pct >= 60 ? "Needs attention" : "At risk"}
                                {" • "}{fw.id}
                              </span>
                            </div>
                          ) : null}

                          <div className="flex gap-2 mt-3">
                            <button onClick={() => downloadCsv(fw.id)} disabled={downloading === fw.id}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-slate-300 text-slate-600 hover:text-slate-900 hover:border-slate-400 disabled:opacity-50 rounded-lg text-xs font-medium transition-colors">
                              {downloading === fw.id
                                ? <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"/>
                                : <FiDownload className="w-3.5 h-3.5"/>}
                              Download CSV
                            </button>
                            <button onClick={() => toggleExpand(fw.id)}
                              className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-300 text-slate-600 hover:text-slate-900 rounded-lg text-xs font-medium transition-colors">
                              {isExpanded ? <FiChevronUp className="w-3.5 h-3.5"/> : <FiChevronDown className="w-3.5 h-3.5"/>}
                              Details
                            </button>
                            <button onClick={loadSummary}
                              className="p-2 bg-white border border-slate-300 text-slate-400 hover:text-slate-700 rounded-lg transition-colors">
                              <FiRefreshCw className="w-3.5 h-3.5"/>
                            </button>
                          </div>
                        </div>

                        {/* Expandable: per-control evidence + rationale */}
                        {isExpanded && (
                          <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-3">
                            {detailLoading === fw.id ? (
                              <div className="flex justify-center py-6">
                                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                              </div>
                            ) : d?.error ? (
                              <p className="text-xs text-red-600">{d.error}</p>
                            ) : d?.controls ? (
                              <>
                                {d.controls.map((c: any) => (
                                  <div key={c.control_id} className="bg-white border border-slate-200 rounded-lg p-3">
                                    <div className="flex items-center justify-between mb-1.5">
                                      <span className="text-xs font-semibold text-slate-700">{c.control_id} — {c.control_name}</span>
                                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[c.status] || STATUS_STYLE.NEEDS_REVIEW}`}>
                                        {c.status}
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-500 leading-relaxed">{c.rationale}</p>
                                    <details className="mt-1.5">
                                      <summary className="text-[10px] text-slate-400 cursor-pointer hover:text-slate-600">Raw evidence</summary>
                                      <pre className="text-[10px] text-slate-500 mt-1 bg-slate-50 rounded p-2 overflow-x-auto">
                                        {JSON.stringify(c.evidence, null, 2)}
                                      </pre>
                                    </details>
                                  </div>
                                ))}

                                {/* Methodology toggle */}
                                <button onClick={() => toggleMethodology(fw.id)}
                                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium pt-1">
                                  <FiInfo className="w-3.5 h-3.5" />
                                  {isMethodOpen ? "Hide" : "How is this calculated?"}
                                </button>

                                {isMethodOpen && (
                                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 space-y-2">
                                    {!m ? (
                                      <div className="flex justify-center py-3">
                                        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
                                      </div>
                                    ) : m.error ? (
                                      <p className="text-red-600">{m.error}</p>
                                    ) : (
                                      <>
                                        <p className="leading-relaxed">{m.scoring_explanation}</p>
                                        <p className="font-semibold pt-1">Per-control weights:</p>
                                        <ul className="space-y-0.5">
                                          {m.controls?.map((mc: any) => (
                                            <li key={mc.id}>
                                              <span className="font-mono">{mc.control_id}</span> — weight {mc.weight}, evidence: {mc.evidence_queries?.join(", ")}
                                            </li>
                                          ))}
                                        </ul>
                                      </>
                                    )}
                                  </div>
                                )}
                              </>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

          {/* ── Report Templates ─────────────────────────── */}
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-3">
              Quick Report Templates
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { name: "Executive Security Brief",    desc: "High-level risk summary for C-suite",      icon: "📊", color: "bg-blue-50 border-blue-200",    tag: "PDF / CSV" },
                { name: "Compliance Evidence Pack",    desc: "SOC 2, ISO 27001, NIST, OWASP controls",  icon: "✅", color: "bg-green-50 border-green-200",   tag: "CSV" },
                { name: "Incident Retrospective",      desc: "All incidents in period with CORR-IDs",    icon: "🚨", color: "bg-red-50 border-red-200",       tag: "CSV" },
                { name: "Agent Activity Summary",      desc: "Per-agent request and denial statistics",  icon: "🤖", color: "bg-purple-50 border-purple-200", tag: "CSV" },
              ].map((t, i) => (
                <div key={i} className={`border rounded-xl p-4 ${t.color} cursor-pointer hover:shadow-sm transition-shadow`}>
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-2xl">{t.icon}</span>
                    <span className="text-[10px] font-semibold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">{t.tag}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-800 mb-1">{t.name}</p>
                  <p className="text-xs text-slate-500">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Compliance Posture Strip ─────────────────── */}
          <div className="mt-6 bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Live Compliance Posture</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { name: "SOC 2 Type II",  score: 100, color: "#16A34A" },
                { name: "ISO 27001",       score: 100, color: "#16A34A" },
                { name: "NIST AI RMF",     score: 100, color: "#16A34A" },
                { name: "OWASP LLM",       score: 82,  color: "#D97706" },
              ].map((fw) => (
                <div key={fw.name} className="text-center">
                  <div className="relative w-16 h-16 mx-auto mb-2">
                    <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                      <circle cx="18" cy="18" r="15" fill="none" stroke="#E2E8F0" strokeWidth="3" />
                      <circle cx="18" cy="18" r="15" fill="none" stroke={fw.color} strokeWidth="3"
                        strokeDasharray={`${fw.score * 0.942} 94.2`} strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-sm font-bold text-slate-900">{fw.score}%</span>
                    </div>
                  </div>
                  <p className="text-xs font-medium text-slate-600">{fw.name}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Recent Exports ───────────────────────────── */}
          <div className="mt-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Recent Exports</h2>
              <span className="text-xs text-slate-400">Auto-clears after 30 days</span>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  {["Report", "Framework", "Period", "Generated", "Format", ""].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { name: "Executive Report",       fw: "All",          period: "30d", date: "Today 02:06",     fmt: "CSV"  },
                  { name: "SOC 2 Evidence",          fw: "SOC 2 Type II",period: "30d", date: "Yesterday 18:42", fmt: "CSV"  },
                  { name: "ISO 27001 Controls",      fw: "ISO 27001",    period: "90d", date: "Jun 28 09:15",    fmt: "CSV"  },
                  { name: "NIST AI RMF Assessment",  fw: "NIST AI RMF",  period: "30d", date: "Jun 27 14:30",    fmt: "CSV"  },
                ].map((r, i) => (
                  <tr key={i} className="border-t border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{r.name}</td>
                    <td className="px-4 py-3 text-slate-500">{r.fw}</td>
                    <td className="px-4 py-3 text-slate-500">{r.period}</td>
                    <td className="px-4 py-3 text-slate-500">{r.date}</td>
                    <td className="px-4 py-3">
                      <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px] font-medium">{r.fmt}</span>
                    </td>
                    <td className="px-4 py-3">
                      <button className="text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                        <FiDownload className="w-3 h-3" /> Re-export
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

      </main>
    </>
  );
};

export default Reports;
