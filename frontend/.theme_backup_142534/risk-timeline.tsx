import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import LoadingSpinner from "../components/LoadingSpinner";
import { getOrgToken } from "../lib/tokens";
import { assetApi } from "../lib/apiClient";
import { Asset } from "../lib/types";
import { FiTrendingUp, FiArrowLeft, FiAlertTriangle } from "react-icons/fi";

const CLASS_BADGE: Record<string, string> = {
  public:       "bg-green-900/40 text-green-400 border border-green-800",
  internal:     "bg-blue-900/40 text-blue-400 border border-blue-800",
  confidential: "bg-yellow-900/40 text-yellow-400 border border-yellow-800",
  restricted:   "bg-red-900/40 text-red-400 border border-red-800",
};

const SEV_COLOR: Record<string, string> = {
  critical: "text-red-400",
  high:     "text-orange-400",
  medium:   "text-yellow-400",
  low:      "text-green-400",
  minimal:  "text-gray-400",
};

interface DayBucket { date: string; deny_count: number; allow_count: number; }
interface RiskHistory {
  asset: { id: string; name: string; classification: string; current_score: number; current_severity: string; };
  history: DayBucket[];
}

function BarChart({ history }: { history: DayBucket[] }) {
  const maxDeny = Math.max(...history.map(h => h.deny_count), 1);
  const W = 700; const H = 140; const PAD = 30;
  const barW = Math.max(4, (W - PAD * 2) / history.length - 2);
  return (
    <svg viewBox={`0 0 ${W} ${H + 30}`} className="w-full">
      {[0, Math.round(maxDeny / 2), maxDeny].map((v, i) => (
        <text key={i} x={PAD - 4} y={H - (v / maxDeny) * H + PAD / 2}
          textAnchor="end" fontSize="10" fill="#4b5563">{v}</text>
      ))}
      {history.map((d, i) => {
        const x = PAD + i * ((W - PAD * 2) / history.length);
        const barH = (d.deny_count / maxDeny) * H;
        const maxAllow = Math.max(...history.map(h => h.allow_count), 1);
        const allowH = (d.allow_count / maxAllow) * (H * 0.3);
        return (
          <g key={i}>
            <rect x={x} y={H - allowH + PAD / 2} width={barW} height={allowH} fill="#065f46" rx="2" />
            <rect x={x} y={H - barH + PAD / 2} width={barW} height={barH}
              fill={d.deny_count > 3 ? "#ef4444" : "#f97316"} rx="2" opacity="0.85">
              <title>{d.date}: {d.deny_count} denials, {d.allow_count} allows</title>
            </rect>
          </g>
        );
      })}
      {history.filter((_, i) => i % 5 === 0).map((d) => {
        const origIdx = history.indexOf(d);
        const x = PAD + origIdx * ((W - PAD * 2) / history.length);
        return (
          <text key={origIdx} x={x + barW / 2} y={H + PAD / 2 + 18}
            textAnchor="middle" fontSize="9" fill="#4b5563">{d.date.slice(5)}</text>
        );
      })}
    </svg>
  );
}

const RiskTimeline: React.FC = () => {
  const router = useRouter();
  const [assets, setAssets]     = useState<Asset[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [days, setDays]         = useState(30);
  const [history, setHistory]   = useState<RiskHistory | null>(null);
  const [loading, setLoading]   = useState(true);
  const [histLoading, setHistLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!getOrgToken()) { router.push("/login"); return; }
    assetApi.list()
      .then(r => { setAssets(r.data); if (r.data.length) setSelected(r.data[0].id); })
      .catch(() => setError("Failed to load assets"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setHistLoading(true); setHistory(null);
    assetApi.getRiskHistory(selected, days)
      .then(r => setHistory(r.data))
      .catch(() => setError("Failed to load risk history"))
      .finally(() => setHistLoading(false));
  }, [selected, days]);

  const totalDenials = history?.history.reduce((s, d) => s + d.deny_count, 0) ?? 0;
  const peakDay = history?.history.reduce(
    (peak, d) => d.deny_count > peak.deny_count ? d : peak,
    { date: "—", deny_count: 0, allow_count: 0 }
  );

  return (
    <>
      <Head><title>Risk Timeline — AI-SecOS</title></Head>
      <main className="min-h-screen bg-gray-950 py-8">
        <div className="max-w-5xl mx-auto px-4">
          <div className="mb-6 flex items-center gap-3">
            <Link href="/dashboard" className="text-gray-600 hover:text-gray-400">
              <FiArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <FiTrendingUp className="w-6 h-6 text-indigo-400" /> Risk Timeline
              </h1>
              <p className="text-gray-500 text-sm mt-0.5">Track denial events and risk score evolution per asset.</p>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm mb-4 flex items-center gap-2">
              <FiAlertTriangle className="w-4 h-4" /> {error}
              <button onClick={() => setError(null)} className="ml-auto text-red-500">✕</button>
            </div>
          )}

          {loading ? <div className="flex justify-center py-20"><LoadingSpinner /></div> : (
            <>
              {/* Controls */}
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-5 flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Asset</label>
                  <select value={selected} onChange={e => setSelected(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 text-sm">
                    {assets.map(a => <option key={a.id} value={a.id}>{a.name} [{a.classification}]</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Window</label>
                  <div className="flex gap-1">
                    {[7, 14, 30, 60].map(d => (
                      <button key={d} onClick={() => setDays(d)}
                        className={`px-3 py-2 text-xs rounded-lg font-medium transition-colors ${
                          days === d ? "bg-indigo-600 text-white" : "bg-gray-800 border border-gray-700 text-gray-400 hover:text-white"
                        }`}>{d}d</button>
                    ))}
                  </div>
                </div>
              </div>

              {histLoading ? (
                <div className="flex justify-center py-16"><LoadingSpinner /></div>
              ) : history ? (
                <>
                  {/* Asset header */}
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-xl font-bold text-white">{history.asset.name}</h2>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium mt-1 inline-block ${
                          CLASS_BADGE[history.asset.classification] || "bg-gray-800 text-gray-400"
                        }`}>{history.asset.classification}</span>
                      </div>
                      <div className="text-right">
                        <p className="text-3xl font-black text-white">{history.asset.current_score.toFixed(1)}</p>
                        <p className={`text-sm font-semibold capitalize ${SEV_COLOR[history.asset.current_severity] || "text-gray-400"}`}>
                          {history.asset.current_severity}
                        </p>
                        <p className="text-xs text-gray-600">Current risk score</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-800">
                      <div>
                        <p className="text-xs text-gray-500">Denials ({days}d)</p>
                        <p className="text-xl font-bold text-red-400">{totalDenials}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Peak day</p>
                        <p className="text-sm font-semibold text-gray-300">{peakDay?.date === "—" ? "—" : peakDay?.date}</p>
                        {peakDay && peakDay.deny_count > 0 && (
                          <p className="text-xs text-red-400">{peakDay.deny_count} denials</p>
                        )}
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Active days</p>
                        <p className="text-xl font-bold text-gray-300">
                          {history.history.filter(d => d.deny_count + d.allow_count > 0).length}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Chart */}
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-gray-300">Daily Denial Events — last {days} days</h3>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-sm bg-red-500 inline-block" /> Denials
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="w-3 h-3 rounded-sm bg-emerald-900 inline-block" /> Allows
                        </span>
                      </div>
                    </div>
                    {history.history.length === 0 ? (
                      <div className="text-center text-gray-600 py-8">No events in this window</div>
                    ) : <BarChart history={history.history} />}
                  </div>
                </>
              ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center text-gray-600">
                  Select an asset to view its risk history.
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
};

export default RiskTimeline;
