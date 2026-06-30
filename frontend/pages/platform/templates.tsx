import React, { useState } from "react";
import Head from "next/head";
import PlatformShell from "../../components/PlatformShell";
import { FiSearch, FiCopy, FiCheckCircle, FiLayout, FiShield, FiAlertTriangle } from "react-icons/fi";

const TEMPLATES = [
  // Access Control
  {
    id: "deny-sensitive-access", cat: "Access Control", icon: "🚫",
    name: "Deny Sensitive Asset Access",
    desc: "Block any AI agent from accessing confidential or restricted assets.",
    tags: ["security", "compliance", "default"],
    rules: { deny: [{ agent_id: "*", asset_id: "", actions: ["access","read","write","delete","admin"] }], allow: [] },
    playbook: ["1. Identify all sensitive assets (classification: confidential, restricted)", "2. Apply this policy to each sensitive asset", "3. Create exceptions for authorized agents using Allow policy", "4. Monitor runtime events for bypass attempts"],
  },
  {
    id: "read-only-access", cat: "Access Control", icon: "👁️",
    name: "Read-Only Access",
    desc: "Allow agents to read data but block all modifications.",
    tags: ["least-privilege", "default"],
    rules: { deny: [{ agent_id: "", asset_id: "", actions: ["write","delete","admin"] }], allow: [{ agent_id: "", asset_id: "", actions: ["access","read"] }] },
    playbook: ["1. Select the agent and asset", "2. Apply this template", "3. Verify with Policy Simulator", "4. Activate and monitor"],
  },
  {
    id: "finance-protection", cat: "Data Protection", icon: "💰",
    name: "Finance Data Protection",
    desc: "Block all agents from accessing financial and payroll systems.",
    tags: ["finance", "compliance", "SOC2"],
    rules: { deny: [{ agent_id: "*", asset_id: "", actions: ["access","read","write","delete","admin"] }], allow: [] },
    playbook: ["1. Tag all finance assets (payroll, ERP, banking)", "2. Apply Finance Protection to each", "3. Whitelist only authorized finance agents", "4. Review quarterly"],
  },
  {
    id: "pii-protection", cat: "Data Protection", icon: "🔒",
    name: "PII Data Protection",
    desc: "Restrict write/delete operations on personal data assets.",
    tags: ["GDPR", "HIPAA", "compliance"],
    rules: { deny: [{ agent_id: "*", asset_id: "", actions: ["write","delete","admin"] }], allow: [] },
    playbook: ["1. Classify assets containing PII", "2. Apply this template", "3. Ensure data minimization", "4. Run compliance report monthly"],
  },
  {
    id: "production-lockdown", cat: "Environment Control", icon: "🏭",
    name: "Production Lockdown",
    desc: "Enforce read-only access to production systems from AI agents.",
    tags: ["production", "risk"],
    rules: { deny: [{ agent_id: "*", asset_id: "", actions: ["write","delete","admin"] }], allow: [{ agent_id: "", asset_id: "", actions: ["access","read"] }] },
    playbook: ["1. Tag all production assets", "2. Apply Production Lockdown", "3. Use staging for AI write operations", "4. Require approval for any production write exception"],
  },
  {
    id: "hr-data-policy", cat: "Data Protection", icon: "👔",
    name: "HR Data Policy",
    desc: "Block all AI agents from HR systems except authorized HR agents.",
    tags: ["HR", "compliance"],
    rules: { deny: [{ agent_id: "*", asset_id: "", actions: ["access","read","write","delete","admin"] }], allow: [] },
    playbook: ["1. Identify HR data assets", "2. Apply this template (denies all)", "3. Create separate Allow policy for authorized HR agents", "4. Review HR agent list quarterly"],
  },
  {
    id: "incident-response", cat: "Playbook", icon: "🚨",
    name: "Incident Response Playbook",
    desc: "Standard playbook for AI security incidents — detection to resolution.",
    tags: ["incident", "SOC", "response"],
    rules: null,
    playbook: [
      "1. DETECT: Alert fires on 3+ denials in 10 minutes",
      "2. TRIAGE: Security analyst opens Incident Investigation",
      "3. CONTAIN: Disable the violating agent immediately",
      "4. INVESTIGATE: Review WHO/WHAT/WHY in incident workspace",
      "5. EVIDENCE: Export audit log with chain of custody",
      "6. REMEDIATE: Update policy to prevent recurrence",
      "7. RECOVER: Re-enable agent with tightened permissions",
      "8. REVIEW: Post-incident report within 48 hours",
    ],
  },
  {
    id: "zero-trust-agents", cat: "Architecture", icon: "🛡️",
    name: "Zero Trust Agent Policy",
    desc: "Deny by default — agents must be explicitly granted access to each asset.",
    tags: ["zero-trust", "security"],
    rules: { deny: [{ agent_id: "*", asset_id: "*", actions: ["access","read","write","delete","admin"] }], allow: [] },
    playbook: ["1. Apply Deny All as the base policy (lowest priority)", "2. Create specific Allow policies per agent-asset pair", "3. Simulate each new Allow before activating", "4. Review monthly and remove unused exceptions"],
  },
];

const CATS = ["All", ...new Set(TEMPLATES.map(t => t.cat))];

const TAG_CLS: Record<string, string> = {
  security:    "text-red-300 bg-red-900/20 border-red-800",
  compliance:  "text-blue-300 bg-blue-900/20 border-blue-800",
  default:     "text-gray-300 bg-gray-800 border-gray-600",
  GDPR:        "text-purple-300 bg-purple-900/20 border-purple-800",
  HIPAA:       "text-orange-300 bg-orange-900/20 border-orange-800",
  SOC2:        "text-teal-300 bg-teal-900/20 border-teal-800",
  finance:     "text-green-300 bg-green-900/20 border-green-800",
  incident:    "text-red-300 bg-red-900/20 border-red-800",
};

const Templates: React.FC = () => {
  const [cat, setCat]       = useState("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<typeof TEMPLATES[0] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const filtered = TEMPLATES.filter(t =>
    (cat === "All" || t.cat === cat) &&
    (t.name.toLowerCase().includes(search.toLowerCase()) ||
     t.desc.toLowerCase().includes(search.toLowerCase()) ||
     t.tags.some(tag => tag.toLowerCase().includes(search.toLowerCase())))
  );

  return (
    <>
      <Head><title>Templates — AI-SecOS Platform</title></Head>
      <PlatformShell>
        <div className="p-6 max-w-screen-xl mx-auto">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-white">Policy Templates & Playbooks</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Platform-managed templates available to all organizations · {TEMPLATES.length} templates
            </p>
          </div>

          <div className="flex gap-3 mb-5">
            <div className="flex-1 flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5">
              <FiSearch className="w-4 h-4 text-gray-500" />
              <input placeholder="Search templates by name, tag, or description…"
                value={search} onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-white text-sm placeholder-gray-600 outline-none" />
            </div>
            <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
              {CATS.map(c => (
                <button key={c} onClick={() => setCat(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${cat === c ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="fixed inset-0 z-50 flex">
              <div className="flex-1 bg-black/50" onClick={() => setSelected(null)} />
              <div className="w-full max-w-xl bg-gray-950 border-l border-gray-800 h-full overflow-y-auto flex flex-col">
                <div className="px-6 py-5 border-b border-gray-800 flex-shrink-0">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{selected.icon}</span>
                      <div>
                        <h2 className="font-bold text-white">{selected.name}</h2>
                        <p className="text-gray-500 text-sm">{selected.cat}</p>
                      </div>
                    </div>
                    <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white">✕</button>
                  </div>
                  <p className="text-sm text-gray-400 mt-3">{selected.desc}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selected.tags.map(tag => (
                      <span key={tag} className={`text-xs px-2 py-0.5 rounded-full border ${TAG_CLS[tag] || "text-gray-400 bg-gray-800 border-gray-600"}`}>{tag}</span>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {selected.rules && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-gray-300">Policy Rules (JSON)</p>
                        <button onClick={() => copy(selected.id, JSON.stringify(selected.rules, null, 2))}
                          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                          {copied === selected.id ? <FiCheckCircle className="w-3.5 h-3.5" /> : <FiCopy className="w-3.5 h-3.5" />}
                          {copied === selected.id ? "Copied!" : "Copy JSON"}
                        </button>
                      </div>
                      <pre className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-green-300 font-mono overflow-auto">
                        {JSON.stringify(selected.rules, null, 2)}
                      </pre>
                      <p className="text-xs text-gray-600 mt-1">
                        Replace <code className="text-gray-400">""</code> with actual agent/asset UUIDs. Use <code className="text-gray-400">"*"</code> for wildcard.
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-gray-300 mb-3">
                      {selected.rules ? "Implementation Playbook" : "Response Playbook"}
                    </p>
                    <div className="space-y-2">
                      {selected.playbook.map((step, i) => (
                        <div key={i} className="flex items-start gap-3 bg-gray-900 border border-gray-800 rounded-lg px-4 py-3">
                          <span className="text-indigo-400 font-bold text-sm flex-shrink-0 w-5">{i+1}.</span>
                          <p className="text-sm text-gray-300">{step.replace(/^\d+\.\s/, "")}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
              <FiLayout className="w-10 h-10 text-gray-700 mx-auto mb-3" />
              <p className="text-gray-400">No templates found for "{search}"</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filtered.map(t => (
                <div key={t.id}
                  onClick={() => setSelected(t)}
                  className="bg-gray-900 border border-gray-800 hover:border-indigo-700 rounded-xl p-5 cursor-pointer transition-all group">
                  <div className="flex items-start gap-3 mb-3">
                    <span className="text-2xl flex-shrink-0">{t.icon}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-white group-hover:text-indigo-300 transition-colors text-sm">{t.name}</p>
                      <p className="text-xs text-gray-500">{t.cat}</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-400 mb-3 line-clamp-2">{t.desc}</p>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {t.tags.slice(0, 2).map(tag => (
                        <span key={tag} className={`text-xs px-1.5 py-0.5 rounded border ${TAG_CLS[tag] || "text-gray-500 bg-gray-800 border-gray-700"}`}>{tag}</span>
                      ))}
                    </div>
                    <span className="text-xs text-indigo-400 group-hover:text-indigo-300">View →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PlatformShell>
    </>
  );
};

export default Templates;
