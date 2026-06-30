import React, { useState, useEffect } from "react";
import Head from "next/head";
import Link from "next/link";
import PlatformShell from "../../components/PlatformShell";
import platformApi from "../../lib/platformApi";
import { hasPlatformToken, clearPlatformSession, startImpersonation, getImpersonatingOrg } from "../../lib/tokens";
import {
  FiGlobe, FiUsers, FiCpu, FiDatabase, FiShield,
  FiAlertTriangle, FiZap, FiActivity, FiChevronRight,
  FiCheckCircle, FiDollarSign, FiTrendingUp,
} from "react-icons/fi";

const fmtTs = (d?: string) => d
  ? new Date(d).toLocaleString("en-US", { month:"short", day:"numeric", hour:"2-digit", minute:"2-digit" })
  : "—";

const PlatformDashboard: React.FC = () => {
  const [metrics, setMetrics]   = useState<any>(null);
  const [orgs, setOrgs]         = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      platformApi.get("/platform/metrics"),
      platformApi.get("/platform/organizations"),
      platformApi.get("/platform/audit-logs?limit=8"),
    ]).then(([m, o, a]) => {
      setMetrics(m.data);
      setOrgs(o.data.slice(0, 6));
      setAuditLogs(a.data);
    }).finally(() => setLoading(false));
  }, []);

  const STAT_CARDS = metrics ? [
    { label:"Organizations",    value: metrics.organizations?.total,    sub: `${metrics.organizations?.active} active`,    icon:<FiGlobe/>,         color:"indigo" },
    { label:"Total Users",      value: metrics.users?.total,            sub: "across all orgs",                            icon:<FiUsers/>,         color:"blue" },
    { label:"AI Agents",        value: metrics.agents?.total,           sub: "discovered & managed",                       icon:<FiCpu/>,           color:"purple" },
    { label:"Protected Assets", value: metrics.assets?.total,           sub: "under governance",                           icon:<FiDatabase/>,      color:"teal" },
    { label:"Active Policies",  value: metrics.policies?.total,         sub: "enforced at runtime",                        icon:<FiShield/>,        color:"orange" },
    { label:"Runtime Events",   value: metrics.runtime_events?.total,   sub: `${metrics.runtime_events?.denied} denied`,   icon:<FiZap/>,           color:"cyan" },
    { label:"Open Incidents",   value: metrics.incidents?.open,         sub: "requiring attention",                        icon:<FiAlertTriangle/>, color:"red" },
    { label:"Platform Health",  value: "Operational",                   sub: "all systems normal",                         icon:<FiActivity/>,      color:"green" },
  ] : [];

  const COLOR_MAP: Record<string, string> = {
    indigo:  "bg-indigo-900/30 border-indigo-800 text-indigo-400",
    blue:    "bg-blue-900/30 border-blue-800 text-blue-400",
    purple:  "bg-purple-900/30 border-purple-800 text-purple-400",
    teal:    "bg-teal-900/30 border-teal-800 text-teal-400",
    orange:  "bg-orange-900/30 border-orange-800 text-orange-400",
    cyan:    "bg-cyan-900/30 border-cyan-800 text-cyan-400",
    red:     "bg-red-900/30 border-red-800 text-red-400",
    green:   "bg-green-900/30 border-green-800 text-green-400",
  };

  return (
    <>
      <Head><title>Platform Dashboard — AI-SecOS</title></Head>
      <PlatformShell>
        <div className="p-6 max-w-screen-xl mx-auto">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-white">Platform Dashboard</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              SaaS operations overview · {new Date().toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })}
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Metric cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {STAT_CARDS.map(c => (
                  <div key={c.label} className={`border rounded-xl p-4 ${COLOR_MAP[c.color]}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-gray-400">{c.label}</span>
                      <span className="opacity-60">{c.icon}</span>
                    </div>
                    <p className="text-2xl font-bold text-white">
                      {typeof c.value === "number" ? c.value.toLocaleString() : c.value}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{c.sub}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Organizations list */}
                <div className="lg:col-span-2 bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-800">
                    <h2 className="text-sm font-semibold text-white">Organizations</h2>
                    <Link href="/platform/organizations"
                      className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                      View all <FiChevronRight className="w-3 h-3"/>
                    </Link>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-800/40">
                      <tr>
                        {["Organization","Plan","Status","Users","Inc."].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {orgs.length === 0
                        ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-600">No organizations yet.</td></tr>
                        : orgs.map(org => (
                          <tr key={org.id} className="hover:bg-gray-800/30">
                            <td className="px-4 py-3">
                              <p className="text-white text-sm font-medium">{org.name}</p>
                              <p className="text-gray-600 text-xs">{org.billing_email || "—"}</p>
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-xs capitalize">{org.plan}</td>
                            <td className="px-4 py-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                org.status === "active"
                                  ? "bg-green-900/40 text-green-400"
                                  : "bg-red-900/40 text-red-400"
                              }`}>{org.status}</span>
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-xs">{org.user_count}</td>
                            <td className="px-4 py-3">
                              {org.open_incidents > 0
                                ? <span className="text-red-400 text-xs font-bold">{org.open_incidents}</span>
                                : <span className="text-gray-600 text-xs">0</span>}
                            </td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>

                {/* Right column */}
                <div className="space-y-4">
                  {/* Top active orgs */}
                  <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="px-4 py-3.5 border-b border-gray-800">
                      <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                        <FiTrendingUp className="w-4 h-4 text-indigo-400"/> Top Active
                      </h2>
                    </div>
                    {(metrics?.top_active_orgs || []).length === 0
                      ? <p className="px-4 py-6 text-gray-600 text-sm">No data yet.</p>
                      : (metrics?.top_active_orgs || []).map((org: any, i: number) => (
                          <div key={org.org_id} className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-800 last:border-0">
                            <span className="text-gray-600 text-xs w-4">{i+1}.</span>
                            <span className="text-white text-sm flex-1 truncate">{org.org_name}</span>
                            <span className="text-indigo-400 text-xs font-mono">{org.events.toLocaleString()}</span>
                          </div>
                        ))
                    }
                  </div>

                  {/* Recent audit */}
                  <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-800">
                      <h2 className="text-sm font-semibold text-white">Recent Activity</h2>
                      <Link href="/platform/audit"
                        className="text-xs text-indigo-400 hover:text-indigo-300">View all</Link>
                    </div>
                    {auditLogs.slice(0, 5).map((log: any, i: number) => (
                      <div key={i} className="px-4 py-2.5 border-b border-gray-800 last:border-0">
                        <p className="text-white text-xs font-medium">{log.action?.replace(/_/g," ")}</p>
                        <p className="text-gray-600 text-xs">{fmtTs(log.created_at)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </PlatformShell>
    </>
  );
};

export default PlatformDashboard;
