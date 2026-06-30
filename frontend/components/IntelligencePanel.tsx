/**
 * IntelligencePanel.tsx
 *
 * Task 5 — Graph Intelligence widget.
 * Import and render at the bottom of graph.tsx:
 *
 *   import { IntelligencePanel } from "../components/IntelligencePanel";
 *   // inside the JSX:
 *   <IntelligencePanel />
 */

import React, { useState, useEffect } from "react";
import { graphApi } from "../lib/apiClient";
import { GraphIntelligence } from "../lib/types";
import {
  FiAlertTriangle, FiUser, FiDatabase,
  FiActivity, FiZap, FiRefreshCw,
} from "react-icons/fi";

function StatCard({
  icon: Icon, label, value, sub, color = "text-gray-900",
}: {
  icon: React.ElementType; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-4">
      <div className="flex items-center space-x-2 mb-2">
        <Icon className="w-4 h-4 text-gray-400" />
        <p className="text-xs font-medium text-gray-500">{label}</p>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export const IntelligencePanel: React.FC = () => {
  const [data, setData]       = useState<GraphIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    graphApi.getIntelligence()
      .then((r) => setData(r.data))
      .catch(() => setError("Failed to load intelligence data"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow p-6 mt-6">
        <p className="text-sm text-gray-400 animate-pulse">Loading intelligence…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-xl shadow p-6 mt-6">
        <p className="text-sm text-red-400">{error || "No data"}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow p-6 mt-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-bold text-gray-900 flex items-center space-x-2">
            <FiZap className="w-4 h-4 text-indigo-500" />
            <span>Security Intelligence</span>
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">Derived from runtime event patterns</p>
        </div>
        <button onClick={load}
          className="text-gray-400 hover:text-gray-600 p-1 rounded-md hover:bg-gray-50">
          <FiRefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
        <StatCard
          icon={FiActivity}
          label="Allow Rate (24h)"
          value={`${data.recent_allow_rate}%`}
          sub={`${data.total_decisions_7d} decisions (7d)`}
          color={data.recent_allow_rate > 80 ? "text-green-600" : "text-red-600"}
        />
        <StatCard
          icon={FiDatabase}
          label="Most Attacked Asset"
          value={data.most_attacked_asset?.name || "—"}
          sub={data.most_attacked_asset
            ? `${data.most_attacked_asset.deny_count} denials (7d) · ${data.most_attacked_asset.classification}`
            : "No data"}
          color="text-red-600"
        />
        <StatCard
          icon={FiAlertTriangle}
          label="Most Risky Agent"
          value={data.most_risky_agent?.name || "—"}
          sub={data.most_risky_agent
            ? `${data.most_risky_agent.deny_count} denials (7d)`
            : "No data"}
          color="text-orange-600"
        />
        <StatCard
          icon={FiUser}
          label="Top Denied User"
          value={data.top_denied_user?.email || data.top_denied_user?.external_user_id || "—"}
          sub={data.top_denied_user ? `${data.top_denied_user.deny_count} denials (7d)` : "No end-user data"}
          color="text-purple-600"
        />
      </div>

      {/* Denial spike banner */}
      {data.denial_spike_assets.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center space-x-2 mb-2">
            <FiAlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
            <p className="text-sm font-semibold text-red-800">Active Denial Spikes (last hour)</p>
          </div>
          <div className="space-y-1">
            {data.denial_spike_assets.map((a) => (
              <div key={a.asset_id}
                className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-2">
                <span className="text-gray-800 font-medium">{a.name}</span>
                <span className="text-red-600 font-bold">{a.deny_count_last_hour} denials</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default IntelligencePanel;
