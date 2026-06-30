import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import PlatformShell from "../../components/PlatformShell";
import platformApi from "../../lib/platformApi";
import { hasPlatformToken, clearPlatformSession, startImpersonation, getImpersonatingOrg } from "../../lib/tokens";
import {
  FiSearch, FiPlusCircle, FiEye, FiKey, FiPause, FiPlay,
  FiTrash2, FiRefreshCw, FiX, FiEdit2, FiUsers, FiChevronRight,
} from "react-icons/fi";

const PLAN_CLS: Record<string,string> = {
  enterprise: "text-purple-300 bg-purple-900/30 border-purple-700",
  pro:        "text-blue-300 bg-blue-900/30 border-blue-700",
  starter:    "text-teal-300 bg-teal-900/30 border-teal-700",
  trial:      "text-yellow-300 bg-yellow-900/20 border-yellow-700",
  free:       "text-gray-400 bg-gray-800 border-gray-600",
};
const STATUS_CLS: Record<string,string> = {
  active:    "text-green-300 bg-green-900/30 border-green-700",
  suspended: "text-red-300 bg-red-900/30 border-red-700",
  trial:     "text-yellow-300 bg-yellow-900/20 border-yellow-700",
};

function Pill({ t, map }: { t: string; map: Record<string,string> }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${map[t]||"text-gray-400 bg-gray-800 border-gray-600"}`}>{t}</span>;
}
const fmt = (d?: string) => d ? new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) : "—";

// ── Create Org Modal ───────────────────────────────────────────
function CreateModal({ onClose, onDone }: { onClose:()=>void; onDone:()=>void }) {
  const [f, setF] = useState({
    name:"", plan:"free", billing_email:"",
    max_users:10, max_agents:50, max_assets:100,
    admin_username:"", admin_email:"", admin_password:"",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr]       = useState<string|null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setErr(null);
    try { await platformApi.post("/platform/organizations", f); onDone(); }
    catch (e: any) { setErr(e.response?.data?.detail||"Failed"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
      <div className="bg-gray-950 border border-gray-700 rounded-2xl w-full max-w-lg my-6 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="font-bold text-white">New Organization</h2>
          <button onClick={onClose}><FiX className="w-5 h-5 text-gray-400"/></button>
        </div>
        <form onSubmit={submit} className="p-6 space-y-4">
          {err && <div className="bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-2 text-sm">{err}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs text-gray-400 mb-1">Name *</label>
              <input required value={f.name} onChange={e=>setF({...f,name:e.target.value})}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"/>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Plan</label>
              <select value={f.plan} onChange={e=>setF({...f,plan:e.target.value})}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                {["free","trial","starter","pro","enterprise"].map(p=><option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Billing Email</label>
              <input type="email" value={f.billing_email} onChange={e=>setF({...f,billing_email:e.target.value})}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"/>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-4">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-3">First Admin User</p>
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Username" value={f.admin_username} onChange={e=>setF({...f,admin_username:e.target.value})}
                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"/>
              <input type="email" placeholder="Email" value={f.admin_email} onChange={e=>setF({...f,admin_email:e.target.value})}
                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"/>
              <input type="password" placeholder="Password" value={f.admin_password} onChange={e=>setF({...f,admin_password:e.target.value})}
                className="col-span-2 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"/>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-5 py-2 rounded-lg text-sm">
              {saving?"Creating…":"Create Organization"}
            </button>
            <button type="button" onClick={onClose}
              className="bg-gray-800 border border-gray-700 text-gray-300 px-5 py-2 rounded-lg text-sm hover:bg-gray-700">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Org Detail Drawer ──────────────────────────────────────────
function OrgDrawer({ org, onClose, onRefresh }: { org:any; onClose:()=>void; onRefresh:()=>void }) {
  const router  = useRouter();
  const [detail, setDetail] = useState<any>(null);
  const [tab, setTab]       = useState<"overview"|"users"|"activity">("overview");

  useEffect(() => {
    platformApi.get(`/platform/organizations/${org.id}`).then(r=>setDetail(r.data));
  },[org.id]);

  const suspend = async () => {
    const r = prompt(`Reason for suspending "${org.name}":`);
    if (!r) return;
    await platformApi.post(`/platform/organizations/${org.id}/suspend`,{reason:r});
    onRefresh(); onClose();
  };
  const reactivate = async () => {
    await platformApi.post(`/platform/organizations/${org.id}/reactivate`);
    onRefresh(); onClose();
  };
  const impersonate = async () => {
    const r = prompt(`Reason for impersonating "${org.name}" admin:`);
    if (!r) return;
    try {
      const res = await platformApi.post("/platform/impersonate",{organization_id:org.id,reason:r});
      localStorage.setItem("pre_impersonation_token", localStorage.getItem("platform_token")||"");
      localStorage.setItem("token", res.data.access_token);
      localStorage.setItem("impersonating_org", org.name);
      router.push("/dashboard");
    } catch (e:any) { alert(e.response?.data?.detail||"Failed"); }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/50" onClick={onClose}/>
      <div className="w-full max-w-xl bg-gray-950 border-l border-gray-800 h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-white">{org.name}</h2>
              <p className="text-gray-500 text-sm">{org.billing_email||"No billing email"}</p>
            </div>
            <button onClick={onClose}><FiX className="w-5 h-5 text-gray-400"/></button>
          </div>
          <div className="flex gap-2 mb-4">
            <Pill t={org.plan} map={PLAN_CLS}/>
            <Pill t={org.status} map={STATUS_CLS}/>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-4">
            {[{l:"Users",v:org.user_count,c:"text-blue-400"},{l:"Agents",v:org.agent_count,c:"text-purple-400"},
              {l:"Assets",v:org.asset_count,c:"text-teal-400"},{l:"Incidents",v:org.open_incidents,c:org.open_incidents>0?"text-red-400":"text-gray-500"}].map(s=>(
              <div key={s.l} className="bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-center">
                <p className={`text-base font-bold ${s.c}`}>{s.v}</p>
                <p className="text-xs text-gray-500">{s.l}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={impersonate}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-900/40 border border-indigo-700 text-indigo-300 rounded-lg text-xs font-medium hover:bg-indigo-900/60">
              <FiKey className="w-3.5 h-3.5"/> Impersonate
            </button>
            {org.status==="active"
              ? <button onClick={suspend}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-900/30 border border-orange-700 text-orange-300 rounded-lg text-xs hover:bg-orange-900/50">
                  <FiPause className="w-3.5 h-3.5"/> Suspend
                </button>
              : <button onClick={reactivate}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-900/30 border border-green-700 text-green-300 rounded-lg text-xs hover:bg-green-900/50">
                  <FiPlay className="w-3.5 h-3.5"/> Reactivate
                </button>
            }
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 flex-shrink-0">
          {(["overview","users","activity"] as const).map(t=>(
            <button key={t} onClick={()=>setTab(t)}
              className={`px-5 py-3 text-sm font-medium capitalize transition-colors ${
                tab===t?"border-b-2 border-indigo-500 text-indigo-400":"text-gray-500 hover:text-white"
              }`}>{t}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!detail ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/></div>
          ) : (
            <>
              {tab==="overview" && (
                <div className="space-y-3 text-sm">
                  {[
                    {l:"ID",     v:detail.id,        mono:true},
                    {l:"Name",   v:detail.name},
                    {l:"Plan",   v:detail.plan},
                    {l:"Status", v:detail.status},
                    {l:"Max Users",  v:detail.max_users},
                    {l:"Max Agents", v:detail.max_agents},
                    {l:"Max Assets", v:detail.max_assets},
                    {l:"Created", v:fmt(detail.created_at)},
                  ].map(r=>(
                    <div key={r.l} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                      <span className="text-gray-500">{r.l}</span>
                      <span className={`text-white ${r.mono?"font-mono text-xs":""}`}>{String(r.v)}</span>
                    </div>
                  ))}
                </div>
              )}
              {tab==="users" && (
                <div className="space-y-2">
                  {(detail.users||[]).map((u:any)=>(
                    <div key={u.id} className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                      <div>
                        <p className="text-white text-sm font-medium">{u.username}</p>
                        <p className="text-gray-500 text-xs">{u.email}</p>
                      </div>
                      <span className="text-xs text-gray-400 capitalize">{u.role}</span>
                    </div>
                  ))}
                </div>
              )}
              {tab==="activity" && (
                <div className="space-y-2">
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-blue-400">{detail.stats?.events||0}</p>
                    <p className="text-gray-500 text-sm">Runtime Events</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                    <p className="text-3xl font-bold text-orange-400">{detail.stats?.open_incidents||0}</p>
                    <p className="text-gray-500 text-sm">Open Incidents</p>
                  </div>
                  <p className="text-xs text-gray-600 text-center mt-2">
                    Use Impersonate to view detailed activity within this organization.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
const Organizations: React.FC = () => {
  const [orgs, setOrgs]       = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState("");
  const [statusF, setStatusF] = useState("");
  const [creating, setCreating] = useState(false);
  const [drawer, setDrawer]   = useState<any>(null);

  useEffect(() => { load(); },[]);

  const load = async () => {
    setLoading(true);
    try { const r = await platformApi.get("/platform/organizations"); setOrgs(r.data); }
    finally { setLoading(false); }
  };

  const del = async (org: any) => {
    if (!confirm(`PERMANENTLY DELETE "${org.name}"?`)) return;
    await platformApi.delete(`/platform/organizations/${org.id}`);
    setOrgs(o=>o.filter(x=>x.id!==org.id));
  };

  const filtered = orgs.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) &&
    (!statusF || o.status===statusF)
  );

  return (
    <>
      <Head><title>Organizations — AI-SecOS Platform</title></Head>
      <PlatformShell>
        {creating && <CreateModal onClose={()=>setCreating(false)} onDone={()=>{setCreating(false);load();}}/>}
        {drawer && <OrgDrawer org={drawer} onClose={()=>setDrawer(null)} onRefresh={load}/>}

        <div className="p-6 max-w-screen-xl mx-auto">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-xl font-bold text-white">Organizations</h1>
              <p className="text-gray-500 text-sm mt-0.5">{orgs.length} customer tenants</p>
            </div>
            <div className="flex gap-2">
              <button onClick={load} className="p-2.5 bg-gray-900 border border-gray-800 text-gray-400 hover:text-white rounded-xl">
                <FiRefreshCw className="w-4 h-4"/>
              </button>
              <button onClick={()=>setCreating(true)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm">
                <FiPlusCircle className="w-4 h-4"/> New Organization
              </button>
            </div>
          </div>

          <div className="flex gap-3 mb-4">
            <div className="flex-1 flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5">
              <FiSearch className="w-4 h-4 text-gray-500"/>
              <input placeholder="Search organizations…" value={search} onChange={e=>setSearch(e.target.value)}
                className="flex-1 bg-transparent text-white text-sm placeholder-gray-600 outline-none"/>
            </div>
            <select value={statusF} onChange={e=>setStatusF(e.target.value)}
              className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none">
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="trial">Trial</option>
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/40 border-b border-gray-800">
                  <tr>
                    {["Organization","Plan","Status","Users","Agents","Incidents","Created",""].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {filtered.length===0 ? (
                    <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-600">No organizations found.</td></tr>
                  ) : filtered.map(org=>(
                    <tr key={org.id} onClick={()=>setDrawer(org)}
                      className="hover:bg-gray-800/30 cursor-pointer transition-colors">
                      <td className="px-4 py-3">
                        <p className="text-white font-medium">{org.name}</p>
                        <p className="text-gray-600 text-xs">{org.billing_email||"—"}</p>
                      </td>
                      <td className="px-4 py-3"><Pill t={org.plan} map={PLAN_CLS}/></td>
                      <td className="px-4 py-3"><Pill t={org.status} map={STATUS_CLS}/></td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{org.user_count}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{org.agent_count}</td>
                      <td className="px-4 py-3">
                        {org.open_incidents>0
                          ? <span className="text-red-400 font-bold text-xs">{org.open_incidents}</span>
                          : <span className="text-gray-600 text-xs">0</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{fmt(org.created_at)}</td>
                      <td className="px-4 py-3" onClick={e=>e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button onClick={()=>setDrawer(org)}
                            className="p-1.5 text-gray-500 hover:text-blue-400 hover:bg-gray-800 rounded"><FiEye className="w-3.5 h-3.5"/></button>
                          <button onClick={async()=>{
                            const r=prompt(`Impersonate ${org.name}:`);if(!r)return;
                            try{const res=await platformApi.post("/platform/impersonate",{organization_id:org.id,reason:r});
                            localStorage.setItem("pre_impersonation_token",localStorage.getItem("platform_token")||"");
                            localStorage.setItem("token",res.data.access_token);
                            localStorage.setItem("impersonating_org",org.name);
                            window.location.href="/dashboard";}catch(e:any){alert(e.response?.data?.detail||"Failed");}
                          }} className="p-1.5 text-gray-500 hover:text-yellow-400 hover:bg-gray-800 rounded"><FiKey className="w-3.5 h-3.5"/></button>
                          <button onClick={async()=>{
                            if(org.status==="active"){const r=prompt("Suspend reason:");if(!r)return;
                            await platformApi.post(`/platform/organizations/${org.id}/suspend`,{reason:r});}
                            else{await platformApi.post(`/platform/organizations/${org.id}/reactivate`);}
                            load();
                          }} className={`p-1.5 rounded hover:bg-gray-800 ${org.status==="active"?"text-gray-500 hover:text-orange-400":"text-gray-500 hover:text-green-400"}`}>
                            {org.status==="active"?<FiPause className="w-3.5 h-3.5"/>:<FiPlay className="w-3.5 h-3.5"/>}
                          </button>
                          <button onClick={()=>del(org)}
                            className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded"><FiTrash2 className="w-3.5 h-3.5"/></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t border-gray-800 text-xs text-gray-600">
                {filtered.length} of {orgs.length} organizations
              </div>
            </div>
          )}
        </div>
      </PlatformShell>
    </>
  );
};

export default Organizations;
