import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import Button from "../../components/Button";
import LoadingSpinner from "../../components/LoadingSpinner";
import Alert from "../../components/Alert";
import Badge from "../../components/Badge";
import { assetApi, riskScoreApi } from "../../lib/apiClient";
import { Asset, RiskScore, RuntimeEvent } from "../../lib/types";
import {
  FiArrowLeft, FiEdit2, FiTrash2, FiRefreshCw, FiLock,
  FiShield, FiCheckCircle, FiXCircle, FiUser, FiActivity,
} from "react-icons/fi";

const CLASSIFICATIONS = ["public","internal","confidential","restricted"] as const;
const CLASS_BADGE: Record<string,"success"|"info"|"warning"|"danger"|"default"> = {
  public:"success", internal:"info", confidential:"warning", restricted:"danger",
};
const CLASS_ICON: Record<string,string> = {
  public:"🌐", internal:"🏢", confidential:"🔒", restricted:"🚫",
};
const CLASS_DESC: Record<string,string> = {
  public:       "Data is publicly accessible. Lowest risk baseline.",
  internal:     "Internal use only. Standard security controls apply.",
  confidential: "Sensitive data. Elevated access controls required.",
  restricted:   "Highest sensitivity. Strict access controls and monitoring.",
};
const SEVERITY_STYLE: Record<string,string> = {
  critical: "text-red-700 bg-red-50 border-red-200",
  high:     "text-orange-700 bg-orange-50 border-orange-200",
  medium:   "text-blue-700 bg-blue-50 border-blue-200",
  low:      "text-green-700 bg-green-50 border-green-200",
  minimal:  "text-gray-600 bg-gray-50 border-gray-200",
};
const SEV_BAR: Record<string,string> = {
  critical:"bg-red-500", high:"bg-orange-500", medium:"bg-blue-500", low:"bg-green-500", minimal:"bg-gray-400",
};

function fmt(d: string) {
  return new Date(d).toLocaleString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });
}

// ── Risk Explainability Bar ────────────────────────────────────
function RiskBar({ label, value, max, color }: { label:string; value:number; max:number; color:string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-40 flex-shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width:`${pct}%` }} />
      </div>
      <span className="text-xs font-bold text-gray-700 w-10 text-right">+{value.toFixed(1)}</span>
    </div>
  );
}

const AssetDetail: React.FC = () => {
  const router = useRouter();
  const { id } = router.query as { id: string };

  const [asset, setAsset]         = useState<Asset|null>(null);
  const [riskScore, setRiskScore] = useState<RiskScore|null>(null);
  const [events, setEvents]       = useState<RuntimeEvent[]>([]);
  const [protection, setProtection] = useState<any>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string|null>(null);
  const [editing, setEditing]     = useState(false);
  const [editData, setEditData]   = useState<Partial<Asset>>({});
  const [submitting, setSubmitting]   = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview"|"risk"|"protection"|"events">("overview");
  const [riskForm, setRiskForm]   = useState({
    data_sensitivity: 0, permission_level: 0, trust_score: 50,
    environment: "production", policy_gap: 0,
  });

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.push("/login"); return; }
    if (id) fetchAll();
  }, [id]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [assetRes] = await Promise.all([assetApi.get(id)]);
      setAsset(assetRes.data);
      setEditData(assetRes.data);
      try {
        const riskRes = await assetApi.getRiskScore(id);
        setRiskScore(riskRes.data);
        setRiskForm({
          data_sensitivity: riskRes.data.data_sensitivity,
          permission_level: riskRes.data.permission_level,
          trust_score:      riskRes.data.trust_score,
          environment:      riskRes.data.environment || "production",
          policy_gap:       riskRes.data.policy_gap,
        });
      } catch {}
      try {
        const evRes = await assetApi.getRuntimeEvents(id);
        setEvents(evRes.data);
      } catch {}
      try {
        const pRes = await assetApi.getProtection(id);
        setProtection(pRes.data);
      } catch {}
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load asset");
    } finally { setLoading(false); }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await assetApi.update(id, editData);
      setAsset(res.data);
      setEditing(false);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to update asset");
    } finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this asset? This cannot be undone.")) return;
    try {
      await assetApi.delete(id);
      router.push("/assets");
    } catch { setError("Failed to delete asset"); }
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const res = await riskScoreApi.recalculate(
        id,
        riskForm.data_sensitivity, riskForm.permission_level,
        riskForm.trust_score, riskForm.environment, riskForm.policy_gap,
      );
      setRiskScore(res.data);
    } catch { setError("Failed to recalculate risk score"); }
    finally { setRecalculating(false); }
  };

  if (loading) return <div className="p-10"><LoadingSpinner text="Loading asset…" /></div>;
  if (!asset)  return <div className="p-10"><Alert type="error" message="Asset not found" /></div>;

  const cls = asset.classification || "internal";

  // Risk breakdown calculation
  let breakdown: any = null;
  if (riskScore && protection?.risk_breakdown) {
    const rb = protection.risk_breakdown;
    const total = Object.values(rb).filter(v => typeof v === "number" && v > 0)
      .reduce((s: number, v: any) => s + v, 0);
    breakdown = { ...rb, computed_total: total };
  }

  const TABS = [
    { id:"overview",   label:"Overview" },
    { id:"risk",       label:"Risk & Explainability" },
    { id:"protection", label:"Protection" },
    { id:"events",     label:`Runtime Events (${events.length})` },
  ] as const;

  return (
    <>
      <Head><title>{asset.name} - AI-SecOS</title></Head>
      <main className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/assets" className="inline-flex items-center space-x-2 text-blue-600 hover:text-blue-700 mb-6 text-sm">
            <FiArrowLeft className="w-4 h-4" /><span>Back to Assets</span>
          </Link>

          {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

          {/* Header */}
          <div className="bg-white rounded-xl shadow p-6 mb-5">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <span className="text-3xl mt-0.5">{CLASS_ICON[cls]}</span>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{asset.name}</h1>
                  <p className="text-gray-500 mt-1 text-sm">{asset.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge text={asset.asset_type} type="default" />
                    <Badge text={cls} type={CLASS_BADGE[cls]} />
                    <Badge text={asset.status} type="success" />
                    {riskScore && (
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${SEVERITY_STYLE[riskScore.severity]}`}>
                        Risk: {Number(riskScore.score).toFixed(1)} · {riskScore.severity?.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex space-x-2 flex-shrink-0">
                <Button variant="secondary" size="sm" onClick={() => setEditing(!editing)}
                  className="flex items-center space-x-1">
                  <FiEdit2 className="w-4 h-4" /><span>{editing ? "Cancel" : "Edit"}</span>
                </Button>
                <Button variant="danger" size="sm" onClick={handleDelete}
                  className="flex items-center space-x-1">
                  <FiTrash2 className="w-4 h-4" /><span>Delete</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Edit form */}
          {editing && (
            <div className="bg-white rounded-xl shadow p-6 mb-5">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Edit Asset</h2>
              <form onSubmit={handleUpdate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input type="text" value={editData.name||""} onChange={e=>setEditData({...editData,name:e.target.value})} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                    <select value={editData.status||"active"} onChange={e=>setEditData({...editData,status:e.target.value})} className="input-field">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1"><FiLock className="inline w-3.5 h-3.5 mr-1"/>Classification</label>
                  <div className="grid grid-cols-4 gap-2">
                    {CLASSIFICATIONS.map(c=>(
                      <button key={c} type="button" onClick={()=>setEditData({...editData,classification:c})}
                        className={`rounded-lg border-2 p-2 text-center transition-all ${editData.classification===c ? "border-blue-500 bg-indigo-50" : "border-gray-200 hover:border-gray-300"}`}>
                        <div className="text-xl mb-0.5">{CLASS_ICON[c]}</div>
                        <p className="text-xs font-medium capitalize text-gray-700">{c}</p>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea value={editData.description||""} onChange={e=>setEditData({...editData,description:e.target.value})} className="input-field" rows={2}/>
                </div>
                <Button type="submit" variant="primary" loading={submitting}>Save Changes</Button>
              </form>
            </div>
          )}

          {/* Tab Nav */}
          <div className="flex border-b border-gray-200 bg-white rounded-t-xl shadow px-4 mb-0 -mb-px">
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setActiveTab(t.id as any)}
                className={`px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab===t.id ? "border-b-2 border-blue-500 text-blue-600" : "text-gray-500 hover:text-gray-700"
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="bg-white rounded-b-xl shadow p-6 mb-5">

            {/* ── Overview ── */}
            {activeTab === "overview" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label:"Type",           value: asset.asset_type },
                    { label:"Classification", value: cls },
                    { label:"Status",         value: asset.status },
                    { label:"Risk Score",     value: riskScore ? `${Number(riskScore.score).toFixed(1)} (${riskScore.severity})` : "—" },
                  ].map(s=>(
                    <div key={s.label} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-400 mb-0.5">{s.label}</p>
                      <p className="text-sm font-semibold text-gray-800 capitalize">{s.value}</p>
                    </div>
                  ))}
                </div>
                {riskScore?.recommendation && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    <strong>Recommendation:</strong> {riskScore.recommendation}
                  </div>
                )}
                {asset.metadata && Object.keys(asset.metadata).length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-2">Metadata</p>
                    <pre className="bg-gray-900 text-green-400 text-xs rounded-lg p-4 overflow-auto">
                      {JSON.stringify(asset.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* ── Risk & Explainability ── */}
            {activeTab === "risk" && (
              <div className="space-y-5">
                {riskScore ? (
                  <>
                    {/* Score display */}
                    <div className={`border rounded-xl p-5 ${SEVERITY_STYLE[riskScore.severity]}`}>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">Risk Score</p>
                          <p className="text-5xl font-black">{Number(riskScore.score).toFixed(1)}</p>
                          <p className="text-sm font-bold uppercase mt-1">{riskScore.severity}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleRecalculate} loading={recalculating}
                          className="flex items-center gap-1">
                          <FiRefreshCw className="w-3.5 h-3.5"/>Recalculate
                        </Button>
                      </div>
                    </div>

                    {/* Explainability breakdown */}
                    <div>
                      <p className="text-sm font-bold text-gray-700 mb-3">
                        Risk Score Breakdown
                        <span className="text-xs font-normal text-gray-400 ml-2">
                          (how each factor contributes to the final score)
                        </span>
                      </p>
                      <div className="space-y-3 bg-gray-50 rounded-xl p-4">
                        {protection?.risk_breakdown ? (
                          <>
                            <RiskBar label="Data Sensitivity (×0.28)"
                              value={protection.risk_breakdown.data_sensitivity_contribution}
                              max={28} color={SEV_BAR[riskScore.severity]} />
                            <RiskBar label="Permission Level (×0.22)"
                              value={protection.risk_breakdown.permission_level_contribution}
                              max={22} color={SEV_BAR[riskScore.severity]} />
                            <RiskBar label="Trust Score (×0.18)"
                              value={protection.risk_breakdown.trust_score_contribution}
                              max={18} color={SEV_BAR[riskScore.severity]} />
                            <RiskBar label="Policy Gap (×0.18)"
                              value={protection.risk_breakdown.policy_gap_contribution}
                              max={18} color="bg-orange-500" />
                            <div className="border-t border-gray-200 pt-2 mt-2">
                              <div className="flex items-center justify-between text-sm font-bold">
                                <span className="text-gray-700">
                                  × {protection.risk_breakdown.environment_multiplier} ({riskScore.environment})
                                </span>
                                <span className={SEVERITY_STYLE[riskScore.severity].split(" ")[0]}>
                                  = {Number(riskScore.score).toFixed(1)}
                                </span>
                              </div>
                            </div>
                          </>
                        ) : (
                          // Fallback calculation
                          [
                            { label:"Data Sensitivity (×0.28)", val: riskScore.data_sensitivity * 0.28, max:28 },
                            { label:"Permission Level (×0.22)", val: riskScore.permission_level * 0.22, max:22 },
                            { label:"Trust Score inverted (×0.18)", val: (100-riskScore.trust_score)*0.18, max:18 },
                            { label:"Policy Gap (×0.18)", val: riskScore.policy_gap * 0.18, max:18 },
                          ].map(r => (
                            <RiskBar key={r.label} label={r.label}
                              value={r.val} max={r.max} color={SEV_BAR[riskScore.severity]} />
                          ))
                        )}
                      </div>
                    </div>

                    {/* Adjust parameters */}
                    <div className="border border-gray-200 rounded-xl p-4">
                      <p className="text-sm font-medium text-gray-700 mb-3">Adjust Parameters</p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {[
                          ["data_sensitivity","Data Sensitivity"],
                          ["permission_level","Permission Level"],
                          ["trust_score","Trust Score"],
                          ["policy_gap","Policy Gap"],
                        ].map(([k,l])=>(
                          <div key={k}>
                            <label className="block text-xs text-gray-500 mb-1">{l} (0–100)</label>
                            <input type="number" min={0} max={100}
                              value={(riskForm as any)[k]}
                              onChange={e=>setRiskForm({...riskForm,[k]:parseInt(e.target.value)||0})}
                              className="input-field text-sm"/>
                          </div>
                        ))}
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Environment</label>
                          <select value={riskForm.environment}
                            onChange={e=>setRiskForm({...riskForm,environment:e.target.value})}
                            className="input-field text-sm">
                            {["production","staging","development","testing"].map(e=>(
                              <option key={e} value={e}>{e}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={handleRecalculate}
                        loading={recalculating} className="mt-3 flex items-center gap-1">
                        <FiRefreshCw className="w-3.5 h-3.5"/>Recalculate Score
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-gray-400 text-sm">No risk score available.</p>
                )}
              </div>
            )}

            {/* ── Protection View ── */}
            {activeTab === "protection" && (
              <div className="space-y-5">
                {/* Protecting policies */}
                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <FiShield className="w-4 h-4 text-blue-500"/>
                    Protected By ({protection?.protecting_policies?.length ?? 0} policies)
                  </h3>
                  {(protection?.protecting_policies || []).length === 0 ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
                      ⚠ No active policies protect this asset.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {(protection?.protecting_policies || []).map((p: any) => (
                        <div key={p.id} className={`border rounded-xl p-4 ${
                          p.effect==="deny" ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FiShield className={`w-4 h-4 ${p.effect==="deny" ? "text-red-500" : "text-green-600"}`}/>
                              <span className="font-semibold text-gray-900 text-sm">{p.name}</span>
                              <span className={`text-xs font-bold uppercase ${p.effect==="deny" ? "text-red-600" : "text-green-700"}`}>
                                {p.effect}
                              </span>
                            </div>
                            <span className="text-xs text-gray-400">Priority {p.priority}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            Actions: {(p.actions||["*"]).join(", ")} · {p.policy_type}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent access */}
                <div>
                  <h3 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                    <FiActivity className="w-4 h-4 text-blue-500"/>
                    Recent Access (last 20)
                  </h3>
                  {(protection?.recent_access || []).length === 0 ? (
                    <p className="text-gray-400 text-sm">No access events recorded.</p>
                  ) : (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            {["Time","Agent","User","Action","Decision","Prompt"].map(h=>(
                              <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {(protection?.recent_access||[]).map((e: any)=>(
                            <tr key={e.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2.5 text-gray-400 font-mono whitespace-nowrap">{fmt(e.ts)}</td>
                              <td className="px-3 py-2.5 text-gray-800 font-medium">{e.agent}</td>
                              <td className="px-3 py-2.5 text-blue-600">
                                {e.end_user
                                  ? <span className="flex items-center gap-1"><FiUser className="w-3 h-3"/>{e.end_user}</span>
                                  : <span className="text-gray-400">—</span>}
                              </td>
                              <td className="px-3 py-2.5 text-gray-600 capitalize">{e.action}</td>
                              <td className="px-3 py-2.5">
                                {e.decision==="allow"
                                  ? <span className="flex items-center gap-1 text-green-600 font-bold"><FiCheckCircle className="w-3 h-3"/>ALLOW</span>
                                  : <span className="flex items-center gap-1 text-red-600 font-bold"><FiXCircle className="w-3 h-3"/>DENY</span>}
                              </td>
                              <td className="px-3 py-2.5 text-gray-400 max-w-[140px] truncate italic">
                                {e.prompt ? `"${e.prompt}"` : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Runtime Events ── */}
            {activeTab === "events" && (
              <div>
                {events.length === 0 ? (
                  <p className="text-gray-400 text-sm">No events recorded yet.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {events.map(ev=>(
                      <div key={ev.id} className="py-3 flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <span className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${ev.status==="allow" ? "bg-green-500" : "bg-red-500"}`}/>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-800 font-medium capitalize">{ev.action}</span>
                              <span className={`text-xs font-bold ${ev.status==="allow" ? "text-green-600" : "text-red-600"}`}>
                                {ev.status?.toUpperCase()}
                              </span>
                            </div>
                            {ev.prompt_preview && (
                              <p className="text-xs text-gray-400 font-mono italic mt-0.5">"{ev.prompt_preview}"</p>
                            )}
                            {ev.session_id && <p className="text-xs text-gray-400">Session: {ev.session_id}</p>}
                          </div>
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap ml-4">{fmt(ev.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </main>
    </>
  );
};

export default AssetDetail;
