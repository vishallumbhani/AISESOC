import React, { useState, useEffect } from "react";
import Head from "next/head";
import PlatformShell from "../../components/PlatformShell";
import platformApi from "../../lib/platformApi";
import { hasPlatformToken, clearPlatformSession, startImpersonation, getImpersonatingOrg } from "../../lib/tokens";
import { FiEdit2, FiSave, FiX } from "react-icons/fi";

const PLANS: Record<string,any> = {
  free:       { max_users:3,   max_agents:5,   max_assets:10,  max_policies:5,   price:"$0/mo",   support:"Community" },
  trial:      { max_users:10,  max_agents:20,  max_assets:50,  max_policies:20,  price:"$0/mo",   support:"Email" },
  starter:    { max_users:25,  max_agents:50,  max_assets:100, max_policies:50,  price:"$299/mo", support:"Email" },
  pro:        { max_users:100, max_agents:200, max_assets:500, max_policies:200, price:"$899/mo", support:"Priority" },
  enterprise: { max_users:999, max_agents:999, max_assets:999, max_policies:999, price:"Custom",  support:"SLA 99.9%" },
};

const Licensing: React.FC = () => {
  const [orgs, setOrgs]     = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string|null>(null);
  const [form, setForm]       = useState<any>({});
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    platformApi.get("/platform/organizations").then(r=>setOrgs(r.data)).finally(()=>setLoading(false));
  },[]);

  const save = async (id: string) => {
    setSaving(true);
    await platformApi.patch(`/platform/organizations/${id}`, form);
    setOrgs(o=>o.map(x=>x.id===id?{...x,...form}:x));
    setEditing(null);
    setSaving(false);
  };

  return (
    <>
      <Head><title>Licensing — AI-SecOS Platform</title></Head>
      <PlatformShell>
        <div className="p-6 max-w-screen-xl mx-auto">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-white">Licensing & Plans</h1>
            <p className="text-gray-500 text-sm mt-0.5">Manage subscription plans and resource limits</p>
          </div>

          {/* Plan tiers */}
          <div className="grid grid-cols-5 gap-3 mb-6">
            {Object.entries(PLANS).map(([name, p]) => (
              <div key={name} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="font-bold text-white capitalize text-sm mb-1">{name}</p>
                <p className="text-indigo-400 text-xs font-semibold mb-3">{p.price}</p>
                <div className="space-y-1.5 text-xs">
                  {[["Users",p.max_users],["Agents",p.max_agents],["Assets",p.max_assets],["Support",p.support]].map(([k,v])=>(
                    <div key={k} className="flex justify-between">
                      <span className="text-gray-500">{k}</span>
                      <span className={`text-white font-medium ${v===999?"text-indigo-400":""}`}>{v===999?"Unlimited":v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Org licenses */}
          {loading ? (
            <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/></div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-800/40 border-b border-gray-800">
                  <tr>
                    {["Organization","Plan","Users","Agents","Assets","Policies","Status",""].map(h=>(
                      <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {orgs.map(org=>(
                    <tr key={org.id} className="hover:bg-gray-800/20">
                      <td className="px-4 py-3 font-medium text-white">{org.name}</td>
                      <td className="px-4 py-3">
                        {editing===org.id ? (
                          <select value={form.plan||org.plan} onChange={e=>{const p=e.target.value;setForm({...form,plan:p,...PLANS[p]});}}
                            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs">
                            {Object.keys(PLANS).map(p=><option key={p}>{p}</option>)}
                          </select>
                        ) : <span className="capitalize text-gray-300">{org.plan}</span>}
                      </td>
                      {["max_users","max_agents","max_assets","max_policies"].map(f=>(
                        <td key={f} className="px-4 py-3">
                          {editing===org.id ? (
                            <input type="number" value={form[f]??org[f]??0} onChange={e=>setForm({...form,[f]:+e.target.value})}
                              className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-xs"/>
                          ) : <span className="text-gray-400 text-xs font-mono">{org[f]??"—"}</span>}
                        </td>
                      ))}
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${org.status==="active"?"bg-green-900/40 text-green-300":"bg-red-900/40 text-red-300"}`}>{org.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        {editing===org.id ? (
                          <div className="flex gap-1">
                            <button onClick={()=>save(org.id)} disabled={saving} className="p-1.5 text-green-400 hover:bg-gray-700 rounded"><FiSave className="w-3.5 h-3.5"/></button>
                            <button onClick={()=>setEditing(null)} className="p-1.5 text-gray-400 hover:bg-gray-700 rounded"><FiX className="w-3.5 h-3.5"/></button>
                          </div>
                        ) : (
                          <button onClick={()=>{setEditing(org.id);setForm({plan:org.plan,max_users:org.max_users,max_agents:org.max_agents,max_assets:org.max_assets,max_policies:org.max_policies||50});}}
                            className="p-1.5 text-gray-500 hover:text-indigo-400 hover:bg-gray-700 rounded"><FiEdit2 className="w-3.5 h-3.5"/></button>
                        )}
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
export default Licensing;
