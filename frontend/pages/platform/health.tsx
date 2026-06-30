import React, { useState, useEffect } from "react";
import Head from "next/head";
import PlatformShell from "../../components/PlatformShell";
import platformApi from "../../lib/platformApi";
import { hasPlatformToken, clearPlatformSession, startImpersonation, getImpersonatingOrg } from "../../lib/tokens";
import { FiCheckCircle, FiAlertCircle, FiRefreshCw } from "react-icons/fi";

const PlatformHealth: React.FC = () => {
  const [metrics, setMetrics] = useState<any>(null);
  const [health, setHealth]   = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [last, setLast]       = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const [m, h] = await Promise.all([
        platformApi.get("/platform/metrics"),
        fetch(`${BASE}/health`).then(r => r.json()).then(data => ({ data })),
      ]);
      setMetrics(m.data); setHealth(h.data);
      setLast(new Date().toLocaleTimeString());
    } finally { setLoading(false); }
  };

  const Svc = ({ name, status, detail }: { name:string; status:string; detail?:string }) => {
    const ok = ["healthy","connected","ok"].includes(status);
    return (
      <div className={`border rounded-xl p-4 ${ok?"bg-green-900/20 border-green-800":"bg-red-900/20 border-red-800"}`}>
        <div className="flex items-center gap-3 mb-1">
          {ok ? <FiCheckCircle className="w-5 h-5 text-green-400"/> : <FiAlertCircle className="w-5 h-5 text-red-400"/>}
          <span className="font-semibold text-white">{name}</span>
          <span className={`ml-auto text-xs font-bold uppercase ${ok?"text-green-400":"text-red-400"}`}>{status}</span>
        </div>
        {detail && <p className="text-xs text-gray-400 pl-8">{detail}</p>}
      </div>
    );
  };

  return (
    <>
      <Head><title>Platform Health — AI-SecOS</title></Head>
      <PlatformShell>
        <div className="p-6 max-w-screen-xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-white">Platform Health</h1>
              <p className="text-gray-500 text-sm mt-0.5">Last checked: {last || "—"}</p>
            </div>
            <button onClick={load} className="flex items-center gap-2 bg-gray-900 border border-gray-800 text-gray-400 hover:text-white px-4 py-2.5 rounded-xl text-sm">
              <FiRefreshCw className={`w-4 h-4 ${loading?"animate-spin":""}`}/> Refresh
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/></div>
          ) : (
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Services</p>
                <div className="grid grid-cols-3 gap-3">
                  <Svc name="Backend API" status={health?.status||"unknown"} detail="FastAPI + Uvicorn"/>
                  <Svc name="PostgreSQL"  status={health?.database||"unknown"} detail="Primary database"/>
                  <Svc name="Neo4j Graph" status={health?.graph||"unknown"} detail="Knowledge graph"/>
                </div>
              </div>
              {metrics && (
                <div>
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Usage</p>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      {l:"Organizations",  v:metrics.organizations?.total,  c:"text-blue-400"},
                      {l:"Runtime Events", v:metrics.runtime_events?.total, c:"text-purple-400"},
                      {l:"Denied",         v:metrics.runtime_events?.denied,c:"text-red-400"},
                      {l:"Open Incidents", v:metrics.incidents?.open,       c:"text-orange-400"},
                    ].map(s => (
                      <div key={s.l} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                        <p className={`text-2xl font-bold ${s.c}`}>{(s.v||0).toLocaleString()}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{s.l}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </PlatformShell>
    </>
  );
};
export default PlatformHealth;
