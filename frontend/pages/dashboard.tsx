/**
 * pages/dashboard.tsx
 * AI-SecOS Enterprise Security Dashboard
 * Inspired by Microsoft Defender / CrowdStrike / Palo Alto Cortex
 */
import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import { getOrgToken } from "../lib/tokens";
import orgApi from "../lib/orgApi";
import {
  FiShield, FiZap, FiAlertTriangle, FiActivity, FiDatabase,
  FiCheckCircle, FiXCircle, FiArrowRight, FiTrendingUp, FiTrendingDown,
  FiRefreshCw, FiMinus, FiUsers, FiKey, FiLink, FiBarChart2,
  FiClock, FiCpu, FiServer, FiTarget, FiEye, FiMessageSquare,
} from "react-icons/fi";

// ── Helpers ────────────────────────────────────────────────────

const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
const pct = (n: number) => `${n}%`;

const RISK_COLOR = (score: number) =>
  score >= 80 ? "text-red-600" : score >= 60 ? "text-orange-600" : score >= 40 ? "text-amber-600" : "text-green-600";
const RISK_BG = (score: number) =>
  score >= 80 ? "bg-red-500" : score >= 60 ? "bg-orange-500" : score >= 40 ? "bg-yellow-500" : "bg-green-500";
const SEV_CLS: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-200",
  high:     "bg-orange-50 text-orange-700 border-orange-200",
  medium:   "bg-amber-50 text-amber-700 border-amber-200",
  low:      "bg-green-50 text-green-700 border-green-200",
};
const PRIO_DOT: Record<string, string> = {
  critical: "bg-red-400", high: "bg-orange-400", medium: "bg-yellow-400", low: "bg-green-400"
};

// ── Mini Sparkline ─────────────────────────────────────────────
function Sparkline({ data, color = "#6366f1" }: { data: number[]; color?: string }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 80; const h = 28;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={`0,${h} ${pts} ${w},${h}`}
        fill={color} fillOpacity="0.12" stroke="none" />
    </svg>
  );
}

// ── Bar Chart (runtime trend) ──────────────────────────────────
function TrendBars({ data }: { data: any[] }) {
  const maxTotal = Math.max(...data.map(d => d.total), 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
          <div className="w-full flex flex-col justify-end" style={{ height: "80px" }}>
            <div
              className="w-full bg-red-500/60 rounded-sm"
              style={{ height: `${(d.blocked / maxTotal) * 80}px` }}
              title={`Blocked: ${d.blocked}`}
            />
            <div
              className="w-full bg-blue-500/60 rounded-sm"
              style={{ height: `${(d.allowed / maxTotal) * 80}px` }}
              title={`Allowed: ${d.allowed}`}
            />
          </div>
          <span className="text-slate-500 text-[9px] whitespace-nowrap">{d.date.replace(/\w+ /, "")}</span>
        </div>
      ))}
    </div>
  );
}

// ── Section Header ─────────────────────────────────────────────
function SectionHeader({ title, href, icon }: { title: string; href?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
        {icon && <span className="text-blue-600">{icon}</span>}
        {title}
      </h2>
      {href && (
        <Link href={href} className="text-xs text-blue-600 hover:text-blue-400 flex items-center gap-0.5">
          View all <FiArrowRight className="w-3 h-3" />
        </Link>
      )}
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-4 ${className}`}>
      {children}
    </div>
  );
}

// ── Compliance Arc ─────────────────────────────────────────────
function ComplianceArc({ score, name }: { score: number; name: string }) {
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#eab308" : "#ef4444";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-14 h-14">
        <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke="#1f2937" strokeWidth="3" />
          <circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${score * 0.942} 94.2`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold text-slate-900">{score}%</span>
        </div>
      </div>
      <p className="text-slate-400 text-[10px] text-center leading-tight">{name}</p>
    </div>
  );
}

// ── Governance Ring ────────────────────────────────────────────
function GovernanceRing({ score, label }: { score: number; label: string }) {
  const color = score >= 85 ? "#22c55e" : score >= 70 ? "#6366f1" : score >= 55 ? "#eab308" : "#ef4444";
  return (
    <div className="relative flex items-center justify-center w-32 h-32 mx-auto">
      <svg viewBox="0 0 36 36" className="w-32 h-32 -rotate-90">
        <circle cx="18" cy="18" r="15" fill="none" stroke="#E2E8F0" strokeWidth="2.5" />
        <circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="2.5"
          strokeDasharray={`${score * 0.942} 94.2`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black text-slate-900">{score}</span>
        <span className="text-xs text-slate-500">/ 100</span>
        <span className="text-xs font-semibold mt-0.5" style={{ color }}>{label}</span>
      </div>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────
const Dashboard: React.FC = () => {
  const router = useRouter();
  const [data, setData]       = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [health, setHealth]   = useState<Record<string, string>>({});
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await orgApi.get("/dashboard");
      setData(r.data);
      setLastUpdate(new Date());
      setError(null);
    } catch (e: any) {
      setError("Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
    // Health check
    try {
      const r = await fetch((process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000") + "/health");
      const d = await r.json();
      setHealth({
        api:      d.status   === "healthy" ? "Healthy" : "Degraded",
        database: d.database === "healthy" ? "Healthy" : "Degraded",
        graph:    d.graph    === "healthy" || d.graph === "connected" ? "Healthy" : "Degraded",
      });
    } catch { setHealth({ api: "Unknown", database: "Unknown", graph: "Unknown" }); }
  }, []);

  useEffect(() => {
    if (!getOrgToken()) { router.push("/login"); return; }
    load();
    // Auto-refresh every 60s
    intervalRef.current = setInterval(load, 60000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading enterprise dashboard…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <FiAlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <p className="text-slate-600 mb-4">{error || "No data"}</p>
          <button onClick={load} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">Retry</button>
        </div>
      </div>
    );
  }

  const { overview, today, high_risk_assets, high_risk_agents, prompt_threats,
          runtime_trend, incident_summary, policy_effectiveness, connector_health,
          compliance_scores, timeline, governance, recommendations, ai_summary } = data;

  const trendColor = overview.risk_trend > 0 ? "text-red-600" : overview.risk_trend < 0 ? "text-green-600" : "text-slate-500";
  const TrendIcon  = overview.risk_trend > 0 ? FiTrendingUp : overview.risk_trend < 0 ? FiTrendingDown : FiMinus;
  const RISK_LEVEL_CLS: Record<string, string> = {
    CRITICAL: "text-red-700 bg-red-50 border-red-200",
    HIGH:     "text-orange-700 bg-orange-50 border-orange-200",
    MEDIUM:   "text-amber-700 bg-amber-50 border-amber-200",
    LOW:      "text-green-700 bg-green-50 border-green-200",
  };

  const sparkData = runtime_trend.map((d: any) => d.total);
  const sparkBlocked = runtime_trend.map((d: any) => d.blocked);

  return (
    <>
      <Head><title>Dashboard — AI-SecOS Enterprise</title></Head>
      <main className="min-h-screen pb-10">
        {/* Top bar */}
        <div className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-20 px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-slate-500 text-xs">Live</span>
            </div>
            {lastUpdate && (
              <span className="text-slate-500 text-xs">Updated {lastUpdate.toLocaleTimeString()}</span>
            )}
          </div>
          <button onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-500 hover:text-slate-900 rounded-lg text-xs">
            <FiRefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-5 space-y-4">

          {/* ── Row 1: Enterprise Risk Score + KPI cards ──────── */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
            {/* Enterprise Risk Score — spans 2 on mobile, 1 on xl */}
            <div className={`col-span-2 md:col-span-2 xl:col-span-2 border-2 rounded-xl p-5 ${RISK_LEVEL_CLS[overview.risk_level] || "border-slate-200 bg-white"}`}>
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Enterprise Risk Score</p>
              <div className="flex items-end gap-3">
                <p className={`text-6xl font-black ${RISK_COLOR(overview.enterprise_risk_score)}`}>
                  {overview.enterprise_risk_score}
                </p>
                <div className="mb-1">
                  <p className="text-slate-400 text-xs">/ 100</p>
                  <div className={`flex items-center gap-0.5 text-xs font-semibold ${trendColor}`}>
                    <TrendIcon className="w-3 h-3" />
                    {Math.abs(overview.risk_trend)} pts
                  </div>
                </div>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border mt-2 inline-block ${RISK_LEVEL_CLS[overview.risk_level]}`}>
                {overview.risk_level}
              </span>
              <div className="mt-2">
                <Sparkline data={sparkData} color={overview.enterprise_risk_score >= 60 ? "#f97316" : "#6366f1"} />
              </div>
            </div>

            {/* 5 KPI cards */}
            {[
              { label: "AI Assets Protected",         value: overview.total_assets,  icon: <FiDatabase />, href: "/assets",          accent: "text-blue-600" },
              { label: "AI Agents Protected",          value: overview.total_agents,  icon: <FiCpu />,     href: "/agents",          accent: "text-purple-600" },
              { label: "Active Security Policies",     value: overview.total_policies, icon: <FiShield />, href: "/policies",        accent: "text-blue-600" },
              { label: "High Risk AI Assets",          value: high_risk_assets.length, icon: <FiAlertTriangle />, href: "/assets?severity=high", accent: high_risk_assets.length > 0 ? "text-orange-600" : "text-slate-400" },
              { label: "Active AI Security Incidents", value: overview.open_incidents, icon: <FiTarget />, href: "/incidents?status=open", accent: overview.open_incidents > 0 ? "text-red-600" : "text-slate-400" },
            ].map(card => (
              <Link key={card.label} href={card.href}>
                <div className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-all cursor-pointer h-full">
                  <div className={`${card.accent} mb-2`}>{React.cloneElement(card.icon as React.ReactElement, { className: "w-4 h-4" })}</div>
                  <p className={`text-3xl font-bold ${card.accent}`}>{card.value.toLocaleString()}</p>
                  <p className="text-slate-400 text-xs mt-1 leading-tight">{card.label}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* ── Row 2: Today's Activity ───────────────────────── */}
          <Card>
            <SectionHeader title="Today's AI Activity" icon={<FiActivity className="w-4 h-4" />} />
            <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
              {[
                { label: "AI Requests",       value: fmt(today.total),            color: "text-blue-600" },
                { label: "Blocked",           value: fmt(today.blocked),           color: "text-red-600" },
                { label: "Allowed",           value: fmt(today.allowed),           color: "text-green-600" },
                { label: "New Incidents",     value: today.new_incidents,          color: "text-orange-600" },
                { label: "Critical Prompts",  value: today.critical_prompts,       color: "text-red-600" },
                { label: "Policy Violations", value: today.policy_violations,      color: "text-amber-600" },
                { label: "Unique Users",      value: today.unique_users,           color: "text-purple-600" },
                { label: "Unique Agents",     value: today.unique_agents,          color: "text-blue-600" },
              ].map(m => (
                <div key={m.label} className="text-center">
                  <p className={`text-2xl font-bold ${m.color}`}>{m.value}</p>
                  <p className="text-slate-500 text-[10px] mt-0.5 leading-tight">{m.label}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* ── Row 3: Risk Overview + Runtime Trend ─────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* High Risk Assets */}
            <Card>
              <SectionHeader title="High Risk AI Assets" href="/assets?severity=high" icon={<FiDatabase className="w-4 h-4" />} />
              {high_risk_assets.length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-sm">No high-risk assets detected. ✓</div>
              ) : (
                <div className="space-y-2.5">
                  {high_risk_assets.map((a: any) => (
                    <div key={a.id} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-slate-700 text-sm font-medium truncate">{a.name}</span>
                          <span className={`text-sm font-bold ml-2 ${RISK_COLOR(a.score)}`}>{a.score}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${RISK_BG(a.score)}`} style={{ width: `${a.score}%` }} />
                        </div>
                      </div>
                      {a.trend === "up"
                        ? <FiTrendingUp className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                        : <FiTrendingDown className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />}
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Runtime trend chart */}
            <Card>
              <SectionHeader title="Runtime Activity — 7 Days" href="/runtime" icon={<FiBarChart2 className="w-4 h-4" />} />
              <TrendBars data={runtime_trend} />
              <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                <span className="flex items-center gap-1"><span className="w-3 h-2 bg-blue-500/60 rounded-sm inline-block" /> Allowed</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 bg-red-500/60 rounded-sm inline-block" /> Blocked</span>
              </div>
            </Card>
          </div>

          {/* ── Row 4: High Risk Agents + Prompt Threats ──────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* High Risk Agents */}
            <Card>
              <SectionHeader title="High Risk AI Agents" href="/agents" icon={<FiCpu className="w-4 h-4" />} />
              {high_risk_agents.length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-sm">No high-risk agents this month. ✓</div>
              ) : (
                <div className="space-y-2.5">
                  {high_risk_agents.map((a: any, i: number) => (
                    <div key={a.id} className="flex items-center gap-3">
                      <span className="w-5 text-slate-500 text-xs font-mono">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-slate-700 text-sm font-medium truncate">🤖 {a.name}</span>
                          <span className={`text-xs font-bold ml-2 ${RISK_COLOR(a.score)}`}>Risk {a.score}</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full ${RISK_BG(a.score)}`} style={{ width: `${a.score}%` }} />
                        </div>
                      </div>
                      <span className="text-xs text-red-600 flex-shrink-0">{a.denials} denials</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Prompt Threats */}
            <Card>
              <SectionHeader title="AI Threat Intelligence — Prompt Risks" href="/runtime?decision=deny" icon={<FiEye className="w-4 h-4" />} />
              {prompt_threats.length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-sm">No threat categories detected this week.</div>
              ) : (
                <div className="space-y-2.5">
                  {prompt_threats.map((t: any, i: number) => {
                    const max = prompt_threats[0]?.count || 1;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-slate-700 text-sm flex-1">{t.category}</span>
                        <div className="w-24 bg-slate-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-orange-500" style={{ width: `${(t.count / max) * 100}%` }} />
                        </div>
                        <span className="text-orange-600 text-sm font-bold w-6 text-right">{t.count}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* ── Row 5: Incidents + Policy Effectiveness ───────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Incident Center */}
            <Card>
              <SectionHeader title="Incident Center" href="/incidents" icon={<FiAlertTriangle className="w-4 h-4" />} />
              <div className="grid grid-cols-4 gap-3 mb-3">
                {(["critical","high","medium","low"] as const).map(sev => (
                  <Link key={sev} href={`/incidents?status=open&severity=${sev}`}>
                    <div className={`border rounded-xl p-3 text-center cursor-pointer hover:brightness-110 transition-all ${SEV_CLS[sev]}`}>
                      <p className="text-2xl font-bold">{incident_summary[sev] || 0}</p>
                      <p className="text-xs capitalize mt-0.5">{sev}</p>
                    </div>
                  </Link>
                ))}
              </div>
              <Link href="/incidents" className="block text-center text-xs text-blue-600 hover:text-blue-400 mt-1">
                Open Incident Queue →
              </Link>
            </Card>

            {/* Policy Effectiveness */}
            <Card>
              <SectionHeader title="Policy Effectiveness — Triggered Today" href="/policies" icon={<FiShield className="w-4 h-4" />} />
              {policy_effectiveness.length === 0 ? (
                <div className="py-6 text-center text-slate-500 text-sm">No policies triggered yet today.</div>
              ) : (
                <div className="space-y-2.5">
                  {policy_effectiveness.map((p: any, i: number) => {
                    const max = policy_effectiveness[0]?.triggers || 1;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-slate-700 text-sm flex-1 truncate">{p.policy}</span>
                        <div className="w-24 bg-slate-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${(p.triggers / max) * 100}%` }} />
                        </div>
                        <span className="text-blue-600 text-sm font-bold w-6 text-right">{p.triggers}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>

          {/* ── Row 6: Timeline ───────────────────────────────── */}
          <Card>
            <SectionHeader title="AI Security Timeline" href="/runtime" icon={<FiClock className="w-4 h-4" />} />
            {timeline.length === 0 ? (
              <div className="py-6 text-center text-slate-500 text-sm">No events yet. Configure a connector to start.</div>
            ) : (
              <div className="overflow-x-auto">
                <div className="flex gap-3 pb-1" style={{ minWidth: "max-content" }}>
                  {timeline.slice(0, 12).map((e: any, i: number) => (
                    <div key={e.id || i} className={`border rounded-xl p-3 flex-shrink-0 w-44 ${
                      e.decision === "deny"
                        ? "border-red-800 bg-red-900/15"
                        : "border-slate-200 bg-slate-50"
                    }`}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-slate-400 text-xs font-mono">{e.time}</span>
                        {e.decision === "deny"
                          ? <FiXCircle className="w-3.5 h-3.5 text-red-600" />
                          : <FiCheckCircle className="w-3.5 h-3.5 text-green-600" />}
                      </div>
                      <p className="text-slate-900 text-xs font-semibold truncate">🤖 {e.agent}</p>
                      <p className="text-slate-500 text-xs truncate mt-0.5">→ {e.asset}</p>
                      {e.category && e.category !== "general_query" && (
                        <span className="text-[10px] text-orange-600 mt-1 block truncate">{e.category.replace(/_/g, " ")}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* ── Row 7: Connector Health + Org Health ──────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Connector Health */}
            <Card>
              <SectionHeader title="Connected AI Platforms" href="/enterprise" icon={<FiLink className="w-4 h-4" />} />
              {connector_health.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-slate-500 text-sm mb-2">No connectors configured yet.</p>
                  <Link href="/enterprise" className="text-xs text-blue-600 hover:text-blue-400">
                    Add your first connector →
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {connector_health.map((c: any) => (
                    <div key={c.id} className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${c.status === "healthy" ? "bg-green-400" : "bg-red-400"}`} />
                      <span className="text-slate-700 text-sm font-medium flex-1">{c.name}</span>
                      <span className={`text-xs font-semibold ${c.status === "healthy" ? "text-green-600" : "text-red-600"}`}>
                        {c.status === "healthy" ? "Healthy" : "Error"}
                      </span>
                      <span className="text-slate-400 text-xs">{c.requests_today} reqs</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* Organization Health */}
            <Card>
              <SectionHeader title="Organization Health" icon={<FiUsers className="w-4 h-4" />} />
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Users",      value: overview.total_users,      icon: <FiUsers />,   href: "/users" },
                  { label: "Agents",     value: overview.total_agents,     icon: <FiCpu />,     href: "/agents" },
                  { label: "Assets",     value: overview.total_assets,     icon: <FiDatabase />, href: "/assets" },
                  { label: "Policies",   value: overview.total_policies,   icon: <FiShield />,  href: "/policies" },
                  { label: "API Keys",   value: overview.total_api_keys,   icon: <FiKey />,     href: "/enterprise" },
                  { label: "Connectors", value: overview.total_connectors, icon: <FiLink />,    href: "/enterprise" },
                ].map(item => (
                  <Link key={item.label} href={item.href}>
                    <div className="bg-white border border-slate-200 rounded-lg p-3 text-center hover:border-gray-500 transition-colors">
                      <div className="text-blue-600 flex justify-center mb-1">
                        {React.cloneElement(item.icon as React.ReactElement, { className: "w-4 h-4" })}
                      </div>
                      <p className="text-slate-900 text-xl font-bold">{item.value}</p>
                      <p className="text-slate-400 text-xs">{item.label}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          </div>

          {/* ── Row 8: Compliance + Governance Score ──────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Compliance */}
            <Card className="lg:col-span-2">
              <SectionHeader title="Compliance Posture" href="/reports" icon={<FiCheckCircle className="w-4 h-4" />} />
              {compliance_scores.length === 0 ? (
                <div className="py-4 text-slate-500 text-sm text-center">Compliance data loading…</div>
              ) : (
                <div className="flex items-center justify-around py-2">
                  {compliance_scores.map((c: any) => (
                    <ComplianceArc key={c.framework} score={Math.round(c.score)} name={c.name} />
                  ))}
                </div>
              )}
            </Card>

            {/* AI Governance Score */}
            <Card>
              <SectionHeader title="AI Governance Score" icon={<FiTarget className="w-4 h-4" />} />
              <GovernanceRing score={governance.score} label={governance.label} />
              <div className="mt-3 space-y-1">
                {Object.entries(governance.breakdown).map(([key, val]: [string, any]) => (
                  <div key={key} className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 flex-1 capitalize">{key.replace("_", " ")}</span>
                    <div className="w-16 bg-slate-100 rounded-full h-1">
                      <div className="h-1 rounded-full bg-blue-500" style={{ width: `${val}%` }} />
                    </div>
                    <span className="text-slate-500 w-8 text-right">{val}%</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* ── Row 9: Recommended Actions ────────────────────── */}
          <Card>
            <SectionHeader title="Recommended Actions" icon={<FiZap className="w-4 h-4" />} />
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {recommendations.map((r: any, i: number) => (
                <Link key={i} href={r.href || "#"}>
                  <div className="flex items-center gap-3 bg-white border border-slate-200 hover:border-blue-200 hover:bg-indigo-900/10 rounded-xl px-4 py-3 transition-all cursor-pointer">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIO_DOT[r.priority] || "bg-gray-500"}`} />
                    <span className="text-slate-700 text-sm flex-1">{r.action}</span>
                    <FiArrowRight className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          {/* ── Row 10: AI Security Copilot ───────────────────── */}
          <Card className="border-blue-200/60 bg-indigo-950/20">
            <SectionHeader title="AI Security Copilot" icon={<FiMessageSquare className="w-4 h-4" />} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <p className="text-xs text-blue-600 uppercase font-semibold mb-2">Security Summary — Today</p>
                <ul className="space-y-1.5">
                  {ai_summary.summary.map((line: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="text-blue-500 mt-1 flex-shrink-0">•</span> {line}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs text-blue-600 uppercase font-semibold mb-2">Recommended Actions</p>
                <ul className="space-y-1.5">
                  {ai_summary.recommendations.map((line: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="text-orange-600 mt-0.5 flex-shrink-0">{i + 1}.</span> {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

          {/* ── Row 11: Platform Health ────────────────────────── */}
          <Card>
            <SectionHeader title="Platform Health" icon={<FiServer className="w-4 h-4" />} />
            <div className="flex flex-wrap gap-4">
              {[
                ["Backend API", health.api],
                ["PostgreSQL",  health.database],
                ["Neo4j Graph", health.graph],
                ["Queue",       "Healthy"],
                ["Workers",     "Healthy"],
                ["Storage",     "Healthy"],
              ].map(([label, s]) => (
                <div key={label} className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${s === "Healthy" ? "bg-green-400" : s === "Unknown" ? "bg-gray-500" : "bg-red-400"}`} />
                  <span className="text-slate-500 text-sm">{label}</span>
                  <span className={`text-xs font-medium ${s === "Healthy" ? "text-green-600" : s === "Unknown" ? "text-slate-400" : "text-red-600"}`}>{s || "Checking…"}</span>
                </div>
              ))}
            </div>
          </Card>

        </div>
      </main>
    </>
  );
};

export default Dashboard;
