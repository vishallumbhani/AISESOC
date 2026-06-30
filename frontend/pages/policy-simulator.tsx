import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Button from "../components/Button";
import LoadingSpinner from "../components/LoadingSpinner";
import { policyApi, agentApi, assetApi } from "../lib/apiClient";
import { Agent, Asset, SimulateResponse, SimulateTraceEntry } from "../lib/types";
import { getOrgToken } from "../lib/tokens";
import { FiZap, FiCheckCircle, FiXCircle, FiChevronDown, FiChevronUp, FiInfo, FiAlertTriangle } from "react-icons/fi";

function TraceRow({ entry, index }: { entry: SimulateTraceEntry; index: number }) {
  const matchedDeny  = entry.matched && entry.effect === "deny";
  const matchedAllow = entry.matched && entry.effect === "allow";
  return (
    <div className={`flex items-start gap-3 py-2.5 border-b border-slate-200 last:border-0 text-sm ${
      matchedDeny ? "bg-red-900/20" : matchedAllow ? "bg-green-900/20" : ""
    }`}>
      <span className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-400 flex-shrink-0 mt-0.5">
        {index + 1}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-700 truncate">{entry.policy}</span>
          {entry.matched && entry.effect && (
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              matchedDeny ? "bg-red-900/60 text-red-600" : "bg-green-900/60 text-green-600"
            }`}>{entry.effect.toUpperCase()}</span>
          )}
          {!entry.matched && <span className="text-xs text-slate-500">no match</span>}
        </div>
        {entry.rule && entry.matched && (
          <p className="text-xs text-slate-400 font-mono mt-0.5 truncate">{entry.rule}</p>
        )}
      </div>
      <div className="flex-shrink-0">
        {entry.matched
          ? matchedDeny
            ? <FiXCircle className="w-4 h-4 text-red-600" />
            : <FiCheckCircle className="w-4 h-4 text-green-600" />
          : <span className="w-4 h-4 block rounded-full border border-slate-200" />}
      </div>
    </div>
  );
}

const PolicySimulator: React.FC = () => {
  const router = useRouter();
  const [agents, setAgents]     = useState<Agent[]>([]);
  const [assets, setAssets]     = useState<Asset[]>([]);
  const [loading, setLoading]   = useState(true);
  const [testing, setTesting]   = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [result, setResult]     = useState<SimulateResponse | null>(null);
  const [showTrace, setShowTrace] = useState(true);

  const [agentId, setAgentId]         = useState("");
  const [assetId, setAssetId]         = useState("");
  const [action, setAction]           = useState("access");
  const [useCustomRules, setUseCustomRules] = useState(false);
  const [customRules, setCustomRules] = useState(
    JSON.stringify({ allow: [], deny: [{ agent_id: "*", asset_id: "*", actions: ["admin"] }] }, null, 2)
  );

  useEffect(() => {
    if (!getOrgToken()) { router.push("/login"); return; }
    Promise.all([agentApi.list(), assetApi.list()])
      .then(([a, as]) => {
        setAgents(a.data); setAssets(as.data);
        if (a.data.length)  setAgentId(a.data[0].id);
        if (as.data.length) setAssetId(as.data[0].id);
      })
      .catch(() => setError("Failed to load agents / assets"))
      .finally(() => setLoading(false));
  }, []);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentId || !assetId) return;
    setTesting(true); setError(null); setResult(null);
    try {
      let testRules: Record<string, any> | undefined;
      if (useCustomRules) {
        try { testRules = JSON.parse(customRules); }
        catch { setError("Invalid JSON in custom rules."); setTesting(false); return; }
      }
      const res = await policyApi.simulate({ agent_id: agentId, asset_id: assetId, action, test_rules: testRules });
      setResult(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Simulation failed");
    } finally { setTesting(false); }
  };

  const isAllow = result?.decision === "allow";

  return (
    <>
      <Head><title>Policy Simulator — AI-SecOS</title></Head>
      <main className="min-h-screen py-8">
        <div className="max-w-4xl mx-auto px-4">
          <div className="mb-8 flex items-center gap-3">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <FiZap className="w-5 h-5 text-slate-900" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Policy Simulator</h1>
              <p className="text-slate-400 text-sm mt-0.5">Dry-run decisions before they affect real traffic. No events are written.</p>
            </div>
          </div>

          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm mb-5 flex items-center gap-2">
              <FiAlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
              <button onClick={() => setError(null)} className="ml-auto opacity-60 hover:opacity-100">✕</button>
            </div>
          )}

          {loading ? <div className="flex justify-center py-20"><LoadingSpinner /></div> : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Input form */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <h2 className="font-semibold text-slate-900 text-sm uppercase tracking-wide">Simulation Parameters</h2>
                <form onSubmit={handleSimulate} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Agent</label>
                    <select value={agentId} onChange={e => setAgentId(e.target.value)}
                      className="w-full bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-2 text-sm" required>
                      <option value="">— Choose agent —</option>
                      {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Asset</label>
                    <select value={assetId} onChange={e => setAssetId(e.target.value)}
                      className="w-full bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-2 text-sm" required>
                      <option value="">— Choose asset —</option>
                      {assets.map(a => <option key={a.id} value={a.id}>{a.name} [{a.classification}]</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1.5">Action</label>
                    <select value={action} onChange={e => setAction(e.target.value)}
                      className="w-full bg-white border border-slate-200 text-slate-700 rounded-lg px-3 py-2 text-sm">
                      {["access","read","write","delete","admin"].map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="customRules" checked={useCustomRules}
                      onChange={e => setUseCustomRules(e.target.checked)}
                      className="rounded border-slate-300 bg-slate-100 text-indigo-600" />
                    <label htmlFor="customRules" className="text-sm text-slate-500 cursor-pointer">
                      Test custom rules (bypass stored policies)
                    </label>
                  </div>
                  {useCustomRules && (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-1.5">Custom Rules JSON</label>
                      <textarea value={customRules} onChange={e => setCustomRules(e.target.value)}
                        className="w-full bg-white border border-slate-200 text-slate-700 font-mono text-xs rounded-lg px-3 py-2"
                        rows={6} />
                    </div>
                  )}
                  <button type="submit" disabled={!agentId || !assetId || testing}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-slate-900 font-semibold rounded-lg text-sm transition flex items-center justify-center gap-2">
                    {testing ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Running…</> : <><FiZap className="w-4 h-4" /> Run Simulation</>}
                  </button>
                </form>
                <div className="border-t border-slate-200 pt-4 flex items-start gap-2 text-xs text-slate-500">
                  <FiInfo className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  Evaluates all active policies in priority order. No data is written.
                </div>
              </div>

              {/* Result panel */}
              <div className="space-y-4">
                {result ? (
                  <>
                    {/* Decision banner */}
                    <div className={`rounded-xl border-2 p-5 ${
                      isAllow ? "border-green-800 bg-green-900/20" : "border-red-800 bg-red-900/20"
                    }`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Simulated Decision</p>
                          <p className={`text-4xl font-black ${isAllow ? "text-green-600" : "text-red-600"}`}>
                            {result.decision.toUpperCase()}
                          </p>
                        </div>
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center ${
                          isAllow ? "bg-green-900/60" : "bg-red-900/60"
                        }`}>
                          {isAllow
                            ? <FiCheckCircle className="w-7 h-7 text-green-600" />
                            : <FiXCircle className="w-7 h-7 text-red-600" />}
                        </div>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                      {result.matched_policy && (
                        <div>
                          <p className="text-xs text-slate-400 font-medium mb-0.5">Matched Policy</p>
                          <p className="text-slate-900 font-semibold">{result.matched_policy}</p>
                        </div>
                      )}
                      {result.matched_rule && (
                        <div>
                          <p className="text-xs text-slate-400 font-medium mb-0.5">Matched Rule</p>
                          <p className="text-slate-600 font-mono text-sm bg-slate-100 rounded px-2 py-1">{result.matched_rule}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-slate-400 font-medium mb-0.5">Explanation</p>
                        <p className="text-slate-600 text-sm leading-relaxed">{result.explanation}</p>
                      </div>
                      {result.risk_score != null && (
                        <div>
                          <p className="text-xs text-slate-400 font-medium mb-0.5">Asset Risk Score</p>
                          <p className="text-slate-600 font-semibold">{result.risk_score}</p>
                        </div>
                      )}
                    </div>

                    {/* Trace */}
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                      <button onClick={() => setShowTrace(!showTrace)}
                        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">
                        <span>Policy Evaluation Trace ({result.trace?.length ?? 0} evaluated)</span>
                        {showTrace ? <FiChevronUp className="w-4 h-4" /> : <FiChevronDown className="w-4 h-4" />}
                      </button>
                      {showTrace && (
                        <div className="px-4 pb-3">
                          {!result.trace?.length
                            ? <p className="text-slate-500 text-sm py-2">No policies evaluated.</p>
                            : result.trace.map((t, i) => <TraceRow key={i} entry={t} index={i} />)
                          }
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-500">
                    <FiZap className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="font-medium text-slate-400">Configure and run a simulation</p>
                    <p className="text-sm mt-1">Results and trace will appear here</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
};

export default PolicySimulator;
