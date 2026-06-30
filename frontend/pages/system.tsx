import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { getOrgToken } from "../lib/tokens";
import { FiRefreshCw, FiCheckCircle, FiAlertCircle, FiHelpCircle, FiServer } from "react-icons/fi";

interface ServiceStatus {
  label:  string;
  status: "healthy" | "degraded" | "unknown";
  detail?: string;
}

const FRONTEND_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0";

const SystemHealth: React.FC = () => {
  const router = useRouter();
  const [services, setServices]     = useState<ServiceStatus[]>([]);
  const [loading, setLoading]       = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    if (!getOrgToken()) { router.push("/login"); return; }
    check();
  }, []);

  const check = async () => {
    setLoading(true);
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    let apiStatus:   ServiceStatus = { label: "Backend API",         status: "unknown" };
    let dbStatus:    ServiceStatus = { label: "PostgreSQL Database",  status: "unknown" };
    let graphStatus: ServiceStatus = { label: "Neo4j Graph DB",       status: "unknown" };
    try {
      const res  = await fetch(`${base}/health`);
      const data = await res.json();
      apiStatus   = { label: "Backend API",        status: data.status === "healthy" ? "healthy" : "degraded",  detail: "v1.0.0" };
      dbStatus    = { label: "PostgreSQL Database", status: data.database === "healthy" ? "healthy" : "degraded", detail: data.database };
      graphStatus = { label: "Neo4j Graph DB",      status: data.graph === "healthy" ? "healthy" : "degraded",   detail: data.graph };
    } catch {
      apiStatus = { label: "Backend API", status: "degraded", detail: "Connection refused" };
    }
    setServices([
      apiStatus, dbStatus, graphStatus,
      { label: "Frontend App", status: "healthy", detail: `v${FRONTEND_VERSION}` },
    ]);
    setLastChecked(new Date());
    setLoading(false);
  };

  const Icon = ({ status }: { status: string }) => {
    if (status === "healthy") return <FiCheckCircle className="w-5 h-5 text-green-600" />;
    if (status === "degraded") return <FiAlertCircle className="w-5 h-5 text-red-600" />;
    return <FiHelpCircle className="w-5 h-5 text-slate-500" />;
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const map: Record<string, string> = {
      healthy:  "bg-green-900/40 text-green-600 border border-green-800",
      degraded: "bg-red-900/40 text-red-600 border border-red-800",
      unknown:  "bg-slate-100 text-slate-500 border border-slate-200",
    };
    return (
      <span className={`inline-block px-3 py-0.5 text-xs font-semibold rounded-full ${map[status] || map.unknown}`}>
        {status === "healthy" ? "Operational" : status === "degraded" ? "Degraded" : "Unknown"}
      </span>
    );
  };

  const overall = services.every(s => s.status === "healthy") ? "healthy"
    : services.some(s => s.status === "degraded") ? "degraded" : "unknown";

  return (
    <>
      <Head><title>System Health — AI-SecOS</title></Head>
      <main className="min-h-screen py-8">
        <div className="max-w-2xl mx-auto px-4">

          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center">
              <FiServer className="w-5 h-5 text-slate-900" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">System Health</h1>
              <p className="text-slate-400 text-xs mt-0.5">
                {lastChecked ? `Last checked: ${lastChecked.toLocaleTimeString()}` : "Checking…"}
              </p>
            </div>
            <button onClick={check} disabled={loading}
              className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-500 hover:text-slate-900 rounded-lg text-sm disabled:opacity-50">
              <FiRefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          {/* Overall status banner */}
          <div className={`rounded-xl border p-4 mb-5 flex items-center gap-3 ${
            overall === "healthy"  ? "bg-green-900/20 border-green-800" :
            overall === "degraded" ? "bg-red-900/20 border-red-800"    : "bg-slate-100 border-slate-200"
          }`}>
            <Icon status={overall} />
            <div>
              <p className="font-semibold text-slate-900">
                {overall === "healthy" ? "All systems operational" :
                 overall === "degraded" ? "Degraded — some services unavailable" : "Status unknown"}
              </p>
              <p className="text-slate-400 text-xs mt-0.5">AI-SecOS Platform v1.0.0</p>
            </div>
          </div>

          {/* Services list */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {services.map(s => (
                  <div key={s.label} className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3">
                      <Icon status={s.status} />
                      <div>
                        <p className="text-slate-900 font-medium text-sm">{s.label}</p>
                        {s.detail && <p className="text-slate-400 text-xs mt-0.5">{s.detail}</p>}
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
};

export default SystemHealth;
