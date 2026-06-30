import React, { useState } from "react";
import Head from "next/head";
import PlatformShell from "../../components/PlatformShell";
import { FiAlertTriangle, FiSearch, FiExternalLink, FiShield, FiRefreshCw } from "react-icons/fi";

// Static threat intelligence data — no backend required
// In production this would pull from live feeds
const OWASP_LLM = [
  { id: "LLM01", name: "Prompt Injection",          risk: "Critical", desc: "Malicious inputs that override LLM instructions or extract sensitive data." },
  { id: "LLM02", name: "Insecure Output Handling",  risk: "High",     desc: "Insufficient validation of LLM output before passing to downstream components." },
  { id: "LLM03", name: "Training Data Poisoning",   risk: "High",     desc: "Manipulation of training data to introduce backdoors or biased behavior." },
  { id: "LLM04", name: "Model Denial of Service",   risk: "Medium",   desc: "Computationally intensive inputs causing service degradation or outage." },
  { id: "LLM05", name: "Supply Chain Vulnerabilities", risk: "High",  desc: "Risks from third-party datasets, pre-trained models, or ML libraries." },
  { id: "LLM06", name: "Sensitive Information Disclosure", risk: "Critical", desc: "LLMs inadvertently revealing confidential data in responses." },
  { id: "LLM07", name: "Insecure Plugin Design",    risk: "High",     desc: "LLM plugins with insufficient access controls or input validation." },
  { id: "LLM08", name: "Excessive Agency",           risk: "High",     desc: "Granting LLM agents more permissions than needed for their function." },
  { id: "LLM09", name: "Overreliance",               risk: "Medium",   desc: "Over-trusting LLM outputs without verification or human oversight." },
  { id: "LLM10", name: "Model Theft",                risk: "Medium",   desc: "Unauthorized access to extract proprietary model weights or architecture." },
];

const MITRE_AI = [
  { id: "AML.T0048", tactic: "Initial Access", name: "Phishing via ML API",    desc: "Using AI-generated content for targeted spear-phishing." },
  { id: "AML.T0012", tactic: "Persistence",    name: "Backdoor ML Model",       desc: "Inserting backdoor triggers into model training." },
  { id: "AML.T0043", tactic: "Discovery",      name: "Discover ML Artifacts",   desc: "Identifying ML models, training data, and pipelines." },
  { id: "AML.T0040", tactic: "Exfiltration",   name: "Extract ML Model",        desc: "Reconstructing model via carefully crafted inference queries." },
  { id: "AML.T0029", tactic: "Impact",         name: "Denial of ML Service",    desc: "Crafting inputs to degrade model performance or availability." },
  { id: "AML.T0015", tactic: "Evasion",        name: "Evade ML Model",          desc: "Adversarial examples designed to fool ML classifiers." },
  { id: "AML.T0025", tactic: "Exfiltration",   name: "Infer Training Data",     desc: "Membership inference attacks to reconstruct training data." },
  { id: "AML.T0006", tactic: "Impact",         name: "Poison Training Data",    desc: "Injecting malicious samples to corrupt model behavior." },
];

const RISK_CLS: Record<string, string> = {
  Critical: "text-red-300 bg-red-900/30 border-red-700",
  High:     "text-orange-300 bg-orange-900/30 border-orange-700",
  Medium:   "text-yellow-300 bg-yellow-900/20 border-yellow-700",
  Low:      "text-green-300 bg-green-900/20 border-green-700",
};

const ThreatIntel: React.FC = () => {
  const [tab, setTab]     = useState<"owasp" | "mitre" | "frameworks">("owasp");
  const [search, setSearch] = useState("");
  const [lastUpdated]     = useState(new Date().toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" }));

  const filteredOWASP = OWASP_LLM.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.id.toLowerCase().includes(search.toLowerCase()) ||
    i.desc.toLowerCase().includes(search.toLowerCase())
  );

  const filteredMITRE = MITRE_AI.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    i.id.toLowerCase().includes(search.toLowerCase()) ||
    i.tactic.toLowerCase().includes(search.toLowerCase())
  );

  const FRAMEWORKS = [
    { name: "OWASP LLM Top 10",  version: "2025", controls: 10, org: "OWASP Foundation",       url: "https://owasp.org/www-project-top-10-for-large-language-model-applications/", status: "Active" },
    { name: "MITRE ATLAS",        version: "v4.5", controls: 82, org: "MITRE Corporation",       url: "https://atlas.mitre.org/",           status: "Active" },
    { name: "NIST AI RMF",        version: "1.0",  controls: 72, org: "NIST",                   url: "https://airc.nist.gov/",             status: "Active" },
    { name: "ISO/IEC 42001",      version: "2023", controls: 38, org: "ISO/IEC",                 url: "https://www.iso.org/standard/81230.html", status: "Active" },
    { name: "EU AI Act",          version: "2024", controls: 53, org: "European Union",          url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689", status: "Active" },
    { name: "CISA AI Guidance",   version: "2024", controls: 18, org: "CISA",                   url: "https://www.cisa.gov/ai",            status: "Active" },
  ];

  return (
    <>
      <Head><title>Threat Intelligence — AI-SecOS Platform</title></Head>
      <PlatformShell>
        <div className="p-6 max-w-screen-xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-white">Threat Intelligence</h1>
              <p className="text-gray-500 text-sm mt-0.5">
                AI-specific threat frameworks — shared across all organizations · Updated {lastUpdated}
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-green-400 bg-green-900/20 border border-green-800 px-3 py-1.5 rounded-lg">
              <FiShield className="w-3.5 h-3.5" /> Platform-managed feeds
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 mb-5">
            <FiSearch className="w-4 h-4 text-gray-500" />
            <input placeholder="Search threats, techniques, frameworks…" value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-white text-sm placeholder-gray-600 outline-none" />
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-800 mb-5">
            {[
              { id: "owasp",      label: "OWASP LLM Top 10" },
              { id: "mitre",      label: "MITRE ATLAS" },
              { id: "frameworks", label: "All Frameworks" },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id as any)}
                className={`px-5 py-3 text-sm font-medium transition-colors ${tab === t.id ? "border-b-2 border-indigo-500 text-indigo-400" : "text-gray-500 hover:text-white"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* OWASP LLM Top 10 */}
          {tab === "owasp" && (
            <div className="space-y-3">
              {filteredOWASP.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">No results for "{search}"</div>
              ) : filteredOWASP.map(item => (
                <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-16 text-center">
                      <span className="text-indigo-400 font-bold font-mono text-sm">{item.id}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-white">{item.name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold flex-shrink-0 ${RISK_CLS[item.risk]}`}>
                          {item.risk}
                        </span>
                      </div>
                      <p className="text-sm text-gray-400">{item.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex justify-end">
                <a href="https://owasp.org/www-project-top-10-for-large-language-model-applications/"
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                  <FiExternalLink className="w-3.5 h-3.5" /> Full OWASP LLM documentation
                </a>
              </div>
            </div>
          )}

          {/* MITRE ATLAS */}
          {tab === "mitre" && (
            <div className="space-y-3">
              {filteredMITRE.length === 0 ? (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center text-gray-500">No results for "{search}"</div>
              ) : filteredMITRE.map(item => (
                <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                      <span className="font-mono text-xs text-indigo-400">{item.id}</span>
                      <p className="text-xs text-gray-600 mt-0.5">{item.tactic}</p>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-white mb-1">{item.name}</p>
                      <p className="text-sm text-gray-400">{item.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
              <div className="flex justify-end">
                <a href="https://atlas.mitre.org/" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                  <FiExternalLink className="w-3.5 h-3.5" /> Full MITRE ATLAS documentation
                </a>
              </div>
            </div>
          )}

          {/* All Frameworks */}
          {tab === "frameworks" && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/40 border-b border-gray-800">
                  <tr>{["Framework","Version","Controls","Organization","Status","Link"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {FRAMEWORKS.filter(f =>
                    !search || f.name.toLowerCase().includes(search.toLowerCase()) || f.org.toLowerCase().includes(search.toLowerCase())
                  ).map(f => (
                    <tr key={f.name} className="hover:bg-gray-800/30">
                      <td className="px-4 py-3 font-semibold text-white">{f.name}</td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{f.version}</td>
                      <td className="px-4 py-3 text-indigo-400 font-semibold">{f.controls}</td>
                      <td className="px-4 py-3 text-gray-400 text-sm">{f.org}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-green-400 bg-green-900/30 border border-green-800 px-2 py-0.5 rounded-full">{f.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        <a href={f.url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
                          <FiExternalLink className="w-3.5 h-3.5" /> View
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PlatformShell>
    </>
  );
};

export default ThreatIntel;
