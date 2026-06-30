import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { graphApi, agentApi, assetApi } from "../lib/apiClient";
import { GraphData, GraphNode, GraphEdge, Agent, Asset, NodeDrillDown } from "../lib/types";
import LoadingSpinner from "../components/LoadingSpinner";
import Alert from "../components/Alert";
import { FiRefreshCw, FiX, FiShield, FiAlertTriangle, FiBarChart2, FiActivity, FiWifiOff } from "react-icons/fi";

const LAYER_ORDER = ["EndUser", "Agent", "Tool", "Asset", "Policy"] as const;



const NODE_COLOR: Record<string, string> = {
  EndUser:    "#8b5cf6",
  Agent:      "#6366f1",
  Tool:       "#10b981",
  Asset:      "#0ea5e9",
  DataSource: "#0ea5e9",
  Policy:     "#f59e0b",
  Unknown:    "#94a3b8",
};

const EDGE_COLOR: Record<string, string> = {
  END_USER_QUERIED_AGENT:  "#a78bfa",
  AGENT_ACCESS_ALLOWED:    "#10b981",
  AGENT_ACCESS_DENIED:     "#ef4444",
  AGENT_USES_ASSET:        "#6366f1",
  ASSET_CONNECTED_TO:      "#64748b",
  POLICY_PROTECTS_ASSET:   "#f59e0b",
};

const EDGE_LABEL: Record<string, string> = {
  END_USER_QUERIED_AGENT:  "QUERIED",
  AGENT_ACCESS_ALLOWED:    "ALLOWED",
  AGENT_ACCESS_DENIED:     "DENIED",
  AGENT_USES_ASSET:        "USES",
  ASSET_CONNECTED_TO:      "CONNECTS",
  POLICY_PROTECTS_ASSET:   "PROTECTS",
};

type TimeFilter = "all" | "1h" | "24h" | "7d";

const LAYER_GAP = 190;
const NODE_GAP = 80;
const PAD_LEFT = 80;
const PAD_TOP = 60;
const RADIUS = 22;

interface LayoutNode extends GraphNode { x: number; y: number; layer: number; }

function computeLayout(nodes: GraphNode[]): { layoutNodes: LayoutNode[]; svgW: number; svgH: number } {
  const byLayer: Record<string, GraphNode[]> = {};
  for (const n of nodes) {
    const layer = LAYER_ORDER.includes(n.label as any) ? n.label : "Asset";
    if (!byLayer[layer]) byLayer[layer] = [];
    byLayer[layer].push(n);
  }
  const layoutNodes: LayoutNode[] = [];
  let maxPerLayer = 0;
  LAYER_ORDER.forEach((layer, li) => {
    const grp = byLayer[layer] || [];
    maxPerLayer = Math.max(maxPerLayer, grp.length);
    grp.forEach((n, ni) => {
      layoutNodes.push({ ...n, layer: li, x: PAD_LEFT + li * LAYER_GAP, y: PAD_TOP + ni * NODE_GAP });
    });
  });
  const svgW = PAD_LEFT + (LAYER_ORDER.length - 1) * LAYER_GAP + PAD_LEFT;
  const svgH = Math.max(400, PAD_TOP + maxPerLayer * NODE_GAP + PAD_TOP);
  return { layoutNodes, svgW, svgH };
}

function edgeInWindow(edge: GraphEdge, tf: TimeFilter) {
  if (tf === "all" || !edge.timestamp) return true;
  const now = Date.now() / 1000;
  const delta: Record<string, number> = { "1h": 3600, "24h": 86400, "7d": 604800 };
  return now - (edge.timestamp as number) <= delta[tf];
}

// ── Severity badge colour ────────────────────────────────────
const SEV_COLOR: Record<string, string> = {
  critical: "text-red-600 bg-red-50",
  high:     "text-orange-600 bg-orange-50",
  medium:   "text-blue-600 bg-blue-50",
  low:      "text-green-600 bg-green-50",
  minimal:  "text-slate-500 bg-gray-50",
};

// ── Edge detail panel ─────────────────────────────────────────
function EdgePanel({ edge, onClose }: { edge: GraphEdge; onClose: () => void }) {
  const color = EDGE_COLOR[edge.type] || "#94a3b8";
  const label = EDGE_LABEL[edge.type] || edge.type;
  const ts = edge.timestamp ? new Date(edge.timestamp * 1000).toLocaleString() : "—";
  const isAllow = edge.decision === "allow";
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Edge Detail</p>
        <button onClick={onClose}><FiX className="w-3.5 h-3.5 text-slate-500" /></button>
      </div>
      <div className="flex items-center space-x-2">
        <span className="h-0.5 w-6 inline-block rounded" style={{ background: color }} />
        <span className="text-xs font-bold" style={{ color }}>{label}</span>
        {edge.decision && (
          <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${isAllow ? "bg-green-900 text-green-600" : "bg-red-900 text-red-600"}`}>
            {edge.decision.toUpperCase()}
          </span>
        )}
      </div>
      <div className="space-y-2 text-xs">
        {[
          ["From",    edge.from_name || edge.from],
          ["To",      edge.to_name   || edge.to],
          ["Action",  edge.action],
          ["Asset",   edge.asset_name],
          ["Policy",  edge.policy_name],
          ["Session", edge.session_id],
          ["Time",    ts],
        ].map(([k, v]) => v ? (
          <div key={k} className="flex justify-between">
            <span className="text-slate-400">{k}</span>
            <span className="text-slate-700 font-medium truncate max-w-[160px] text-right">{v}</span>
          </div>
        ) : null)}
        {edge.prompt_preview && (
          <div>
            <p className="text-slate-400 mb-1">Prompt</p>
            <p className="text-slate-600 bg-slate-100 rounded p-2 font-mono text-xs leading-relaxed break-words">
              "{edge.prompt_preview}"
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Node drill-down panel ─────────────────────────────────────
function NodeDrillDownPanel({
  node,
  drillDown,
  drillLoading,
  onClose,
}: {
  node: LayoutNode;
  drillDown: NodeDrillDown | null;
  drillLoading: boolean;
  onClose: () => void;
}) {
  const color = NODE_COLOR[node.label] || "#94a3b8";

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      {/* Node header */}
      <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
          <div>
            <p className="text-xs text-slate-400 uppercase tracking-wide">{node.label}</p>
            <p className="text-slate-900 font-semibold text-sm">{node.name}</p>
          </div>
        </div>
        <button onClick={onClose}><FiX className="w-3.5 h-3.5 text-slate-500" /></button>
      </div>

      {drillLoading ? (
        <div className="p-4"><LoadingSpinner size="sm" /></div>
      ) : drillDown ? (
        <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
          {/* Classification + type */}
          {(drillDown.classification || drillDown.asset_type || drillDown.agent_type) && (
            <div className="px-4 py-2 border-b border-slate-200 flex flex-wrap gap-2">
              {drillDown.classification && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-900 text-indigo-300">
                  {drillDown.classification}
                </span>
              )}
              {(drillDown.asset_type || drillDown.agent_type) && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  {drillDown.asset_type || drillDown.agent_type}
                </span>
              )}
            </div>
          )}

          {/* Risk score */}
          {drillDown.risk_score?.score != null && (
            <div className="px-4 py-3 border-b border-slate-200">
              <p className="text-xs text-slate-400 font-medium mb-2 flex items-center space-x-1">
                <FiShield className="w-3 h-3" /><span>Risk Score</span>
              </p>
              <div className="flex items-center space-x-3">
                <p className="text-2xl font-bold text-slate-900">{(drillDown.risk_score.score ?? 0).toFixed(1)}</p>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SEV_COLOR[drillDown.risk_score.severity] || "text-slate-500 bg-slate-100"}`}>
                  {(drillDown.risk_score.severity ?? "unknown").toUpperCase()}
                </span>
              </div>
              {drillDown.risk_score.recommendation && (
                <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">
                  {drillDown.risk_score.recommendation.slice(0, 100)}
                  {drillDown.risk_score.recommendation.length > 100 ? "…" : ""}
                </p>
              )}
            </div>
          )}

          {/* Allow / Deny counts */}
          {drillDown.event_counts && Object.keys(drillDown.event_counts).length > 0 && (
            <div className="px-4 py-3 border-b border-slate-200">
              <p className="text-xs text-slate-400 font-medium mb-2 flex items-center space-x-1">
                <FiBarChart2 className="w-3 h-3" /><span>Last 7 Days</span>
              </p>
              <div className="flex space-x-4">
                {drillDown.event_counts.allow !== undefined && (
                  <div>
                    <p className="text-green-600 font-bold text-lg">{drillDown.event_counts.allow || 0}</p>
                    <p className="text-slate-400 text-xs">Allowed</p>
                  </div>
                )}
                {drillDown.event_counts.deny !== undefined && (
                  <div>
                    <p className="text-red-600 font-bold text-lg">{drillDown.event_counts.deny || 0}</p>
                    <p className="text-slate-400 text-xs">Denied</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Related policies */}
          {drillDown.related_policies && drillDown.related_policies.length > 0 && (
            <div className="px-4 py-3 border-b border-slate-200">
              <p className="text-xs text-slate-400 font-medium mb-2 flex items-center space-x-1">
                <FiShield className="w-3 h-3" /><span>Related Policies</span>
              </p>
              <div className="space-y-1">
                {drillDown.related_policies.map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-600 truncate">{p.name}</span>
                    <span className={`font-bold ml-2 ${p.effect === "allow" ? "text-green-600" : "text-red-600"}`}>
                      {p.effect.toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Open incidents */}
          {drillDown.open_incidents && drillDown.open_incidents.length > 0 && (
            <div className="px-4 py-3 border-b border-slate-200">
              <p className="text-xs text-slate-400 font-medium mb-2 flex items-center space-x-1">
                <FiAlertTriangle className="w-3 h-3 text-red-600" />
                <span className="text-red-600">Open Incidents ({drillDown.open_incidents.length})</span>
              </p>
              <div className="space-y-1.5">
                {drillDown.open_incidents.map((inc) => (
                  <div key={inc.id} className="text-xs bg-red-900/20 border border-red-900/30 rounded-md p-2">
                    <p className="text-slate-600 line-clamp-2">{inc.description}</p>
                    <span className="text-red-600 font-medium capitalize">{inc.severity}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent events */}
          {drillDown.recent_events && drillDown.recent_events.length > 0 && (
            <div className="px-4 py-3">
              <p className="text-xs text-slate-400 font-medium mb-2 flex items-center space-x-1">
                <FiActivity className="w-3 h-3" /><span>Recent Events</span>
              </p>
              <div className="space-y-1.5">
                {drillDown.recent_events.slice(0, 6).map((ev: any) => (
                  <div key={ev.id} className="flex items-start space-x-2 text-xs">
                    <span className={`w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0 ${ev.status === "allow" ? "bg-green-400" : "bg-red-400"}`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between">
                        <span className="text-slate-600 capitalize">{ev.action}</span>
                        <span className={`font-bold ${ev.status === "allow" ? "text-green-600" : "text-red-600"}`}>
                          {ev.status?.toUpperCase()}
                        </span>
                      </div>
                      {ev.prompt_preview && (
                        <p className="text-slate-500 font-mono truncate">"{ev.prompt_preview}"</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 text-slate-500 text-xs">No drill-down data available.</div>
      )}
    </div>
  );
}

// ── Icon renderers ────────────────────────────────────────────
const NodeIcon = ({ label, size = 14 }: { label: string; size?: number }) => {
  const h = size / 2;
  if (label === "EndUser") return (
    <g>
      <circle cx={0} cy={-h * 0.35} r={h * 0.38} fill="white" />
      <path d={`M${-h * 0.7},${h} Q${-h * 0.7},${h * 0.2} 0,${h * 0.2} Q${h * 0.7},${h * 0.2} ${h * 0.7},${h}`} fill="white" />
    </g>
  );
  if (label === "Agent") return (
    <g>
      <rect x={-h * 0.8} y={-h * 0.65} width={h * 1.6} height={h * 1.3} rx={h * 0.2} fill="white" />
      <rect x={-h * 0.35} y={-h} width={h * 0.7} height={h * 0.4} rx={h * 0.15} fill="white" />
      <circle cx={-h * 0.35} cy={0} r={h * 0.18} fill={NODE_COLOR.Agent} />
      <circle cx={h * 0.35} cy={0} r={h * 0.18} fill={NODE_COLOR.Agent} />
      <path d={`M${-h * 0.35},${h * 0.38} L${h * 0.35},${h * 0.38}`} stroke={NODE_COLOR.Agent} strokeWidth={h * 0.15} strokeLinecap="round" />
    </g>
  );
  if (label === "Asset" || label === "DataSource") return (
    <g>
      <ellipse cx={0} cy={-h * 0.55} rx={h * 0.7} ry={h * 0.25} fill="white" />
      <rect x={-h * 0.7} y={-h * 0.55} width={h * 1.4} height={h * 1.1} fill="white" />
      <ellipse cx={0} cy={h * 0.55} rx={h * 0.7} ry={h * 0.25} fill="white" />
      <ellipse cx={0} cy={-h * 0.55} rx={h * 0.7} ry={h * 0.25} fill="white" />
      <ellipse cx={0} cy={0} rx={h * 0.7} ry={h * 0.18} fill={NODE_COLOR.Asset} fillOpacity={0.4} />
    </g>
  );
  if (label === "Policy") return (
    <g>
      <path d={`M0,${-h} L${h * 0.75},${-h * 0.5} L${h * 0.75},${h * 0.1} Q0,${h} ${-h * 0.75},${h * 0.1} L${-h * 0.75},${-h * 0.5} Z`} fill="white" />
    </g>
  );
  return (
    <g>
      <rect x={-h * 0.7} y={-h * 0.7} width={h * 1.4} height={h * 1.4} rx={h * 0.25} fill="white" />
      <path d={`M${-h * 0.35},0 L${h * 0.35},0 M0,${-h * 0.35} L0,${h * 0.35}`} stroke={NODE_COLOR.Tool} strokeWidth={h * 0.22} strokeLinecap="round" />
    </g>
  );
};




const Neo4jDegradedBanner: React.FC = () => (
  <div className="mb-4 flex items-start space-x-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
    <FiWifiOff className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
    <div>
      <p className="text-amber-800 font-semibold text-sm">
        Graph database offline
      </p>
      <p className="text-amber-700 text-xs mt-0.5">
        Neo4j is unreachable. The graph canvas will be empty until the
        connection is restored. All other features continue to work normally.
      </p>
    </div>
  </div>
);


// ── Main Component ────────────────────────────────────────────
const SecurityGraph: React.FC = () => {
  const router = useRouter();
  const [rawData, setRawData] = useState<GraphData>({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [neo4jAvailable, setNeo4jAvailable] = useState(true);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);

  const [edgeTypeFilter, setEdgeTypeFilter] = useState<"all" | "ALLOWED" | "DENIED">("all");
  const [agentFilter, setAgentFilter] = useState("");
  const [assetFilter, setAssetFilter] = useState("");
  const [endUserFilter, setEndUserFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");

  const [selectedNode, setSelectedNode] = useState<LayoutNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [drillDown, setDrillDown] = useState<NodeDrillDown | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.push("/login"); return; }
    fetchAll();
  }, []);

	const fetchAll = async () => {
	  setLoading(true);
	  setError(null);

	  try {
		const [gRes, aRes, asRes] = await Promise.all([
		  graphApi.getFullGraph(),
		  agentApi.list(),
		  assetApi.list(),
		]);

		if (gRes.data?.neo4j_available === false) {
		  setNeo4jAvailable(false);
		} else {
		  setNeo4jAvailable(true);
		}

		setRawData({
		  nodes: gRes.data?.nodes ?? [],
		  edges: gRes.data?.edges ?? [],
		});

		setAgents(aRes.data);
		setAssets(asRes.data);
	  } catch (err) {
		setNeo4jAvailable(false);

		setRawData({
		  nodes: [],
		  edges: [],
		});

		setError("Could not reach the backend. Check that the API is running.");
	  } finally {
		setLoading(false);
	  }
	};

  const handleSync = async () => {
    setSyncing(true);
    try { await graphApi.sync(); await fetchAll(); }
    catch { setError("Sync failed"); }
    finally { setSyncing(false); }
  };

  const handleNodeClick = async (node: LayoutNode) => {
    setSelectedEdge(null);
    setSelectedNode(node);
    setDrillDown(null);
    const nodeType = node.label === "Asset" || node.label === "DataSource" ? "asset"
                   : node.label === "Agent" ? "agent" : null;
    if (!nodeType) return;
    setDrillLoading(true);
    try {
      const res = await graphApi.getNodeDetail(node.id, nodeType);
      setDrillDown(res.data);
    } catch { /* no drill-down for this node type */ }
    finally { setDrillLoading(false); }
  };

  const activeFilters = edgeTypeFilter !== "all" || agentFilter || assetFilter || endUserFilter || timeFilter !== "all";

  const filteredEdges = rawData.edges.filter((e) => {
    if (!edgeInWindow(e, timeFilter)) return false;
    if (edgeTypeFilter === "ALLOWED" && e.type !== "AGENT_ACCESS_ALLOWED") return false;
    if (edgeTypeFilter === "DENIED"  && e.type !== "AGENT_ACCESS_DENIED")  return false;
    if (agentFilter) {
      const ag = agents.find((a) => a.id === agentFilter);
      if (ag && e.from !== ag.id && e.to !== ag.id) return false;
    }
    if (assetFilter && e.from !== assetFilter && e.to !== assetFilter && e.asset_id !== assetFilter) return false;
    if (endUserFilter) {
      const eu = rawData.nodes.find((n) => n.label === "EndUser" && n.id === endUserFilter);
      if (eu && e.from !== eu.id && e.to !== eu.id) return false;
    }
    return true;
  });

  const visibleNodeIds = activeFilters
    ? new Set(filteredEdges.flatMap((e) => [e.from, e.to]))
    : new Set(rawData.nodes.map((n) => n.id));
  const filteredNodes = rawData.nodes.filter((n) => visibleNodeIds.has(n.id));

  const { layoutNodes, svgW, svgH } = computeLayout(filteredNodes);
  const nodeById = new Map(layoutNodes.map((n) => [n.id, n]));
  const endUsers = rawData.nodes.filter((n) => n.label === "EndUser");

  return (
    <>
      <Head><title>Security Graph - AI-SecOS</title></Head>
      <main className="min-h-screen text-slate-900 py-6">
        <div className="max-w-[1400px] mx-auto px-4">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-2xl font-bold">Security Graph</h1>
              <p className="text-slate-500 text-sm mt-0.5">End User → Agent → Asset → Policy</p>
            </div>
            <button
              onClick={handleSync} disabled={syncing}
              className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
            >
              <FiRefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
              <span>{syncing ? "Syncing…" : "Sync from DB"}</span>
            </button>
          </div>

          {error && <Alert type="warning" message={error} onClose={() => setError(null)} />} {!neo4jAvailable && <Neo4jDegradedBanner />}

          {/* Filter bar */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 mb-4 flex flex-wrap gap-3 items-center">
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wide flex-shrink-0">Filters</span>
            {[
              { value: edgeTypeFilter, setter: setEdgeTypeFilter as any, options: [["all","All Decisions"],["ALLOWED","ALLOWED only"],["DENIED","DENIED only"]] },
            ].map(({ value, setter, options }) => (
              <select key={options[0][0]} value={value} onChange={(e) => setter(e.target.value)}
                className="bg-white border border-slate-200 text-slate-600 text-xs rounded-lg px-2.5 py-1.5">
                {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            ))}
            <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-600 text-xs rounded-lg px-2.5 py-1.5">
              <option value="">All Agents</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={assetFilter} onChange={(e) => setAssetFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-600 text-xs rounded-lg px-2.5 py-1.5">
              <option value="">All Assets</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={endUserFilter} onChange={(e) => setEndUserFilter(e.target.value)}
              className="bg-white border border-slate-200 text-slate-600 text-xs rounded-lg px-2.5 py-1.5">
              <option value="">All End Users</option>
              {endUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select value={timeFilter} onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
              className="bg-white border border-slate-200 text-slate-600 text-xs rounded-lg px-2.5 py-1.5">
              <option value="all">All Time</option>
              <option value="1h">Last 1 hour</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
            </select>
            {activeFilters && (
              <button
                onClick={() => { setEdgeTypeFilter("all"); setAgentFilter(""); setAssetFilter(""); setEndUserFilter(""); setTimeFilter("all"); }}
                className="ml-auto text-xs text-indigo-600 hover:text-indigo-300 flex items-center space-x-1"
              >
                <FiX className="w-3 h-3" /><span>Clear</span>
              </button>
            )}
          </div>

          {/* Layer labels */}
          <div className="bg-white border border-slate-200 rounded-t-xl px-4 pt-3 flex"
            style={{ paddingLeft: `${PAD_LEFT - 10}px` }}>
            {LAYER_ORDER.map((layer) => (
              <div key={layer} className="text-xs font-semibold uppercase tracking-widest flex-shrink-0"
                style={{ width: `${LAYER_GAP}px`, color: NODE_COLOR[layer] || "#94a3b8" }}>
                {layer === "Asset" ? "Assets / DBs" : layer === "Policy" ? "Policies" : `${layer}s`}
              </div>
            ))}
          </div>

          <div className="flex gap-4">
            {/* Canvas */}
            <div className="flex-1 bg-white border border-slate-200 border-t-0 rounded-b-xl overflow-auto relative min-h-[480px]">
              {loading ? (
                <div className="flex items-center justify-center h-[480px]"><LoadingSpinner text="Loading graph…" /></div>
              ) : layoutNodes.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[480px] text-slate-500">
                  <p className="text-base mb-2">No graph data</p>
                  <p className="text-sm">Click <span className="text-indigo-600">Sync from DB</span> to populate</p>
                </div>
              ) : (
                <svg viewBox={`0 0 ${svgW} ${svgH}`} width={svgW} height={svgH} className="min-w-full" style={{ display: "block" }}>
                  <defs>
                    {Object.entries(EDGE_COLOR).map(([type, color]) => (
                      <marker key={type} id={`arr-${type}`} viewBox="0 0 10 10" refX="24" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                        <path d="M 0 0 L 10 5 L 0 10 z" fill={color} fillOpacity={0.85} />
                      </marker>
                    ))}
                  </defs>

                  {LAYER_ORDER.slice(0, -1).map((_, li) => (
                    <line key={li}
                      x1={PAD_LEFT + li * LAYER_GAP + LAYER_GAP / 2} y1={0}
                      x2={PAD_LEFT + li * LAYER_GAP + LAYER_GAP / 2} y2={svgH}
                      stroke="#1f2937" strokeWidth={1} strokeDasharray="4 4" />
                  ))}

                  {filteredEdges.map((edge, i) => {
                    const src = nodeById.get(edge.from);
                    const tgt = nodeById.get(edge.to);
                    if (!src || !tgt) return null;
                    const color = EDGE_COLOR[edge.type] || "#64748b";
                    const label = EDGE_LABEL[edge.type] || edge.type;
                    const x1 = src.x + RADIUS, y1 = src.y, x2 = tgt.x - RADIUS, y2 = tgt.y;
                    const cx = (x1 + x2) / 2;
                    const d = `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
                    const isSel = selectedEdge?.from === edge.from && selectedEdge?.to === edge.to && selectedEdge?.type === edge.type;
                    return (
                      <g key={edge.id || i} onClick={(ev) => { ev.stopPropagation(); setSelectedNode(null); setSelectedEdge(isSel ? null : edge); }} className="cursor-pointer">
                        <path d={d} stroke="transparent" strokeWidth={12} fill="none" />
                        <path d={d} stroke={color} strokeWidth={isSel ? 2.5 : 1.5} fill="none" strokeOpacity={isSel ? 1 : 0.65} markerEnd={`url(#arr-${edge.type})`} />
                        <text x={cx} y={((y1 + y2) / 2) - 5} textAnchor="middle" fontSize={8} fill={color} fillOpacity={0.9} style={{ pointerEvents: "none" }}>{label}</text>
                      </g>
                    );
                  })}

                  {layoutNodes.map((node) => {
                    const color = NODE_COLOR[node.label] || NODE_COLOR.Unknown;
                    const isSel = selectedNode?.id === node.id;
                    return (
                      <g key={node.id} transform={`translate(${node.x},${node.y})`}
                        onClick={(ev) => { ev.stopPropagation(); setSelectedEdge(null); handleNodeClick(node); }}
                        className="cursor-pointer">
                        {isSel && <circle r={RADIUS + 5} fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.5} />}
                        <circle r={RADIUS} fill={color} fillOpacity={0.92} stroke={isSel ? "#fff" : color} strokeWidth={isSel ? 2 : 0} />
                        <NodeIcon label={node.label} size={14} />
                        <text textAnchor="middle" dy={RADIUS + 14} fontSize={9.5} fill="#cbd5e1" style={{ pointerEvents: "none" }}>
                          {node.name.length > 15 ? node.name.slice(0, 14) + "…" : node.name}
                        </text>
                        {node.label === "EndUser" && node.email && node.email !== node.name && (
                          <text textAnchor="middle" dy={RADIUS + 25} fontSize={8} fill="#6b7280" style={{ pointerEvents: "none" }}>
                            {node.email.length > 18 ? node.email.slice(0, 17) + "…" : node.email}
                          </text>
                        )}
                      </g>
                    );
                  })}
                </svg>
              )}
              {!loading && layoutNodes.length > 0 && (
                <div className="absolute bottom-3 left-3 flex space-x-4 text-xs text-slate-500">
                  <span>{layoutNodes.length} nodes</span>
                  <span>{filteredEdges.length} edges</span>
                  {activeFilters && <span className="text-indigo-500">filtered</span>}
                  <span>click node or edge to inspect</span>
                </div>
              )}
            </div>

            {/* Right panel */}
            <div className="w-72 flex-shrink-0 space-y-3">
              {selectedEdge ? (
                <EdgePanel edge={selectedEdge} onClose={() => setSelectedEdge(null)} />
              ) : selectedNode ? (
                <NodeDrillDownPanel
                  node={selectedNode}
                  drillDown={drillDown}
                  drillLoading={drillLoading}
                  onClose={() => { setSelectedNode(null); setDrillDown(null); }}
                />
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl p-4 text-slate-500 text-sm">
                  Click a node or edge to inspect it
                </div>
              )}

              {/* Legend */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-2">Node Types</p>
                  {(["EndUser","Agent","Asset","Policy","Tool"] as const).map((t) => (
                    <div key={t} className="flex items-center space-x-2 text-xs mb-1">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: NODE_COLOR[t] }} />
                      <span className="text-slate-500">{t}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wide mb-2">Edge Types</p>
                  {Object.entries(EDGE_LABEL).map(([type, label]) => (
                    <div key={type} className="flex items-center space-x-2 text-xs mb-1">
                      <span className="w-7 h-0.5 flex-shrink-0 rounded" style={{ background: EDGE_COLOR[type] }} />
                      <span className="text-slate-500">{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
};

export default SecurityGraph;
