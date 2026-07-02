import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import orgApi from "../lib/orgApi";
import { FiSettings, FiUser, FiShield, FiKey, FiSave, FiCheckCircle } from "react-icons/fi";

const Settings: React.FC = () => {
  const router = useRouter();
  const [tab, setTab]       = useState<"general"|"security"|"api">("general");
  const [me, setMe]         = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState(false);
  const [form, setForm]     = useState({ display_name: "", email: "" });

  useEffect(() => {
    if (!localStorage.getItem("token")) { router.push("/login"); return; }
    orgApi.get("/auth/me")
      .then(r => {
        setMe(r.data);
        setForm({ display_name: r.data.user?.display_name || "", email: r.data.user?.email || "" });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await orgApi.patch(`/auth/users/${me?.user?.id}`, form);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch {}
    finally { setSaving(false); }
  };

  const TABS = [
    { id: "general",  label: "General",  icon: <FiUser className="w-4 h-4"/> },
    { id: "security", label: "Security", icon: <FiShield className="w-4 h-4"/> },
    { id: "api",      label: "API Keys", icon: <FiKey className="w-4 h-4"/> },
  ] as const;

  return (
    <>
      <Head><title>Settings — AI-SecOS</title></Head>
      <main className="min-h-screen py-8">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-6">
            <FiSettings className="w-6 h-6 text-blue-600"/>
            <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          </div>

          <div className="flex border-b border-slate-200 mb-6">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
                  tab === t.id ? "border-b-2 border-blue-500 text-blue-600" : "text-slate-400 hover:text-slate-900"
                }`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
            </div>
          ) : (
            <>
              {tab === "general" && (
                <form onSubmit={save} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <h2 className="font-semibold text-slate-900">Profile</h2>
                  {success && (
                    <div className="flex items-center gap-2 text-green-600 text-sm bg-green-900/20 border border-green-800 rounded-lg px-4 py-2">
                      <FiCheckCircle className="w-4 h-4"/> Saved successfully
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Username</label>
                      <input value={me?.user?.username || ""} disabled
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-500 text-sm cursor-not-allowed"/>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Role</label>
                      <input value={me?.user?.role || ""} disabled
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-500 text-sm cursor-not-allowed capitalize"/>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Display Name</label>
                      <input value={form.display_name} onChange={e => setForm({...form, display_name: e.target.value})}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"/>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">Email</label>
                      <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"/>
                    </div>
                  </div>
                  <div className="border-t border-slate-200 pt-4">
                    <p className="text-xs text-slate-400 mb-2">Organization</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Org Name</label>
                        <input value={me?.organization?.name || ""} disabled
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-500 text-sm cursor-not-allowed"/>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-1">Plan</label>
                        <input value={me?.organization?.plan || "free"} disabled
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-500 text-sm cursor-not-allowed capitalize"/>
                      </div>
                    </div>
                  </div>
                  <button type="submit" disabled={saving}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-slate-900 font-semibold px-5 py-2.5 rounded-lg text-sm">
                    <FiSave className="w-4 h-4"/>{saving ? "Saving…" : "Save Changes"}
                  </button>
                </form>
              )}

              {tab === "security" && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <h2 className="font-semibold text-slate-900">Security</h2>
                  <div className="space-y-3 text-sm text-slate-500">
                    <div className="flex justify-between items-center py-3 border-b border-slate-200">
                      <div>
                        <p className="text-slate-900 font-medium">Password</p>
                        <p className="text-xs">Change your account password</p>
                      </div>
                      <button className="text-blue-600 hover:text-blue-500 text-sm">Change →</button>
                    </div>
                    <div className="flex justify-between items-center py-3 border-b border-slate-200">
                      <div>
                        <p className="text-slate-900 font-medium">Multi-Factor Authentication</p>
                        <p className="text-xs">Add an extra layer of security</p>
                      </div>
                      <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">Not enabled</span>
                    </div>
                    <div className="flex justify-between items-center py-3">
                      <div>
                        <p className="text-slate-900 font-medium">Active Sessions</p>
                        <p className="text-xs">Manage where you're logged in</p>
                      </div>
                      <button className="text-red-600 hover:text-red-700 text-sm">Sign out all →</button>
                    </div>
                  </div>
                </div>
              )}

              {tab === "api" && (
                <div className="bg-white border border-slate-200 rounded-xl p-6">
                  <h2 className="font-semibold text-slate-900 mb-1">API Keys</h2>
                  <p className="text-sm text-slate-500 mb-4">
                    Manage your personal API keys for integrations.
                  </p>
                  <a href="/enterprise" className="text-blue-600 hover:text-blue-500 text-sm">
                    Manage API Keys in Enterprise Settings →
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
};

export default Settings;
