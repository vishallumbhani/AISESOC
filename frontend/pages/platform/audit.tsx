import React, { useState, useEffect } from "react";
import Head from "next/head";
import PlatformShell from "../../components/PlatformShell";
import platformApi from "../../lib/platformApi";
import { hasPlatformToken, clearPlatformSession, startImpersonation, getImpersonatingOrg } from "../../lib/tokens";
import { FiRefreshCw, FiSearch } from "react-icons/fi";

const fmtTs = (d?: string) => d
  ? new Date(d).toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit"})
  : "—";
const ACTION_COLOR: Record<string,string> = {
  org_created:"text-green-400", org_deleted:"text-red-400", org_suspended:"text-orange-400",
  org_reactivated:"text-teal-400", org_updated:"text-blue-400", org_impersonated:"text-yellow-400",
  platform_login:"text-indigo-400",
};

const PlatformAudit: React.FC = () => {
  const [logs, setLogs]     = useState<any[]>([]);
  const [orgs, setOrgs]     = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const [l, o] = await Promise.all([
        platformApi.get("/platform/audit-logs?limit=200"),
        platformApi.get("/platform/organizations"),
      ]);
      setLogs(l.data);
      const m: Record<string,string> = {};
      o.data.forEach((x: any) => { m[x.id] = x.name; });
      setOrgs(m);
    } finally { setLoading(false); }
  };

  const actions = [...new Set(logs.map(l => l.action))].sort();
  const filtered = logs.filter(l => {
    if (filter && l.action !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return l.action?.includes(s)
        || JSON.stringify(l.changes || {}).toLowerCase().includes(s)
        || (l.organization_id && orgs[l.organization_id]?.toLowerCase().includes(s));
    }
    return true;
  });

  return (
    <>
      <Head><title>Platform Audit — AI-SecOS</title></Head>
      <PlatformShell>
        <div className="p-6 max-w-screen-xl mx-auto">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-xl font-bold text-white">Platform Audit Log</h1>
              <p className="text-gray-500 text-sm mt-0.5">Separate from organization audit logs</p>
            </div>
            <button onClick={load} className="p-2.5 bg-gray-900 border border-gray-800 text-gray-400 hover:text-white rounded-xl">
              <FiRefreshCw className="w-4 h-4"/>
            </button>
          </div>
          <div className="flex gap-3 mb-4">
            <div className="flex-1 flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5">
              <FiSearch className="w-4 h-4 text-gray-500"/>
              <input placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-white text-sm placeholder-gray-600 outline-none"/>
            </div>
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none">
              <option value="">All Actions</option>
              {actions.map(a => <option key={a} value={a}>{a.replace(/_/g," ")}</option>)}
            </select>
          </div>
          {loading ? (
            <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/></div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/40 border-b border-gray-800">
                  <tr>{["Time","Action","Organization","Details"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filtered.length === 0
                    ? <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-600">No entries found.</td></tr>
                    : filtered.map((log: any, i: number) => (
                      <tr key={i} className="hover:bg-gray-800/30">
                        <td className="px-4 py-2.5 text-gray-500 text-xs font-mono whitespace-nowrap">{fmtTs(log.created_at)}</td>
                        <td className="px-4 py-2.5 font-medium">
                          <span className={ACTION_COLOR[log.action] || "text-white"}>{log.action?.replace(/_/g," ")}</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-300 text-sm">
                          {log.organization_id ? orgs[log.organization_id] || log.organization_id.slice(0,8)+"…" : <span className="text-gray-600">Platform</span>}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs font-mono max-w-xs truncate">
                          {JSON.stringify(log.changes || {}).slice(0,100)}
                        </td>
                      </tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PlatformShell>
    </>
  );
};
export default PlatformAudit;
