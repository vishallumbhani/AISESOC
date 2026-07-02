/**
 * pages/graph.tsx  — Graph Explorer v2  (theme-matched build)
 *
 * Shell (search bar, KPI, filters, right panel, event feed):
 *   → Light theme matching the rest of the platform (#F8FAFC / white cards)
 * Graph canvas:
 *   → Dark background (#0D1117) so risk colors pop — matches enterprise SOC standard
 */
import React, { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { getOrgToken } from "../lib/tokens";
import orgApi from "../lib/orgApi";
import {
  Search, RefreshCw, Bell, X, ZoomIn, ZoomOut, Maximize2,
  Cpu, Database, Shield, Wrench, User as UserIcon,
  AlertTriangle, Activity, Link2, TrendingUp,
} from "lucide-react";

const RISK_COLOR: Record<string, string> = {
  critical: "#DC2626",
  high:     "#EA580C",
  medium:   "#CA8A04",
  low:      "#16A34A",
  info:     "#2563EB",
};
const RISK_BG: Record<string, string> = {
  critical: "#450A0A",
  high:     "#431407",
  medium:   "#422006",
  low:      "#052E16",
  info:     "#0C1A2E",
};
const RISK_TEXT: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border border-red-200",
  high:     "bg-orange-100 text-orange-700 border border-orange-200",
  medium:   "bg-yellow-100 text-yellow-700 border border-yellow-200",
  low:      "bg-green-100 text-green-700 border border-green-200",
  info:     "bg-blue-100 text-blue-700 border border-blue-200",
};

function riskLevel(score: number): string {
  if (score >= 20) return "critical";
  if (score >= 14) return "high";
  if (score >= 8)  return "medium";
  if (score > 0)   return "low";
  return "info";
}

const TYPE_ICON: Record<string, any> = {
  Agent: Cpu, Asset: Database, Policy: Shield, Tool: Wrench, EndUser: UserIcon,
};

const WINDOWS = [
  { id: "15min", label: "Last 15 min" },
  { id: "1hour", label: "Last Hour" },
  { id: "today", label: "Today" },
  { id: "week",  label: "Last Week" },
];

interface GNode {
  id: string; label: string; name: string; type?: string;
  risk_score: number; risk_level: string;
  activity_count: number; deny_count: number;
  x?: number; y?: number;
}
interface GEdge {
  id: string; from: string; to: string;
  type: string; decision?: string;
}

function layoutNodes(nodes: GNode[], width: number, height: number): GNode[] {
  const cx = width / 2, cy = height / 2;
  const n = nodes.length;
  const sorted = [...nodes].sort((a, b) => b.risk_score - a.risk_score);
  return sorted.map((node, i) => {
    if (i === 0) return { ...node, x: cx, y: cy };
    const ring = Math.ceil(i / 8);
    const posInRing = (i - 1) % 8;
    const angle = (posInRing / Math.min(8, n - 1)) * 2 * Math.PI - Math.PI / 2;
    const radius = ring * Math.min(width, height) * 0.28;
    return { ...node, x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
  });
}

const GraphExplorer: React.FC = () => {
  const router = useRouter();

  const [kpis, setKpis]         = useState<any>(null);
  const [nodes, setNodes]       = useState<GNode[]>([]);
  const [edges, setEdges]       = useState<GEdge[]>([]);
  const [totalNodes, setTotal]  = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const [riskFilter, setRiskFilter] = useState("all");
  const [window_, setWindow]         = useState("week");
  const [limit, setLimit]            = useState(25);
  const [searchQ, setSearchQ]        = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const [selectedNode, setSelectedNode]   = useState<GNode | null>(null);
  const [nodeDetail, setNodeDetail]       = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [events, setEvents]     = useState<any[]>([]);
  const [eventTab, setEventTab] = useState<"all" | "deny">("all");
  const [zoom, setZoom]         = useState(100);

  useEffect(() => {
    if (!getOrgToken()) { router.push("/login"); return; }
    loadOverview();
    loadEvents();
    const t = setInterval(() => { loadOverview(); loadEvents(); }, 30000);
    return () => clearInterval(t);
  }, [riskFilter, window_, limit]);

  const loadOverview = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await orgApi.get("/graph/overview", {
        params: { limit, risk: riskFilter, window: window_ },
      });
      setKpis(r.data.kpis);
      const enriched = (r.data.graph.nodes || []).map((n: GNode) => ({
        ...n, risk_level: riskLevel(n.risk_score),
      }));
      setNodes(layoutNodes(enriched, 900, 500));
      setEdges(r.data.graph.edges || []);
      setTotal(r.data.graph.total_nodes || 0);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to load graph");
    } finally { setLoading(false); }
  }, [riskFilter, window_, limit]);

  const loadEvents = useCallback(async () => {
    try {
      const r = await orgApi.get("/graph/events", {
        params: { limit: 15, status: eventTab === "deny" ? "deny" : undefined },
      });
      setEvents(r.data);
    } catch { }
  }, [eventTab]);

  useEffect(() => { loadEvents(); }, [eventTab]);

  const selectNode = async (node: GNode) => {
    setSelectedNode(node);
    setNodeDetail(null);
    setDetailLoading(true);
    try {
      const r = await orgApi.get(`/graph/node/${node.id}`);
      setNodeDetail(r.data);
    } catch {
      setNodeDetail({ node: null });
    } finally { setDetailLoading(false); }
  };

  const doSearch = async (q: string) => {
    setSearchQ(q);
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const r = await orgApi.get("/graph/search", { params: { q } });
      setSearchResults(r.data.results || []);
    } catch { setSearchResults([]); }
  };

  const nodeById = (id: string) => nodes.find(n => n.id === id);
  const rl = selectedNode ? riskLevel(selectedNode.risk_score) : "info";

  return (
    <>
      <Head><title>Graph Explorer — AI-SecOS</title></Head>

      <div className="flex flex-col overflow-hidden" style={{ height: "calc(100vh - 48px)", background: "#F8FAFC", margin: "-24px -28px -40px" }}>

        {/* ── Search bar — light ───────────────────────────────── */}
        <div className="flex items-center gap-3 px-4 py-2 flex-shrink-0 border-b border-slate-200 bg-white">
          <div className="relative flex-1 max-w-2xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={searchQ} onChange={e => doSearch(e.target.value)}
              placeholder="Search agents, users, tools, assets, policies, incidents..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            {searchResults.length > 0 && (
              <div className="absolute top-full mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                {searchResults.map(r => (
                  <button key={r.id}
                    onClick={() => { const n = nodeById(r.id); if (n) selectNode(n); setSearchResults([]); setSearchQ(""); }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between text-sm border-b border-slate-100 last:border-0">
                    <span className="text-slate-800 font-medium">{r.name}</span>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{r.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <select value={window_} onChange={e => setWindow(e.target.value)}
            className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
            {WINDOWS.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
          <button onClick={() => { loadOverview(); loadEvents(); }}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 relative">
            <Bell className="w-4 h-4" />
            {(kpis?.open_incidents ?? 0) > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[9px] flex items-center justify-center text-white font-bold">
                {kpis.open_incidents}
              </span>
            )}
          </button>
        </div>

        {/* ── KPI Bar — light cards ─────────────────────────────── */}
        <div className="grid grid-cols-7 border-b border-slate-200 flex-shrink-0 bg-white">
          {([
            { label: "AI AGENTS",            value: kpis?.agents,           icon: Cpu,           color: "#2563EB" },
            { label: "ASSETS/DBS",           value: kpis?.assets,           icon: Database,      color: "#0891B2" },
            { label: "POLICIES",             value: kpis?.policies,         icon: Shield,        color: "#D97706" },
            { label: `REQUESTS (${window_})`,value: kpis?.requests_window,  icon: Activity,      color: "#7C3AED" },
            { label: `DENIED (${window_})`,  value: kpis?.denied_window,    icon: AlertTriangle, color: "#DC2626" },
            { label: "HIGH RISK AGENTS",     value: kpis?.high_risk_agents, icon: TrendingUp,    color: "#EA580C" },
            { label: "OPEN INCIDENTS",       value: kpis?.open_incidents,   icon: Bell,          color: "#DC2626" },
          ] as const).map((k, idx) => {
            const Icon = k.icon as any;
            return (
              <div key={idx} className="px-4 py-3 border-r border-slate-100 last:border-r-0">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Icon className="w-3.5 h-3.5" style={{ color: k.color }} />
                  <span className="text-[9px] font-bold text-slate-500 tracking-widest uppercase">{k.label}</span>
                </div>
                <p className="text-2xl font-bold text-slate-900 leading-none tabular-nums">
                  {k.value != null ? k.value : (loading ? <span className="text-slate-300 text-lg">—</span> : "0")}
                </p>
              </div>
            );
          })}
        </div>

        {/* ── Filter row — light ────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 flex-shrink-0 bg-white">
          <span className="text-xs font-medium text-slate-500 mr-1">Risk:</span>
          {["all", "critical", "high", "medium", "low"].map(r => (
            <button key={r} onClick={() => setRiskFilter(r)}
              className={`px-3 py-1 rounded-full text-xs font-semibold capitalize transition-all ${
                riskFilter === r
                  ? "text-white shadow-sm"
                  : "text-slate-500 bg-slate-100 hover:bg-slate-200"
              }`}
              style={riskFilter === r ? { background: r === "all" ? "#2563EB" : RISK_COLOR[r] } : {}}>
              {r}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-slate-400">Top {Math.min(limit, nodes.length)} of {totalNodes} nodes</span>
            {totalNodes > limit && (
              <button onClick={() => setLimit(l => l + 25)}
                className="text-xs text-blue-600 hover:text-blue-800 font-semibold">
                Load More
              </button>
            )}
          </div>
        </div>

        {/* ── Main: graph (dark) + right panel (light) ─────────── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* Dark graph canvas */}
          <div className="flex-1 relative overflow-hidden" style={{ background: "#0D1117" }}>

            {/* Legend */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-3 rounded-lg px-3 py-1.5 border border-slate-700/50" style={{ background: "rgba(15,23,42,0.85)", backdropFilter: "blur(8px)" }}>
              {Object.entries(RISK_COLOR).map(([lvl, col]) => (
                <div key={lvl} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: col }} />
                  <span className="text-[10px] font-medium text-slate-300 capitalize">{lvl}</span>
                </div>
              ))}
            </div>

            {/* Zoom controls */}
            <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 rounded-lg border border-slate-700 p-1" style={{ background: "rgba(15,23,42,0.85)" }}>
              {[
                { Icon: ZoomIn,    fn: () => setZoom(z => Math.min(200, z + 15)) },
                { Icon: ZoomOut,   fn: () => setZoom(z => Math.max(40, z - 15)) },
                { Icon: Maximize2, fn: () => setZoom(100) },
              ].map(({ Icon, fn }, i) => (
                <button key={i} onClick={fn} className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors">
                  <Icon className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-full text-red-400">
                <AlertTriangle className="w-8 h-8 mb-2 opacity-60" />
                <p className="text-sm">{error}</p>
              </div>
            ) : nodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <Link2 className="w-10 h-10 mb-3 opacity-20" />
                <p className="text-sm">No graph data</p>
                <p className="text-xs mt-1 text-slate-600">Run a connector sync or change the time window</p>
              </div>
            ) : (
              <svg width="100%" height="100%" viewBox="0 0 900 500"
                style={{ transform: `scale(${zoom / 100})`, transformOrigin: "center center" }}>

                {/* Grid dots for depth */}
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <circle cx="1" cy="1" r="0.8" fill="#1E293B" />
                  </pattern>
                </defs>
                <rect width="900" height="500" fill="url(#grid)" />

                {/* Edges */}
                {edges.map((edge, i) => {
                  const f = nodeById(edge.from), t = nodeById(edge.to);
                  if (!f?.x || !t?.x) return null;
                  const deny = edge.decision === "deny";
                  return (
                    <g key={i}>
                      <line x1={f.x} y1={f.y} x2={t.x} y2={t.y}
                        stroke={deny ? "#EF444460" : "#33415580"}
                        strokeWidth={deny ? 2 : 1}
                        strokeDasharray={deny ? "5,4" : undefined} />
                    </g>
                  );
                })}

                {/* Nodes */}
                {nodes.map(node => {
                  if (node.x == null) return null;
                  const lvl   = riskLevel(node.risk_score);
                  const color = RISK_COLOR[lvl];
                  const bg    = RISK_BG[lvl];
                  const r     = 18 + Math.min(16, (node.activity_count || 0) * 0.7);
                  const sel   = selectedNode?.id === node.id;
                  const shortName = node.name.length > 13 ? node.name.slice(0, 11) + "…" : node.name;

                  return (
                    <g key={node.id} style={{ cursor: "pointer" }} onClick={() => selectNode(node)}>
                      {/* Selection ring */}
                      {sel && (
                        <circle cx={node.x} cy={node.y} r={r + 6}
                          fill="none" stroke={color} strokeWidth={2} opacity={0.5}
                          strokeDasharray="3,2" />
                      )}
                      {/* Node circle */}
                      <circle cx={node.x} cy={node.y} r={r}
                        fill={bg} stroke={color} strokeWidth={sel ? 2.5 : 1.5} />
                      {/* Risk score — always visible, white on dark bg */}
                      <text x={node.x} y={(node.y || 0) + 4}
                        textAnchor="middle" fontSize="11" fontWeight="700"
                        fill={color}>
                        {node.risk_score > 0 ? Math.round(node.risk_score) : ""}
                      </text>
                      {/* Node label — white text below circle */}
                      <text x={node.x} y={(node.y || 0) + r + 14}
                        textAnchor="middle" fontSize="10" fontWeight="500"
                        fill="#E2E8F0">
                        {shortName}
                      </text>
                      {/* Deny count badge */}
                      {node.deny_count > 0 && (
                        <>
                          <circle cx={(node.x || 0) + r - 4} cy={(node.y || 0) - r + 4} r={8}
                            fill="#DC2626" stroke="#0D1117" strokeWidth={1.5} />
                          <text x={(node.x || 0) + r - 4} y={(node.y || 0) - r + 8}
                            textAnchor="middle" fontSize="8" fontWeight="800" fill="white">
                            {node.deny_count}
                          </text>
                        </>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}

            <div className="absolute bottom-3 left-3 text-[10px] text-slate-600">
              Showing Top {Math.min(limit, nodes.length)} High Risk Nodes
            </div>
          </div>

          {/* Right panel — light theme */}
          <div className="w-72 flex-shrink-0 border-l border-slate-200 overflow-y-auto bg-white">
            {!selectedNode ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 px-6 text-center">
                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3">
                  <Cpu className="w-6 h-6 opacity-40" />
                </div>
                <p className="text-sm font-medium text-slate-500">Select a node</p>
                <p className="text-xs text-slate-400 mt-1">Click any node in the graph to inspect it</p>
              </div>
            ) : (
              <div className="p-4">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{selectedNode.label}</p>
                    <h3 className="font-bold text-slate-900 text-sm mt-0.5 truncate">{selectedNode.name}</h3>
                  </div>
                  <button onClick={() => { setSelectedNode(null); setNodeDetail(null); }}
                    className="text-slate-400 hover:text-slate-700 ml-2 flex-shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Risk badges */}
                <div className="flex items-center gap-2 mb-4">
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${RISK_TEXT[rl]}`}>
                    RISK {Math.round(selectedNode.risk_score)}
                  </span>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg capitalize ${RISK_TEXT[rl]}`}>
                    {rl}
                  </span>
                </div>

                {/* Activity summary — instant from local state */}
                <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-xl p-3 mb-4 border border-slate-100">
                  <div className="text-center">
                    <p className="text-lg font-bold text-slate-900">{selectedNode.activity_count}</p>
                    <p className="text-[9px] text-slate-500 uppercase tracking-wide">Events</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-red-600">{selectedNode.deny_count}</p>
                    <p className="text-[9px] text-slate-500 uppercase tracking-wide">Denied</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold text-green-600">{Math.max(0, selectedNode.activity_count - selectedNode.deny_count)}</p>
                    <p className="text-[9px] text-slate-500 uppercase tracking-wide">Allowed</p>
                  </div>
                </div>

                {/* SQL today-stats */}
                {nodeDetail?.sql_summary && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4">
                    <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wider mb-2">Today</p>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-base font-bold text-slate-900">{nodeDetail.sql_summary.requests_today}</p>
                        <p className="text-[9px] text-slate-500">Total</p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-green-600">{nodeDetail.sql_summary.allowed_today}</p>
                        <p className="text-[9px] text-slate-500">Allowed</p>
                      </div>
                      <div>
                        <p className="text-base font-bold text-red-600">{nodeDetail.sql_summary.denied_today}</p>
                        <p className="text-[9px] text-slate-500">Denied</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Connections */}
                {detailLoading ? (
                  <div className="flex justify-center py-6">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : nodeDetail?.connections?.length > 0 && (
                  <>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Connections ({nodeDetail.connections.length})
                    </p>
                    <div className="space-y-1 mb-4">
                      {nodeDetail.connections.slice(0, 10).map((c: any, i: number) => {
                        const Icon = TYPE_ICON[c.label] || Cpu;
                        return (
                          <button key={i}
                            onClick={() => { const n = nodeById(c.id); if (n) selectNode(n); }}
                            className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-left bg-slate-50 hover:bg-slate-100 border border-slate-100 transition-colors">
                            <Icon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                            <span className="flex-1 text-xs text-slate-700 truncate font-medium">{c.name}</span>
                            {c.decision && (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                                c.decision === "deny" ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600"
                              }`}>{c.decision.toUpperCase()}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {/* Recent events */}
                {nodeDetail?.recent_events?.length > 0 && (
                  <>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Recent Activity</p>
                    <div className="space-y-1">
                      {nodeDetail.recent_events.slice(0, 6).map((e: any) => (
                        <div key={e.id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-slate-50">
                          <span className="text-slate-600">{e.action || "access"}</span>
                          <span className={`font-bold text-[10px] ${e.status === "deny" ? "text-red-600" : "text-green-600"}`}>
                            {e.status?.toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Event feed — light theme ──────────────────────────── */}
        <div className="flex-shrink-0 border-t border-slate-200 bg-white" style={{ height: "180px" }}>
          <div className="flex items-center gap-4 px-4 border-b border-slate-100">
            {["all", "deny"].map(t => (
              <button key={t} onClick={() => setEventTab(t as any)}
                className={`text-xs font-semibold py-2.5 border-b-2 transition-colors ${
                  eventTab === t ? "border-blue-600 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-700"
                }`}>
                {t === "all" ? "All Events" : "Denied Events"}
              </button>
            ))}
          </div>
          <div className="overflow-y-auto" style={{ height: "136px" }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="text-slate-400 border-b border-slate-100">
                  {["Time", "Agent", "Asset/DB", "Action", "Result"].map(h => (
                    <th key={h} className="text-left px-4 py-1.5 font-semibold text-[10px] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-1.5 text-slate-400 tabular-nums">{ev.time ? new Date(ev.time).toLocaleTimeString() : "—"}</td>
                    <td className="px-4 py-1.5 text-slate-700 font-medium">{ev.agent_name}</td>
                    <td className="px-4 py-1.5 text-slate-500">{ev.asset_name}</td>
                    <td className="px-4 py-1.5 text-slate-500">{ev.action}</td>
                    <td className="px-4 py-1.5">
                      <span className={`font-bold text-[10px] px-2 py-0.5 rounded-full ${
                        ev.status === "deny"
                          ? "bg-red-100 text-red-600"
                          : "bg-green-100 text-green-600"
                      }`}>
                        {ev.status?.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

export default GraphExplorer;
