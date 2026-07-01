/**
 * pages/graph.tsx
 * Graph Explorer v2 — Enterprise SOC redesign
 *
 * Three coordinated views:
 *   Left/Top:    KPI bar + filters + search
 *   Center:      Risk-ranked interactive graph (Top-N nodes, not everything)
 *   Right:       Context panel (selected node detail, risk breakdown, activity)
 *   Bottom:      Live event feed table
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { getOrgToken } from "../lib/tokens";
import orgApi from "../lib/orgApi";
import {
  Search, RefreshCw, Bell, ChevronDown, X, ZoomIn, ZoomOut,
  Maximize2, Lock, Cpu, Database, Shield, Wrench, User as UserIcon,
  AlertTriangle, Activity, Link2,
} from "lucide-react";

// ── Risk color map (enterprise SOC palette per spec) ────────────
const RISK_COLOR: Record<string, string> = {
  critical: "#EF4444",
  high:     "#F97316",
  medium:   "#EAB308",
  low:      "#22C55E",
  info:     "#3B82F6",
};
const RISK_BG: Record<string, string> = {
  critical: "#7F1D1D",
  high:     "#7C2D12",
  medium:   "#713F12",
  low:      "#14532D",
  info:     "#1E3A5F",
};

const TYPE_ICON: Record<string, any> = {
  Agent: Cpu, Asset: Database, Policy: Shield, Tool: Wrench, EndUser: UserIcon,
};

const WINDOWS = [
  { id: "15min", label: "Last 15 min" },
  { id: "1hour", label: "Last 1 Hour" },
  { id: "today",  label: "Today" },
  { id: "week",   label: "Last Week" },
];

interface GNode {
  id: string; label: string; name: string; type?: string;
  risk_score: number; risk_level: string;
  activity_count: number; deny_count: number;
  x?: number; y?: number;
}
interface GEdge {
  id: string; from: string; to: string; from_name: string; to_name: string;
  type: string; action?: string; decision?: string;
}

// ════════════════════════════════════════════════════════════════
// Force-directed layout (simple radial, no external dependency)
// ════════════════════════════════════════════════════════════════
function layoutNodes(nodes: GNode[], width: number, height: number): GNode[] {
  const cx = width / 2, cy = height / 2;
  const n = nodes.length;
  // Highest-risk node goes center, rest ring around it by type cluster
  const sorted = [...nodes].sort((a, b) => b.risk_score - a.risk_score);
  return sorted.map((node, i) => {
    if (i === 0) return { ...node, x: cx, y: cy };
    const ring = Math.ceil(i / 8);
    const posInRing = (i - 1) % 8;
    const angle = (posInRing / Math.min(8, n - 1)) * 2 * Math.PI;
    const radius = ring * Math.min(width, height) * 0.28;
    return {
      ...node,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });
}

// ════════════════════════════════════════════════════════════════
// Main Page
// ════════════════════════════════════════════════════════════════
const GraphExplorer: React.FC = () => {
  const router = useRouter();
  const svgRef = useRef<SVGSVGElement>(null);

  const [kpis, setKpis]           = useState<any>(null);
  const [nodes, setNodes]         = useState<GNode[]>([]);
  const [edges, setEdges]         = useState<GEdge[]>([]);
  const [totalNodes, setTotal]    = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [riskFilter, setRiskFilter] = useState("all");
  const [window_, setWindow]        = useState("1hour");
  const [limit, setLimit]           = useState(25);
  const [searchQ, setSearchQ]       = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [nodeDetail, setNodeDetail]     = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [events, setEvents]       = useState<any[]>([]);
  const [eventTab, setEventTab]   = useState<"all"|"deny">("all");
  const [zoom, setZoom]           = useState(100);

  useEffect(() => {
    if (!getOrgToken()) { router.push("/login"); return; }
    loadOverview();
    loadEvents();
    const interval = setInterval(() => { loadOverview(); loadEvents(); }, 30000);
    return () => clearInterval(interval);
  }, [riskFilter, window_, limit]);

  const loadOverview = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await orgApi.get("/graph/overview", {
        params: { limit, risk: riskFilter, window: window_ },
      });
      setKpis(r.data.kpis);
      const laidOut = layoutNodes(r.data.graph.nodes || [], 900, 480);
      setNodes(laidOut);
      setEdges(r.data.graph.edges || []);
      setTotal(r.data.graph.total_nodes || 0);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to load graph overview.");
    } finally { setLoading(false); }
  }, [riskFilter, window_, limit]);

  const loadEvents = useCallback(async () => {
    try {
      const r = await orgApi.get("/graph/events", {
        params: { limit: 15, status: eventTab === "deny" ? "deny" : undefined },
      });
      setEvents(r.data);
    } catch { /* non-fatal */ }
  }, [eventTab]);

  useEffect(() => { loadEvents(); }, [eventTab]);

  const selectNode = async (nodeId: string) => {
    setSelectedNode(nodeId);
    setDetailLoading(true);
    try {
      const r = await orgApi.get(`/graph/node/${nodeId}`);
      setNodeDetail(r.data);
    } catch {
      setNodeDetail(null);
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

  return (
    <>
      <Head><title>Graph Explorer — AI-SecOS</title></Head>
      <div className="h-screen flex flex-col overflow-hidden" style={{ background: "#0B1120" }}>

        {/* ── Top bar: search + window + refresh ──────────────── */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-800 flex-shrink-0" style={{ background: "#0F172A" }}>
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={searchQ}
              onChange={e => doSearch(e.target.value)}
              placeholder="Search agents, users, tools, assets, policies, incidents..."
              className="w-full bg-slate-800/60 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {searchResults.length > 0 && (
              <div className="absolute top-full mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 max-h-72 overflow-y-auto">
                {searchResults.map(r => (
                  <button key={r.id} onClick={() => { selectNode(r.id); setSearchResults([]); setSearchQ(""); }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-800 flex items-center justify-between text-sm">
                    <span className="text-slate-200">{r.name}</span>
                    <span className="text-xs text-slate-500">{r.type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <select value={window_} onChange={e => setWindow(e.target.value)}
            className="bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200">
            {WINDOWS.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>

          <button onClick={() => { loadOverview(); loadEvents(); }}
            className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 relative">
            <Bell className="w-4 h-4" />
            {kpis?.open_incidents > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[9px] flex items-center justify-center text-white font-bold">
                {kpis.open_incidents}
              </span>
            )}
          </button>
        </div>

        {/* ── KPI Bar ──────────────────────────────────────────── */}
        <div className="grid grid-cols-7 gap-px border-b border-slate-800 flex-shrink-0" style={{ background: "#1E293B" }}>
          {[
            { label:"AI AGENTS",   value: kpis?.agents,           icon: Cpu,      color:"#3B82F6" },
            { label:"ASSETS/DBS",  value: kpis?.assets,           icon: Database, color:"#14B8A6" },
            { label:"POLICIES",    value: kpis?.policies,         icon: Shield,   color:"#F59E0B" },
            { label:`REQUESTS (${window_})`, value: kpis?.requests_window, icon: Activity, color:"#8B5CF6" },
            { label:`DENIED (${window_})`,   value: kpis?.denied_window,   icon: AlertTriangle, color:"#EF4444" },
            { label:"HIGH RISK AGENTS", value: kpis?.high_risk_agents, icon: AlertTriangle, color:"#F97316" },
            { label:"OPEN INCIDENTS",   value: kpis?.open_incidents,   icon: Bell,    color:"#EF4444" },
          ].map(k => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="px-4 py-3" style={{ background: "#0F172A" }}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-3.5 h-3.5" style={{ color: k.color }} />
                  <span className="text-[10px] font-semibold text-slate-500 tracking-wide">{k.label}</span>
                </div>
                <p className="text-xl font-bold text-white">{k.value ?? "—"}</p>
              </div>
            );
          })}
        </div>

        {/* ── Filters row ──────────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-800 flex-shrink-0" style={{ background: "#0F172A" }}>
          <span className="text-xs text-slate-500 mr-1">Risk:</span>
          {["all","critical","high","medium","low"].map(r => (
            <button key={r} onClick={() => setRiskFilter(r)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors capitalize ${
                riskFilter === r
                  ? "text-white border-transparent"
                  : "text-slate-400 border-slate-700 hover:border-slate-500"
              }`}
              style={riskFilter === r ? { background: r === "all" ? "#3B82F6" : RISK_COLOR[r] } : {}}>
              {r}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500">Showing top {Math.min(limit, nodes.length)} of {totalNodes}</span>
            {totalNodes > limit && (
              <button onClick={() => setLimit(l => l + 25)}
                className="text-xs text-blue-400 hover:text-blue-300 font-medium">Load More</button>
            )}
          </div>
        </div>

        {/* ── Main 3-panel layout ──────────────────────────────── */}
        <div className="flex-1 flex overflow-hidden">

          {/* Center: Graph canvas */}
          <div className="flex-1 relative overflow-hidden" style={{ background: "#0B1120" }}>
            {/* Legend */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-3 bg-slate-900/80 backdrop-blur px-3 py-1.5 rounded-lg border border-slate-800">
              {Object.entries(RISK_COLOR).map(([level, color]) => (
                <div key={level} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-[10px] text-slate-400 capitalize">{level}</span>
                </div>
              ))}
            </div>

            {/* Zoom controls */}
            <div className="absolute top-3 right-3 z-10 flex flex-col gap-1 bg-slate-900/80 backdrop-blur rounded-lg border border-slate-800 p-1">
              <button onClick={() => setZoom(z => Math.min(200, z + 10))} className="p-1.5 hover:bg-slate-800 rounded text-slate-400">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setZoom(z => Math.max(50, z - 10))} className="p-1.5 hover:bg-slate-800 rounded text-slate-400">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => setZoom(100)} className="p-1.5 hover:bg-slate-800 rounded text-slate-400">
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : error ? (
              <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>
            ) : nodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <Link2 className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">No graph data for this filter/time window.</p>
                <p className="text-xs mt-1">Run a connector decision to populate the graph.</p>
              </div>
            ) : (
              <svg ref={svgRef} width="100%" height="100%" viewBox="0 0 900 480"
                style={{ transform: `scale(${zoom / 100})`, transformOrigin: "center" }}>
                {/* Edges */}
                {edges.map(edge => {
                  const from = nodeById(edge.from);
                  const to   = nodeById(edge.to);
                  if (!from || !to || from.x == null || to.x == null) return null;
                  const isDeny = edge.decision === "deny";
                  return (
                    <g key={edge.id}>
                      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                        stroke={isDeny ? "#EF4444" : "#475569"}
                        strokeWidth={isDeny ? 2 : 1}
                        strokeDasharray={isDeny ? "4,3" : undefined}
                        opacity={0.6} />
                    </g>
                  );
                })}
                {/* Nodes */}
                {nodes.map(node => {
                  if (node.x == null) return null;
                  const color = RISK_COLOR[node.risk_level] || "#64748B";
                  const r = 18 + Math.min(20, node.activity_count * 0.5);
                  const isSelected = selectedNode === node.id;
                  const Icon = TYPE_ICON[node.label] || Cpu;
                  return (
                    <g key={node.id} style={{ cursor: "pointer" }} onClick={() => selectNode(node.id)}>
                      <circle cx={node.x} cy={node.y} r={r}
                        fill={RISK_BG[node.risk_level] || "#1E293B"}
                        stroke={color} strokeWidth={isSelected ? 3 : 2} />
                      <text x={node.x} y={(node.y || 0) + r + 14} textAnchor="middle"
                        fontSize="10" fill="#CBD5E1" fontWeight={isSelected ? 700 : 500}>
                        {node.name.length > 16 ? node.name.slice(0, 14) + "…" : node.name}
                      </text>
                      {node.deny_count > 0 && (
                        <text x={node.x} y={(node.y || 0) + 4} textAnchor="middle"
                          fontSize="10" fill={color} fontWeight={700}>
                          {node.risk_score}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Bottom-left mini-map placeholder + status */}
            <div className="absolute bottom-3 left-3 text-[10px] text-slate-600">
              Showing Top {Math.min(limit, nodes.length)} High Risk Nodes
            </div>
          </div>

          {/* Right: Context panel */}
          <div className="w-80 flex-shrink-0 border-l border-slate-800 overflow-y-auto" style={{ background: "#0F172A" }}>
            {!selectedNode ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 px-6 text-center">
                <Cpu className="w-8 h-8 mb-3 opacity-30" />
                <p className="text-sm">Select a node to view details</p>
              </div>
            ) : detailLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : nodeDetail ? (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-white text-sm">{nodeDetail.node?.name}</h3>
                  <button onClick={() => { setSelectedNode(null); setNodeDetail(null); }}
                    className="text-slate-500 hover:text-white"><X className="w-4 h-4" /></button>
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] font-bold px-2 py-1 rounded"
                    style={{ background: RISK_BG[nodeDetail.node?.risk_level] || "#1E293B", color: RISK_COLOR[nodeDetail.node?.risk_level] || "#94A3B8" }}>
                    RISK SCORE {nodeDetail.node?.risk_score ?? 0}
                  </span>
                </div>

                {nodeDetail.sql_summary && (
                  <div className="bg-slate-800/50 rounded-lg p-3 mb-4 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold text-white">{nodeDetail.sql_summary.requests_today}</p>
                      <p className="text-[9px] text-slate-500">Today</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-green-400">{nodeDetail.sql_summary.allowed_today}</p>
                      <p className="text-[9px] text-slate-500">Allowed</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-red-400">{nodeDetail.sql_summary.denied_today}</p>
                      <p className="text-[9px] text-slate-500">Denied</p>
                    </div>
                  </div>
                )}

                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Connections ({nodeDetail.connections?.length || 0})</p>
                <div className="space-y-1.5 mb-4">
                  {(nodeDetail.connections || []).slice(0, 12).map((c: any, i: number) => {
                    const Icon = TYPE_ICON[c.label] || Cpu;
                    return (
                      <button key={i} onClick={() => selectNode(c.id)}
                        className="w-full flex items-center gap-2 bg-slate-800/40 hover:bg-slate-800 rounded-lg px-2.5 py-2 text-left transition-colors">
                        <Icon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-200 truncate">{c.name}</p>
                          <p className="text-[9px] text-slate-500">{c.relationship}</p>
                        </div>
                        {c.decision && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            c.decision === "deny" ? "bg-red-900/40 text-red-400" : "bg-green-900/40 text-green-400"
                          }`}>{c.decision}</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                {nodeDetail.recent_events?.length > 0 && (
                  <>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-2">Recent Activity</p>
                    <div className="space-y-1.5">
                      {nodeDetail.recent_events.slice(0, 6).map((e: any) => (
                        <div key={e.id} className="flex items-center justify-between text-[10px] py-1 border-b border-slate-800/60">
                          <span className="text-slate-400">{e.action || "access"}</span>
                          <span className={e.status === "deny" ? "text-red-400 font-semibold" : "text-green-400 font-semibold"}>
                            {e.status?.toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="p-4 text-sm text-slate-500">Could not load node detail.</div>
            )}
          </div>
        </div>

        {/* ── Bottom: Live event feed ──────────────────────────── */}
        <div className="h-48 border-t border-slate-800 flex-shrink-0 flex flex-col" style={{ background: "#0F172A" }}>
          <div className="flex items-center gap-4 px-4 pt-2 border-b border-slate-800">
            {["all","deny"].map(t => (
              <button key={t} onClick={() => setEventTab(t as any)}
                className={`text-xs font-medium pb-2 border-b-2 transition-colors ${
                  eventTab === t ? "border-blue-500 text-blue-400" : "border-transparent text-slate-500 hover:text-slate-300"
                }`}>
                {t === "all" ? "All Events" : "Denied Events"}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0" style={{ background: "#0F172A" }}>
                <tr className="text-slate-500 border-b border-slate-800">
                  {["Time","Agent","Asset/DB","Action","Result"].map(h => (
                    <th key={h} className="text-left px-4 py-1.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map(ev => (
                  <tr key={ev.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-4 py-1.5 text-slate-500">{ev.time ? new Date(ev.time).toLocaleTimeString() : "—"}</td>
                    <td className="px-4 py-1.5 text-slate-300">{ev.agent_name}</td>
                    <td className="px-4 py-1.5 text-slate-300">{ev.asset_name}</td>
                    <td className="px-4 py-1.5 text-slate-400">{ev.action}</td>
                    <td className="px-4 py-1.5">
                      <span className={`font-bold ${ev.status === "deny" ? "text-red-400" : "text-green-400"}`}>
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
