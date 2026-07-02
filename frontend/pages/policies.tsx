import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Button from "../components/Button";
import LoadingSpinner from "../components/LoadingSpinner";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import { policyApi, agentApi, assetApi } from "../lib/apiClient";
import { Policy, Agent, Asset, PolicyVersionSnapshot } from "../lib/types";
import {
  FiPlus, FiSearch, FiX, FiGitCommit, FiArrowRight,
  FiClock, FiActivity, FiShield, FiAlertTriangle,
  FiCheckCircle, FiXCircle, FiUser, FiDatabase,
  FiChevronRight, FiCode, FiLayout, FiZap, FiInfo,
} from "react-icons/fi";

// ── Constants ──────────────────────────────────────────────────
const ACTIONS = ["access", "read", "write", "delete", "admin"];
const TEMPLATES = [
  { id:"deny_all",     name:"Deny All Access",      icon:"🚫", desc:"Block an agent from all access.",        effect:"deny",  actions:["access","read","write","delete","admin"] },
  { id:"allow_read",  name:"Read Only Access",      icon:"👁",  desc:"Allow read but block modifications.",    effect:"allow", actions:["access","read"] },
  { id:"finance",     name:"Finance Protection",    icon:"💰", desc:"Deny all agents to a financial asset.",  effect:"deny",  actions:["access","read","write","delete","admin"], agent_wildcard:true },
  { id:"pii",         name:"PII Protection",        icon:"🔒", desc:"Block write/delete on sensitive data.",  effect:"deny",  actions:["write","delete","admin"], agent_wildcard:true },
  { id:"prod_ctrl",   name:"Production Control",    icon:"🏭", desc:"Read-only access to production assets.", effect:"deny",  actions:["write","delete","admin"] },
];

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
const fmtTs = (d: string) =>
  new Date(d).toLocaleString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" });

// ── Rule row (human-readable) ──────────────────────────────────
function RuleReadable({ effect, agentName, assetName, actions }: {
  effect:"deny"|"allow"; agentName:string; assetName:string; actions:string[];
}) {
  return (
    <div className={`flex items-center gap-2 flex-wrap text-sm font-medium rounded-lg px-3 py-2 ${
      effect === "deny" ? "bg-red-900/20 border border-red-800" : "bg-green-900/20 border border-green-800"
    }`}>
      <span className={`font-black uppercase text-xs px-2 py-0.5 rounded ${
        effect==="deny" ? "bg-red-900/60 text-red-700" : "bg-green-900/60 text-green-700"
      }`}>{effect}</span>
      <span className="text-purple-300">🤖 {agentName || "?"}</span>
      <span className="text-slate-500">FROM ACCESSING</span>
      <span className="text-blue-300">🗄 {assetName || "?"}</span>
      <span className="text-slate-500">FOR</span>
      <span className="text-yellow-300">{actions.join(", ") || "none"}</span>
    </div>
  );
}

// ── Validation badge ───────────────────────────────────────────
function ValidationPanel({ result, loading }: { result: any; loading: boolean }) {
  if (loading) return (
    <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      Validating…
    </div>
  );
  if (!result) return null;

  const hasErrors   = result.errors.length > 0;
  const hasWarnings = result.warnings.length > 0;
  const hasDupes    = result.duplicates.length > 0;
  const hasConflicts = result.conflicts.length > 0;

  return (
    <div className="space-y-3">
      {/* Errors */}
      {result.errors.map((e: string, i: number) => (
        <div key={i} className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
          <FiXCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />{e}
        </div>
      ))}

      {/* Warnings */}
      {result.warnings.map((w: string, i: number) => (
        <div key={i} className="flex items-start gap-2 bg-yellow-900/20 border border-amber-200 rounded-lg px-3 py-2 text-sm text-yellow-300">
          <FiAlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />{w}
        </div>
      ))}

      {/* Duplicates */}
      {result.duplicates.map((d: any, i: number) => (
        <div key={i} className="bg-orange-900/20 border border-orange-200 rounded-lg px-3 py-2 text-sm">
          <div className="flex items-center gap-2 text-orange-700 font-semibold mb-1">
            <FiAlertTriangle className="w-4 h-4" /> Duplicate Rule Detected
          </div>
          <p className="text-slate-600 text-xs">
            Existing policy "<span className="text-slate-900 font-medium">{d.existing_policy}</span>" already has a{" "}
            <span className={d.effect==="deny" ? "text-red-600" : "text-green-600"}>{d.effect}</span> rule for the same agent + asset + actions.
          </p>
        </div>
      ))}

      {/* Conflicts */}
      {result.conflicts.map((c: any, i: number) => (
        <div key={i} className="bg-red-900/20 border border-red-200 rounded-lg px-3 py-2 text-sm">
          <div className="flex items-center gap-2 text-red-700 font-semibold mb-1">
            <FiAlertTriangle className="w-4 h-4" /> Conflict Detected
          </div>
          <p className="text-slate-600 text-xs">
            Policy "<span className="text-slate-900 font-medium">{c.existing_policy}</span>" has a{" "}
            <span className={c.existing_effect==="deny" ? "text-red-600" : "text-green-600"}>{c.existing_effect}</span> rule,
            but this policy has{" "}
            <span className={c.new_effect==="deny" ? "text-red-600" : "text-green-600"}>{c.new_effect}</span>.
          </p>
          <p className="text-yellow-300 text-xs mt-1 font-semibold">⚡ {c.result}</p>
        </div>
      ))}

      {/* Impact */}
      {result.impact && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500 uppercase font-semibold mb-3">Impact Analysis</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { label:"Affected Agents",    value:result.impact.affected_agents,    color:"text-purple-600" },
              { label:"Affected Assets",    value:result.impact.affected_assets,    color:"text-blue-600" },
              { label:"Historical Matches", value:result.impact.historical_matches, color:"text-orange-600" },
              { label:"Potential Denials",  value:result.impact.potential_denials,  color:"text-red-600" },
              { label:"Related Incidents",  value:result.impact.related_incidents,  color:"text-amber-600" },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-slate-400">{s.label}</p>
              </div>
            ))}
          </div>
          {result.impact.agent_names.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {result.impact.agent_names.map((n: string) => (
                <span key={n} className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">🤖 {n}</span>
              ))}
              {result.impact.asset_names.map((n: string) => (
                <span key={n} className="text-xs bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full">🗄 {n}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {!hasErrors && !hasWarnings && !hasDupes && !hasConflicts && (
        <div className="flex items-center gap-2 bg-green-900/20 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
          <FiCheckCircle className="w-4 h-4" /> No issues detected. Policy is safe to save.
        </div>
      )}
    </div>
  );
}

// ── Policy Builder Modal ───────────────────────────────────────
function PolicyBuilderModal({ policy, agents, assets, onClose, onSave }: {
  policy: Policy | null;
  agents: Agent[];
  assets: Asset[];
  onClose: () => void;
  onSave: () => void;
}) {
  const isNew = !policy;
  const [mode, setMode] = useState<"builder"|"advanced">("builder");
  const [step, setStep] = useState<"template"|"form"|"validate">(isNew ? "template" : "form");

  // Form state
  const [name, setName]         = useState(policy?.name ?? "");
  const [description, setDescription] = useState(policy?.description ?? "");
  const [policyType, setPolicyType]   = useState(policy?.policy_type ?? "access_control");
  const [status, setStatus]     = useState(policy?.status ?? "active");
  const [priority, setPriority] = useState(policy?.priority ?? 100);

  // Builder rules
  type BuilderRule = { effect:"deny"|"allow"; agentId:string; assetId:string; actions:string[] };
  const [rules, setRules] = useState<BuilderRule[]>(() => {
    if (!policy) return [{ effect:"deny", agentId:"", assetId:"", actions:["access","read","write"] }];
    const r = policy.rules || {};
    const out: BuilderRule[] = [];
    (r.deny||[]).forEach((rule:any) => out.push({ effect:"deny", agentId:rule.agent_id||"", assetId:rule.asset_id||"", actions:rule.actions||[] }));
    (r.allow||[]).forEach((rule:any) => out.push({ effect:"allow", agentId:rule.agent_id||"", assetId:rule.asset_id||"", actions:rule.actions||[] }));
    return out.length ? out : [{ effect:"deny", agentId:"", assetId:"", actions:[] }];
  });

  // Advanced JSON
  const [jsonRules, setJsonRules] = useState(
    policy ? JSON.stringify(policy.rules, null, 2) : JSON.stringify({deny:[{agent_id:"",asset_id:"",actions:["access","read","write"]}],allow:[]}, null, 2)
  );
  const [jsonError, setJsonError] = useState<string|null>(null);

  // Validation
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string|null>(null);

  const buildRulesObject = () => {
    if (mode === "advanced") {
      try { return JSON.parse(jsonRules); } catch { return null; }
    }
    const deny  = rules.filter(r=>r.effect==="deny").map(r=>({ agent_id:r.agentId, asset_id:r.assetId, actions:r.actions }));
    const allow = rules.filter(r=>r.effect==="allow").map(r=>({ agent_id:r.agentId, asset_id:r.assetId, actions:r.actions }));
    return { deny, allow };
  };

  const agentName = (id:string) => agents.find(a=>a.id===id)?.name || (id==="*" ? "All Agents" : id.slice(0,8)+"…");
  const assetName = (id:string) => assets.find(a=>a.id===id)?.name || (id==="*" ? "All Assets" : id.slice(0,8)+"…");

  const runValidation = useCallback(async () => {
    const rulesObj = buildRulesObject();
    if (!rulesObj) { setJsonError("Invalid JSON"); return; }
    setValidating(true);
    try {
      const r = await (policyApi as any).validate({
        name, rules: rulesObj, priority,
        edit_id: policy?.id,
      });
      setValidation(r.data);
    } catch {}
    finally { setValidating(false); }
  }, [name, rules, jsonRules, priority, mode]);

  // Auto-validate when on validate step
  useEffect(() => {
    if (step === "validate") runValidation();
  }, [step]);

  const handleSubmit = async () => {
    const rulesObj = buildRulesObject();
    if (!rulesObj) return;
    setSubmitting(true); setError(null);
    try {
      const payload = { name, description, policy_type: policyType, status, priority, rules: rulesObj };
      if (isNew) await policyApi.create(payload as any);
      else       await policyApi.update(policy!.id, payload as any);
      onSave();
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to save.");
    } finally { setSubmitting(false); }
  };

  const applyTemplate = (t: typeof TEMPLATES[0]) => {
    const newRule: BuilderRule = {
      effect: t.effect as "deny"|"allow",
      agentId: t.agent_wildcard ? "*" : "",
      assetId: "",
      actions: t.actions,
    };
    setRules([newRule]);
    setStep("form");
  };

  const canSave = !validation || validation.errors.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-2xl my-8">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <FiShield className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">
              {isNew ? "New Policy" : `Edit: ${policy!.name}`}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {/* Builder / Advanced toggle */}
            {step === "form" && (
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                {[{id:"builder",icon:<FiLayout className="w-3.5 h-3.5"/>,label:"Builder"},
                  {id:"advanced",icon:<FiCode className="w-3.5 h-3.5"/>,label:"JSON"}].map(m=>(
                  <button key={m.id} onClick={()=>setMode(m.id as any)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      mode===m.id ? "bg-blue-600 text-slate-900" : "text-slate-500 hover:text-slate-900"
                    }`}>
                    {m.icon}{m.label}
                  </button>
                ))}
              </div>
            )}
            <button onClick={onClose}><FiX className="w-5 h-5 text-slate-500 hover:text-slate-900"/></button>
          </div>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2 text-sm">{error}</div>
          )}

          {/* ── Step 1: Templates ── */}
          {step === "template" && (
            <div className="space-y-3">
              <p className="text-slate-500 text-sm mb-4">Start from a template or build from scratch.</p>
              {TEMPLATES.map(t => (
                <button key={t.id} onClick={() => applyTemplate(t)}
                  className="w-full flex items-center gap-4 bg-white border border-slate-200 hover:border-blue-500 rounded-xl p-4 text-left transition-colors group">
                  <span className="text-3xl flex-shrink-0">{t.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 group-hover:text-blue-500">{t.name}</p>
                    <p className="text-sm text-slate-500">{t.desc}</p>
                    <div className="flex gap-1 mt-1.5">
                      {t.actions.map(a => (
                        <span key={a} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{a}</span>
                      ))}
                    </div>
                  </div>
                  <FiChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 flex-shrink-0"/>
                </button>
              ))}
              <button onClick={() => setStep("form")}
                className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-300 hover:border-gray-400 rounded-xl p-4 text-slate-500 hover:text-slate-900 transition-colors text-sm">
                <FiPlus className="w-4 h-4"/> Build from scratch
              </button>
            </div>
          )}

          {/* ── Step 2: Form ── */}
          {step === "form" && (
            <div className="space-y-5">
              {/* Name + meta */}
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Policy Name *</label>
                <input type="text" value={name} onChange={e=>setName(e.target.value)} required
                  placeholder="e.g. Deny Support Agent Payroll Access"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none" />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Type</label>
                  <select value={policyType} onChange={e=>setPolicyType(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none">
                    {["access_control","security","compliance","data_classification","other"].map(t=>(
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Status</label>
                  <select value={status} onChange={e=>setStatus(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">
                    Priority
                    <span className="text-slate-400 ml-1 font-normal">(lower = first)</span>
                  </label>
                  <input type="number" min={1} max={1000} value={priority}
                    onChange={e=>setPriority(parseInt(e.target.value)||100)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"/>
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-500 mb-1">Description</label>
                <textarea rows={2} value={description} onChange={e=>setDescription(e.target.value)}
                  placeholder="What does this policy do?"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"/>
              </div>

              {/* ── Builder mode ── */}
              {mode === "builder" && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-slate-600">Rules</label>
                    <div className="flex gap-2">
                      {["deny","allow"].map(e=>(
                        <button key={e} type="button"
                          onClick={()=>setRules([...rules, {effect:e as any, agentId:"", assetId:"", actions:["access"]}])}
                          className={`text-xs px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 ${
                            e==="deny" ? "bg-red-900/50 text-red-600 border border-red-800 hover:bg-red-900" : "bg-green-900/50 text-green-600 border border-green-800 hover:bg-green-900"
                          }`}>
                          <FiPlus className="w-3 h-3"/> {e} rule
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {rules.map((rule, idx) => (
                      <div key={idx} className={`border rounded-xl p-4 ${
                        rule.effect==="deny" ? "border-red-800 bg-red-900/10" : "border-green-800 bg-green-900/10"
                      }`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex gap-1">
                            {["deny","allow"].map(e=>(
                              <button key={e} type="button"
                                onClick={()=>setRules(rules.map((r,i)=>i===idx ? {...r,effect:e as any} : r))}
                                className={`text-xs px-3 py-1 rounded-lg font-bold uppercase transition-colors ${
                                  rule.effect===e
                                    ? e==="deny" ? "bg-red-600 text-slate-900" : "bg-green-600 text-slate-900"
                                    : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                }`}>{e}</button>
                            ))}
                          </div>
                          {rules.length > 1 && (
                            <button type="button" onClick={()=>setRules(rules.filter((_,i)=>i!==idx))}
                              className="text-slate-400 hover:text-red-400">
                              <FiX className="w-4 h-4"/>
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">🤖 Agent</label>
                            <select value={rule.agentId}
                              onChange={e=>setRules(rules.map((r,i)=>i===idx ? {...r,agentId:e.target.value} : r))}
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none">
                              <option value="">— Select Agent —</option>
                              <option value="*">* All Agents</option>
                              {agents.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">🗄 Asset</label>
                            <select value={rule.assetId}
                              onChange={e=>setRules(rules.map((r,i)=>i===idx ? {...r,assetId:e.target.value} : r))}
                              className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none">
                              <option value="">— Select Asset —</option>
                              <option value="*">* All Assets</option>
                              {assets.map(a=><option key={a.id} value={a.id}>{a.name} [{a.classification}]</option>)}
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs text-slate-500 mb-2">Actions</label>
                          <div className="flex flex-wrap gap-2">
                            {ACTIONS.map(a=>(
                              <label key={a} className="flex items-center gap-1.5 cursor-pointer">
                                <input type="checkbox"
                                  checked={rule.actions.includes(a)}
                                  onChange={e=>setRules(rules.map((r,i)=>i!==idx ? r : {
                                    ...r, actions: e.target.checked
                                      ? [...r.actions, a]
                                      : r.actions.filter(x=>x!==a)
                                  }))}
                                  className="rounded border-slate-300 bg-slate-100 text-blue-500"/>
                                <span className="text-sm text-slate-600 capitalize">{a}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* Human-readable preview */}
                        {(rule.agentId || rule.assetId) && (
                          <div className="mt-3">
                            <RuleReadable
                              effect={rule.effect}
                              agentName={rule.agentId==="*" ? "All Agents" : agentName(rule.agentId)}
                              assetName={rule.assetId==="*" ? "All Assets" : assetName(rule.assetId)}
                              actions={rule.actions}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Advanced JSON mode ── */}
              {mode === "advanced" && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-sm font-medium text-slate-600">Rules (JSON)</label>
                    <div className="flex items-center gap-2">
                      {jsonError
                        ? <span className="text-red-600 text-xs">⚠ {jsonError}</span>
                        : <span className="text-green-600 text-xs">✓ Valid JSON</span>}
                      <button type="button"
                        onClick={()=>{try{setJsonRules(JSON.stringify(JSON.parse(jsonRules),null,2));setJsonError(null);}catch{}}}
                        className="text-xs text-blue-600 border border-blue-200 rounded px-2 py-0.5">Format</button>
                    </div>
                  </div>
                  <textarea value={jsonRules} rows={12} spellCheck={false}
                    onChange={e=>{
                      setJsonRules(e.target.value);
                      try{JSON.parse(e.target.value);setJsonError(null);}
                      catch(err:any){setJsonError(err.message);}
                    }}
                    className={`w-full bg-white text-green-700 font-mono text-xs px-4 py-3 rounded-xl border focus:outline-none resize-none leading-relaxed ${
                      jsonError ? "border-red-200" : "border-slate-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                    }`}/>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={()=>setStep("validate")}
                  className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-slate-900 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors">
                  <FiZap className="w-4 h-4"/> Validate & Preview
                </button>
                {isNew && (
                  <button type="button" onClick={()=>setStep("template")}
                    className="text-sm text-slate-500 hover:text-slate-900 px-4 py-2.5">
                    ← Templates
                  </button>
                )}
                <button type="button" onClick={onClose}
                  className="ml-auto text-sm text-slate-400 hover:text-slate-900 px-4 py-2.5">Cancel</button>
              </div>
            </div>
          )}

          {/* ── Step 3: Validate & Save ── */}
          {step === "validate" && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 mb-2">
                <button type="button" onClick={()=>setStep("form")}
                  className="text-slate-500 hover:text-slate-900 text-sm flex items-center gap-1">
                  ← Back to editor
                </button>
                <button type="button" onClick={runValidation}
                  className="text-xs text-blue-600 hover:text-blue-500 ml-auto flex items-center gap-1">
                  <FiActivity className="w-3 h-3"/> Re-validate
                </button>
              </div>

              {/* Policy summary */}
              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <p className="text-xs text-slate-500 uppercase font-semibold mb-2">Policy Summary</p>
                <p className="text-slate-900 font-bold text-base mb-1">{name || "(no name)"}</p>
                <p className="text-slate-500 text-xs mb-3">Priority {priority} · {status} · {policyType}</p>
                <div className="space-y-2">
                  {mode==="builder"
                    ? rules.map((r,i)=>(
                        <RuleReadable key={i} effect={r.effect}
                          agentName={r.agentId==="*" ? "All Agents" : agentName(r.agentId)}
                          assetName={r.assetId==="*" ? "All Assets" : assetName(r.assetId)}
                          actions={r.actions}/>
                      ))
                    : <pre className="text-xs text-green-700 font-mono bg-slate-100 rounded-lg p-3 overflow-auto">{jsonRules}</pre>
                  }
                </div>
              </div>

              <ValidationPanel result={validation} loading={validating} />

              <div className="flex gap-3 pt-2">
                <Button variant="primary" onClick={handleSubmit}
                  loading={submitting}
                  disabled={!canSave || validating}>
                  {isNew ? "Create Policy" : "Save Changes"}
                </Button>
                {!canSave && (
                  <p className="text-red-600 text-xs self-center">Fix errors above before saving.</p>
                )}
                {canSave && validation?.duplicates?.length > 0 && (
                  <p className="text-amber-600 text-xs self-center">
                    Duplicates detected — click Save to proceed anyway.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Delete Safety Modal ────────────────────────────────────────
function DeleteSafetyModal({ policy, onClose, onConfirm }: {
  policy: Policy; onClose: ()=>void; onConfirm: ()=>void;
}) {
  const [safety, setSafety] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (policyApi as any).getDeleteSafety(policy.id)
      .then((r: any) => setSafety(r.data))
      .finally(() => setLoading(false));
  }, [policy.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-slate-50 border border-red-800 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
          <FiAlertTriangle className="w-5 h-5 text-red-600"/>
          <h2 className="text-lg font-bold text-slate-900">Delete Policy</h2>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-slate-600 text-sm">
            You are about to delete <span className="text-slate-900 font-semibold">"{policy.name}"</span>.
          </p>
          {loading ? <LoadingSpinner text="Checking impact…" /> : safety && (
            <>
              {!safety.safe_to_delete && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
                  <p className="text-red-700 font-semibold text-sm flex items-center gap-2">
                    <FiAlertTriangle className="w-4 h-4"/> This policy has active history:
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-orange-600">{safety.runtime_matches}</p>
                      <p className="text-xs text-slate-500">Runtime Matches</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-red-600">{safety.incidents}</p>
                      <p className="text-xs text-slate-500">Incidents</p>
                    </div>
                  </div>
                  <p className="text-yellow-300 text-xs">
                    Deleting this policy will not remove historical events or incidents, but may affect ongoing security coverage.
                  </p>
                </div>
              )}
              {safety.safe_to_delete && (
                <div className="bg-green-900/20 border border-green-200 rounded-xl p-3 text-green-700 text-sm flex items-center gap-2">
                  <FiCheckCircle className="w-4 h-4"/> No active matches or incidents. Safe to delete.
                </div>
              )}
            </>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="danger" onClick={onConfirm}>Delete Anyway</Button>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Version History Panel ──────────────────────────────────────
function VersionPanel({ policyId, policyName, onClose }: {
  policyId: string; policyName: string; onClose: () => void;
}) {
  const [versions, setVersions] = useState<PolicyVersionSnapshot[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    policyApi.getVersions(policyId).then(r=>setVersions(r.data)).finally(()=>setLoading(false));
  }, [policyId]);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose}/>
      <div className="w-full max-w-md bg-white border-l border-slate-200 h-full overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FiGitCommit className="w-4 h-4 text-blue-600"/> Version History
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">{policyName}</p>
          </div>
          <button onClick={onClose}><FiX className="w-5 h-5 text-slate-500"/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? <LoadingSpinner/> : versions.length === 0
            ? <p className="text-slate-500 text-sm">No version history.</p>
            : versions.map((v,i)=>(
                <div key={i} className="flex items-center gap-3 px-3 py-3 bg-white rounded-xl text-sm mb-2">
                  <FiClock className="w-3.5 h-3.5 text-slate-500 flex-shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-900">Version {v.version}</p>
                    <p className="text-xs text-slate-500 truncate">{v.change_summary}</p>
                  </div>
                  <span className="text-xs text-slate-400">{new Date(v.saved_at).toLocaleString()}</span>
                </div>
              ))
          }
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
const Policies: React.FC = () => {
  const router = useRouter();
  const [policies, setPolicies]     = useState<Policy[]>([]);
  const [agents, setAgents]         = useState<Agent[]>([]);
  const [assets, setAssets]         = useState<Asset[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string|null>(null);
  const [search, setSearch]         = useState("");
  const [modal, setModal]           = useState<Policy|null|"new">(null);
  const [historyPolicy, setHistoryPolicy] = useState<Policy|null>(null);
  const [deletePolicy, setDeletePolicy]   = useState<Policy|null>(null);

  useEffect(()=>{
    if (!localStorage.getItem("token")) { router.push("/login"); return; }
    fetchAll();
  },[]);

  const fetchAll = () => {
    setLoading(true);
    Promise.all([policyApi.list(), agentApi.list(), assetApi.list()])
      .then(([p,a,as])=>{ setPolicies(p.data); setAgents(a.data as any); setAssets(as.data); })
      .catch(()=>setError("Failed to load policies"))
      .finally(()=>setLoading(false));
  };

  const handleDelete = async (policy: Policy) => {
    try { await policyApi.delete(policy.id); setPolicies(p=>p.filter(x=>x.id!==policy.id)); }
    catch { setError("Failed to delete."); }
    finally { setDeletePolicy(null); }
  };

  const filtered = policies.filter(p=>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.policy_type||"").toLowerCase().includes(search.toLowerCase())
  );

  const ruleCount = (p: Policy) => ((p.rules?.allow?.length||0)+(p.rules?.deny?.length||0));

  // Human-readable rule summary
  const ruleSummary = (p: Policy) => {
    const r = p.rules || {};
    const denies = (r.deny||[]).slice(0,2).map((rule:any) => {
      const an = agents.find(a=>a.id===rule.agent_id)?.name || (rule.agent_id==="*" ? "All" : "Agent");
      const as = assets.find(a=>a.id===rule.asset_id)?.name || (rule.asset_id==="*" ? "All" : "Asset");
      return `DENY ${an} → ${as}`;
    });
    const allows = (r.allow||[]).slice(0,1).map((rule:any) => {
      const an = agents.find(a=>a.id===rule.agent_id)?.name || (rule.agent_id==="*" ? "All" : "Agent");
      const as = assets.find(a=>a.id===rule.asset_id)?.name || (rule.asset_id==="*" ? "All" : "Asset");
      return `ALLOW ${an} → ${as}`;
    });
    return [...denies, ...allows].join(" · ") || "No rules";
  };

  return (
    <>
      <Head><title>Policies - AI-SecOS</title></Head>

      {(modal === "new" || (modal && typeof modal === "object")) && (
        <PolicyBuilderModal
          policy={modal === "new" ? null : modal as Policy}
          agents={agents} assets={assets}
          onClose={()=>setModal(null)}
          onSave={()=>{ setModal(null); fetchAll(); }}
        />
      )}
      {historyPolicy && (
        <VersionPanel policyId={historyPolicy.id} policyName={historyPolicy.name}
          onClose={()=>setHistoryPolicy(null)}/>
      )}
      {deletePolicy && (
        <DeleteSafetyModal policy={deletePolicy}
          onClose={()=>setDeletePolicy(null)}
          onConfirm={()=>handleDelete(deletePolicy)}/>
      )}

      <main className="min-h-screen py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                <FiShield className="w-7 h-7 text-blue-600"/> Policies
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                {policies.length} policies · {policies.filter(p=>p.status==="active").length} active
              </p>
            </div>
            <Button variant="primary" onClick={()=>setModal("new")}
              className="flex items-center gap-2">
              <FiPlus className="w-4 h-4"/> New Policy
            </Button>
          </div>

          {error && <Alert type="error" message={error} onClose={()=>setError(null)}/>}

          <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-2.5 mb-5">
            <FiSearch className="w-4 h-4 text-slate-500"/>
            <input type="text" placeholder="Search policies…" value={search}
              onChange={e=>setSearch(e.target.value)}
              className="flex-1 bg-transparent text-slate-900 text-sm placeholder-slate-400 outline-none"/>
          </div>

          {/* Priority info banner */}
          <div className="flex items-start gap-2 bg-indigo-900/20 border border-blue-200 rounded-xl px-4 py-3 mb-5 text-sm text-blue-500">
            <FiInfo className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-600"/>
            <span>
              Policies are evaluated in <strong>priority order</strong> (lowest number first).
              <strong> DENY rules always win</strong> — if a deny matches, evaluation stops immediately.
              Use the <strong>Policy Builder</strong> to validate for conflicts before saving.
            </span>
          </div>

          {loading ? <LoadingSpinner text="Loading…"/> : filtered.length===0 ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
              No policies yet. Without policies, all AI agent requests default to ALLOW. <button onClick={()=>setModal("new")} className="text-blue-600 ml-1 hover:underline font-medium">Create your first DENY policy →</button>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 border-b border-slate-200">
                  <tr>
                    {["Priority","Policy","Type","Rules","Status","Actions"].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filtered.sort((a,b)=>a.priority-b.priority).map(p=>(
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className="font-mono text-sm font-bold text-blue-600">{p.priority}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{p.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5 truncate max-w-[280px]">{ruleSummary(p)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge text={p.policy_type||"policy"} type="info"/>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs font-mono">{ruleCount(p)} rules</td>
                      <td className="px-4 py-3">
                        <Badge text={p.status} type={p.status==="active" ? "success" : "danger"}/>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs">
                          <button onClick={()=>setModal(p)}
                            className="px-2 py-1 rounded text-slate-600 hover:bg-slate-200">Edit</button>
                          <button onClick={()=>setHistoryPolicy(p)}
                            className="px-2 py-1 rounded text-blue-600 hover:bg-blue-50 flex items-center gap-1">
                            <FiGitCommit className="w-3 h-3"/> History
                          </button>
                          <button onClick={()=>setDeletePolicy(p)}
                            className="px-2 py-1 rounded text-red-600 hover:bg-red-50">Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t border-slate-200 text-xs text-slate-400">
                {filtered.length} of {policies.length} policies · sorted by priority
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
};

export default Policies;
