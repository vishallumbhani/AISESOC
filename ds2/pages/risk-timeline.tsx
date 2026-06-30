/**
 * pages/risk-timeline.tsx
 * Risk Timeline — light theme, fixed auth bug (getOrgToken).
 */
import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { getOrgToken } from "../lib/tokens";
import { assetApi } from "../lib/apiClient";
import { Asset } from "../lib/types";
import { TrendingUp, ArrowLeft, AlertTriangle, X } from "lucide-react";

// ── Risk colour helpers ────────────────────────────────────────
const SEV_COLOR: Record<string, string> = {
  critical: "text-red-600",
  high:     "text-orange-500",
  medium:   "text-amber-500",
  low:      "text-green-600",
  minimal:  "text-slate-400",
};

const CLASS_BADGE: Record<string, string> = {
  public:       "bg-green-50  text-green-700  border border-green-200",
  internal:     "bg-blue-50   text-blue-700   border border-blue-200",
  confidential: "bg-amber-50  text-amber-700  border border-amber-200",
  restricted:   "bg-red-50    text-red-700    border border-red-200",
};

interface DayBucket { date: string; deny_count: number; allow_count: number; }
interface RiskHistory {
  asset: { id: string; name: string; classification: string; current_score: number; current_severity: string; };
  history: DayBucket[];
}

// ── Bar chart (SVG) ────────────────────────────────────────────
function BarChart({ history }: { history: DayBucket[] }) {
  const maxVal = Math.max(...history.map((h) => h.deny_count + h.allow_count), 1);
  const W = 700; const H = 120; const PAD = 28;
  const bW = Math.max(4, (W - PAD * 2) / history.length - 2);
  return (
    <svg viewBox={`0 0 ${W} ${H + 28}`} className="w-full">
      {/* Y axis labels */}
      {[0, Math.round(maxVal / 2), maxVal].map((v, i) => (
        <text key={i} x={PAD - 5} y={H - (v / maxVal) * H + PAD / 2}
          textAnchor="end" fontSize="10" fill="#94A3B8">{v}</text>
      ))}
      {/* Bars */}
      {history.map((d, i) => {
        const x      = PAD + i * ((W - PAD * 2) / history.length);
        const total  = d.deny_count + d.allow_count;
        const totalH = (total / maxVal) * H;
        const denyH  = totalH > 0 ? (d.deny_count / total) * totalH : 0;
        const allowH = totalH - denyH;
        return (
          <g key={i}>
            {/* allow (bottom, green) */}
            <rect x={x} y={H - totalH + PAD / 2} width={bW} height={allowH} fill="#BBF7D0" rx="2">
              <title>{d.date}: {d.allow_count} allowed</title>
            </rect>
            {/* deny (top, red/orange) */}
            <rect x={x} y={H - totalH + PAD / 2 + allowH} width={bW} height={denyH}
              fill={d.deny_count > 3 ? "#EF4444" : "#F97316"} rx="2" opacity=".85">
              <title>{d.date}: {d.deny_count} denials</title>
            </rect>
          </g>
        );
      })}
      {/* X axis labels */}
      {history.filter((_, i) => i % Math.ceil(history.length / 10) === 0).map((d, i) => {
        const origIdx = history.indexOf(d);
        const x = PAD + origIdx * ((W - PAD * 2) / history.length);
        return (
          <text key={i} x={x + bW / 2} y={H + PAD / 2 + 16}
            textAnchor="middle" fontSize="9" fill="#94A3B8">{d.date.slice(5)}</text>
        );
      })}
    </svg>
  );
}

// ── Page ───────────────────────────────────────────────────────
const RiskTimeline: React.FC = () => {
  const router = useRouter();
  const [assets, setAssets]         = useState<Asset[]>([]);
  const [selected, setSelected]     = useState("");
  const [days, setDays]             = useState(30);
  const [history, setHistory]       = useState<RiskHistory | null>(null);
  const [loading, setLoading]       = useState(true);
  const [histLoading, setHistLoad]  = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    // FIX: was localStorage.getItem("token") — now uses getOrgToken()
    if (!getOrgToken()) { router.push("/login"); return; }
    assetApi.list()
      .then((r) => {
        setAssets(r.data);
        if (r.data.length) setSelected(r.data[0].id);
      })
      .catch(() => setError("Failed to load assets."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setHistLoad(true); setHistory(null);
    assetApi.getRiskHistory(selected, days)
      .then((r) => setHistory(r.data))
      .catch(() => setError("Failed to load risk history for this asset."))
      .finally(() => setHistLoad(false));
  }, [selected, days]);

  const totalDenials = history?.history.reduce((s, d) => s + d.deny_count, 0) ?? 0;
  const peakDay = history?.history.reduce(
    (peak, d) => d.deny_count > peak.deny_count ? d : peak,
    { date: "—", deny_count: 0, allow_count: 0 }
  );

  const riskBarColor = (sev: string) => {
    const m: Record<string, string> = {
      critical: "#EF4444", high: "#F97316", medium: "#F59E0B", low: "#22C55E", minimal: "#D1D5DB"
    };
    return m[sev] || "#D1D5DB";
  };

  return (
    <>
      <Head><title>Risk Timeline — AI-SecOS</title></Head>
      <div className="ent-page">
        <div className="ent-page-inner" style={{ maxWidth: 900 }}>

          {/* Header */}
          <div className="ent-header">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button
                onClick={() => router.back()}
                className="ent-btn-icon"
                style={{ marginRight: 4 }}>
                <ArrowLeft size={18} />
              </button>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 36, height: 36, background: "#EFF6FF", borderRadius: 10,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <TrendingUp size={18} color="#2563EB" />
                  </div>
                  <h1 className="ent-title">Risk Timeline</h1>
                </div>
                <p className="ent-subtitle">Track denial events and risk score evolution per asset.</p>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="ent-alert ent-alert-error" style={{ marginBottom: 20 }}>
              <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ flex: 1 }}>{error}</span>
              <button className="ent-btn-icon" onClick={() => setError(null)}>
                <X size={14} />
              </button>
            </div>
          )}

          {/* Loading */}
          {loading ? (
            <div style={{ display: "flex", gap: 12, flexDirection: "column" }}>
              {[1, 2].map(i => (
                <div key={i} className="ent-skeleton" style={{ height: 80, borderRadius: 12 }} />
              ))}
            </div>
          ) : (
            <>
              {/* Controls */}
              <div className="ent-card ent-card-sm" style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <label className="ent-label">Asset</label>
                    <select
                      className="ent-select"
                      value={selected}
                      onChange={(e) => setSelected(e.target.value)}>
                      {assets.length === 0 && <option value="">No assets found</option>}
                      {assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} [{a.classification}]
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="ent-label">Window</label>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[7, 14, 30, 60].map((d) => (
                        <button key={d} onClick={() => setDays(d)}
                          className={days === d ? "ent-btn ent-btn-primary ent-btn-sm" : "ent-btn ent-btn-secondary ent-btn-sm"}>
                          {d}d
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* History panel */}
              {histLoading ? (
                <div className="ent-skeleton" style={{ height: 200, borderRadius: 14 }} />
              ) : !history ? (
                <div className="ent-card">
                  <div className="ent-empty">
                    <div className="ent-empty-icon">
                      <TrendingUp size={24} />
                    </div>
                    <p className="ent-empty-title">Select an asset to view its risk history</p>
                    <p className="ent-empty-desc">
                      Runtime denial events will appear here as a daily timeline.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Asset summary card */}
                  <div className="ent-card" style={{ marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <h2 className="ent-section-title">{history.asset.name}</h2>
                          <span className={`ent-badge text-xs px-2 py-0.5 rounded-full ${CLASS_BADGE[history.asset.classification] || ""}`}>
                            {history.asset.classification}
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p style={{ fontSize: "2.25rem", fontWeight: 800, lineHeight: 1, color: "#111827" }}>
                          {history.asset.current_score.toFixed(0)}
                        </p>
                        <p className={`font-semibold capitalize ${SEV_COLOR[history.asset.current_severity] || "text-slate-400"}`}
                          style={{ fontSize: 13 }}>
                          {history.asset.current_severity}
                        </p>
                        <p style={{ fontSize: 11, color: "#94A3B8" }}>Current risk score</p>
                      </div>
                    </div>

                    {/* Risk bar */}
                    <div className="ent-risk-track" style={{ marginBottom: 20 }}>
                      <div className="ent-risk-fill"
                        style={{
                          width: `${history.asset.current_score}%`,
                          background: riskBarColor(history.asset.current_severity),
                        }} />
                    </div>

                    {/* Stats row */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16 }}>
                      {[
                        { label: `Denials (${days}d)`,  value: totalDenials,            color: totalDenials > 0 ? "#DC2626" : "#111827" },
                        { label: "Peak day",            value: peakDay?.deny_count === 0 ? "None" : peakDay?.date ?? "—", color: "#111827" },
                        { label: "Active days",         value: history.history.filter(d => d.deny_count + d.allow_count > 0).length, color: "#111827" },
                      ].map((s) => (
                        <div key={s.label} style={{
                          background: "#F8FAFC", borderRadius: 10,
                          padding: "12px 16px", border: "1px solid #E5E7EB",
                        }}>
                          <p style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{s.label}</p>
                          <p style={{ fontSize: "1.375rem", fontWeight: 700, color: s.color }}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Chart card */}
                  <div className="ent-card">
                    <div className="ent-section-header">
                      <h3 className="ent-section-title">Daily Events — Last {days} Days</h3>
                      <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#6B7280" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 12, height: 8, borderRadius: 2, background: "#22C55E", display: "inline-block" }} />
                          Allowed
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ width: 12, height: 8, borderRadius: 2, background: "#EF4444", display: "inline-block" }} />
                          Denied
                        </span>
                      </div>
                    </div>
                    {history.history.length === 0 ? (
                      <div className="ent-empty">
                        <p className="ent-empty-title" style={{ fontSize: "0.875rem" }}>No events in this window</p>
                      </div>
                    ) : (
                      <BarChart history={history.history} />
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default RiskTimeline;
