import React, { useState, useEffect } from "react";
import Head from "next/head";
import PlatformShell from "../../components/PlatformShell";
import platformApi from "../../lib/platformApi";
import { FiCheck, FiPlus, FiRefreshCw, FiX } from "react-icons/fi";

const INTEGRATIONS = [
  // AI Platforms
  { id:"openai",       cat:"AI Platform",   name:"OpenAI",          icon:"🤖", desc:"GPT-4, Assistants API, fine-tuning",   type:"openai" },
  { id:"azure_openai", cat:"AI Platform",   name:"Azure OpenAI",    icon:"☁️",  desc:"Azure-hosted OpenAI models",           type:"azure_openai" },
  { id:"anthropic",    cat:"AI Platform",   name:"Anthropic Claude",icon:"🔮", desc:"Claude models — Opus, Sonnet, Haiku",  type:"anthropic" },
  { id:"gemini",       cat:"AI Platform",   name:"Google Gemini",   icon:"✨", desc:"Gemini Pro and Ultra models",           type:"manual" },
  { id:"bedrock",      cat:"AI Platform",   name:"AWS Bedrock",     icon:"🏔️", desc:"Multi-model AI gateway on AWS",         type:"manual" },
  { id:"crewai",       cat:"AI Framework",  name:"CrewAI",          icon:"👥", desc:"Multi-agent collaboration framework",   type:"manual" },
  { id:"langgraph",    cat:"AI Framework",  name:"LangGraph",       icon:"🕸️", desc:"Agent workflow orchestration",          type:"manual" },
  { id:"mcp",          cat:"AI Framework",  name:"MCP",             icon:"🔌", desc:"Model Context Protocol",                type:"manual" },
  // Security & SIEM
  { id:"splunk",       cat:"SIEM",          name:"Splunk",          icon:"📊", desc:"Log forwarding and alerting",           type:"manual" },
  { id:"elastic",      cat:"SIEM",          name:"Elastic SIEM",    icon:"🔍", desc:"Elastic Security integration",          type:"manual" },
  { id:"sentinel",     cat:"SIEM",          name:"Azure Sentinel",  icon:"🛡️", desc:"Microsoft Sentinel connector",          type:"manual" },
  // Ticketing
  { id:"jira",         cat:"Ticketing",     name:"Jira",            icon:"🎯", desc:"Incident → Jira ticket automation",    type:"manual" },
  { id:"servicenow",   cat:"Ticketing",     name:"ServiceNow",      icon:"⚙️", desc:"ITSM workflow integration",            type:"manual" },
  // Comms
  { id:"slack",        cat:"Notifications", name:"Slack",           icon:"💬", desc:"Alert notifications to channels",       type:"manual" },
  { id:"teams",        cat:"Notifications", name:"Microsoft Teams", icon:"👔", desc:"Teams alert notifications",             type:"manual" },
];

const CATS = ["All", ...new Set(INTEGRATIONS.map(i => i.cat))];

const Marketplace: React.FC = () => {
  const [connectors, setConnectors] = useState<any[]>([]);
  const [installing, setInstalling] = useState<string|null>(null);
  const [cat, setCat]               = useState("All");
  const [search, setSearch]         = useState("");
  const [modal, setModal]           = useState<typeof INTEGRATIONS[0]|null>(null);
  const [apiKey, setApiKey]         = useState("");

  useEffect(() => {
    platformApi.get("/connectors").then(r => setConnectors(r.data)).catch(()=>{});
  }, []);

  const installed = (id: string) => connectors.some(c => c.connector_type === id || c.name.toLowerCase().includes(id));

  const install = async () => {
    if (!modal) return;
    setInstalling(modal.id);
    try {
      await platformApi.post("/connectors", {
        name: modal.name,
        connector_type: modal.type,
        display_name: modal.name,
        config: apiKey ? { api_key: apiKey } : {},
      });
      const r = await platformApi.get("/connectors");
      setConnectors(r.data);
      setModal(null);
      setApiKey("");
    } catch (e: any) { alert(e.response?.data?.detail || "Install failed"); }
    finally { setInstalling(null); }
  };

  const filtered = INTEGRATIONS.filter(i =>
    (cat === "All" || i.cat === cat) &&
    (i.name.toLowerCase().includes(search.toLowerCase()) || i.desc.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      <Head><title>Marketplace — AI-SecOS Platform</title></Head>
      <PlatformShell>
        {modal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="bg-gray-950 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{modal.icon}</span>
                  <div>
                    <h2 className="font-bold text-white">Install {modal.name}</h2>
                    <p className="text-xs text-gray-500">{modal.cat}</p>
                  </div>
                </div>
                <button onClick={()=>{setModal(null);setApiKey("");}}><FiX className="w-5 h-5 text-gray-400"/></button>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-400">{modal.desc}</p>
                {modal.type !== "manual" && (
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">API Key (optional)</label>
                    <input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)}
                      placeholder="sk-..." className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm font-mono focus:outline-none focus:border-indigo-500"/>
                    <p className="text-xs text-gray-600 mt-1">Can be added later in Connectors settings</p>
                  </div>
                )}
                <div className="flex gap-3">
                  <button onClick={install} disabled={!!installing}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm">
                    {installing === modal.id ? "Installing…" : "Install"}
                  </button>
                  <button onClick={()=>{setModal(null);setApiKey("");}}
                    className="px-4 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg text-sm hover:bg-gray-700">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="p-6 max-w-screen-xl mx-auto">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-white">Marketplace</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Install integrations once — available to all customer organizations
            </p>
          </div>

          <div className="flex gap-3 mb-5">
            <input placeholder="Search integrations…" value={search} onChange={e=>setSearch(e.target.value)}
              className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-indigo-500"/>
            <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
              {CATS.map(c => (
                <button key={c} onClick={()=>setCat(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${cat===c?"bg-indigo-600 text-white":"text-gray-400 hover:text-white"}`}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(int => {
              const isInstalled = installed(int.id);
              return (
                <div key={int.id} className={`bg-gray-900 border rounded-xl p-5 transition-all ${isInstalled?"border-green-800/60":"border-gray-800 hover:border-gray-600"}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{int.icon}</span>
                      <div>
                        <p className="font-semibold text-white text-sm">{int.name}</p>
                        <p className="text-xs text-gray-500">{int.cat}</p>
                      </div>
                    </div>
                    {isInstalled && (
                      <span className="flex items-center gap-1 text-xs text-green-400 bg-green-900/30 border border-green-800 px-2 py-0.5 rounded-full">
                        <FiCheck className="w-3 h-3"/> Installed
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 mb-4">{int.desc}</p>
                  <button
                    onClick={() => !isInstalled && setModal(int)}
                    disabled={isInstalled}
                    className={`w-full py-2 rounded-lg text-sm font-medium transition-all ${
                      isInstalled
                        ? "bg-gray-800 text-gray-500 cursor-default"
                        : "bg-indigo-600 hover:bg-indigo-700 text-white"
                    }`}>
                    {isInstalled ? "Installed" : "Install"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </PlatformShell>
    </>
  );
};

export default Marketplace;
