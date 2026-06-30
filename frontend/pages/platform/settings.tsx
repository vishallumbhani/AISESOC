import React, { useState, useEffect } from "react";
import Head from "next/head";
import PlatformShell from "../../components/PlatformShell";
import platformApi from "../../lib/platformApi";
import { hasPlatformToken, clearPlatformSession, startImpersonation, getImpersonatingOrg } from "../../lib/tokens";
import {
  FiShield, FiPlus, FiX, FiSave, FiCheckCircle,
  FiAlertCircle, FiToggleLeft, FiToggleRight, FiRefreshCw,
} from "react-icons/fi";

interface PlatformAdmin { id: string; username: string; email: string; is_active: boolean; last_login_at?: string; created_at: string; }

const fmtTs = (d?: string) => d
  ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  : "Never";

// ── Feature Flags ─────────────────────────────────────────────
const DEFAULT_FLAGS = [
  { key: "multi_tenant_mode",      label: "Multi-Tenant Mode",         desc: "Enable org isolation and tenant management",       default: true },
  { key: "marketplace_enabled",    label: "Marketplace",               desc: "Allow orgs to install integrations",               default: true },
  { key: "threat_intel_enabled",   label: "Threat Intelligence",       desc: "Share MITRE/OWASP feeds across all orgs",          default: true },
  { key: "compliance_reports",     label: "Compliance Reporting",      desc: "SOC2, ISO27001, NIST AI RMF, OWASP LLM reports",  default: true },
  { key: "impersonation_allowed",  label: "Admin Impersonation",       desc: "Platform admins can impersonate org admins",       default: true },
  { key: "api_gateway_enabled",    label: "API Gateway",               desc: "Enforce rate limits on API key usage",             default: true },
  { key: "agent_autodiscovery",    label: "Agent Auto-Discovery",      desc: "Sync agents from connected platforms",             default: true },
  { key: "maintenance_mode",       label: "Maintenance Mode",          desc: "Block all org logins (platform access only)",      default: false },
];

const PlatformSettings: React.FC = () => {
  const [tab, setTab]             = useState<"admins" | "flags" | "smtp" | "sso">("admins");
  const [admins, setAdmins]       = useState<PlatformAdmin[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [success, setSuccess]     = useState<string | null>(null);
  const [creating, setCreating]   = useState(false);
  const [saving, setSaving]       = useState(false);
  const [flags, setFlags]         = useState<Record<string, boolean>>({});
  const [form, setForm]           = useState({ username: "", email: "", password: "" });
  const [smtpForm, setSmtpForm]   = useState({ host: "", port: "587", user: "", password: "", from_email: "", tls: true });
  const [ssoForm, setSsoForm]     = useState({ provider: "none", client_id: "", client_secret: "", issuer_url: "", redirect_uri: "" });

  useEffect(() => {
    // Init feature flags from localStorage (in production, comes from backend)
    const saved = localStorage.getItem("platform_feature_flags");
    if (saved) {
      try { setFlags(JSON.parse(saved)); } catch {}
    } else {
      const defaults: Record<string, boolean> = {};
      DEFAULT_FLAGS.forEach(f => { defaults[f.key] = f.default; });
      setFlags(defaults);
    }
    loadAdmins();
  }, []);

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const r = await platformApi.get("/platform/admins");
      setAdmins(r.data);
    } catch {
      setError("Could not load platform admins.");
    } finally { setLoading(false); }
  };

  const createAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setError(null);
    try {
      await platformApi.post("/platform/admins", form);
      setSuccess(`Platform admin "${form.username}" created.`);
      setForm({ username: "", email: "", password: "" });
      setCreating(false);
      await loadAdmins();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create admin");
    } finally { setSaving(false); }
  };

  const toggleFlag = (key: string) => {
    const next = { ...flags, [key]: !flags[key] };
    setFlags(next);
    localStorage.setItem("platform_feature_flags", JSON.stringify(next));
    setSuccess(`Feature "${key}" ${next[key] ? "enabled" : "disabled"}`);
    setTimeout(() => setSuccess(null), 2000);
  };

  const saveSmtp = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess("SMTP configuration saved (UI only — connect backend to persist).");
    setTimeout(() => setSuccess(null), 3000);
  };

  const saveSso = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccess("SSO configuration saved (UI only — connect backend to persist).");
    setTimeout(() => setSuccess(null), 3000);
  };

  const TABS = [
    { id: "admins", label: "Platform Admins" },
    { id: "flags",  label: "Feature Flags" },
    { id: "smtp",   label: "SMTP / Email" },
    { id: "sso",    label: "SSO / OAuth" },
  ] as const;

  return (
    <>
      <Head><title>Settings — AI-SecOS Platform</title></Head>
      <PlatformShell>
        <div className="p-6 max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-xl font-bold text-white">Platform Settings</h1>
            <p className="text-gray-500 text-sm mt-0.5">Manage platform admins, feature flags, SMTP, and SSO</p>
          </div>

          {error && (
            <div className="mb-4 bg-red-900/30 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm flex items-start gap-2">
              <FiAlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{error}
              <button onClick={() => setError(null)} className="ml-auto"><FiX className="w-4 h-4" /></button>
            </div>
          )}
          {success && (
            <div className="mb-4 bg-green-900/30 border border-green-700 text-green-300 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
              <FiCheckCircle className="w-4 h-4" />{success}
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-gray-800 mb-6">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-5 py-3 text-sm font-medium transition-colors ${tab === t.id ? "border-b-2 border-indigo-500 text-indigo-400" : "text-gray-500 hover:text-white"}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* ── Platform Admins ── */}
          {tab === "admins" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-white flex items-center gap-2">
                    <FiShield className="w-4 h-4 text-indigo-400" /> Platform Administrators
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">AI-SecOS internal staff only. Not visible to customers.</p>
                </div>
                <button onClick={() => setCreating(!creating)}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-4 py-2 rounded-xl text-sm">
                  {creating ? <><FiX className="w-3.5 h-3.5" /> Cancel</> : <><FiPlus className="w-3.5 h-3.5" /> Add Admin</>}
                </button>
              </div>

              {creating && (
                <form onSubmit={createAdmin} className="bg-gray-900 border border-indigo-700 rounded-xl p-5 space-y-3">
                  <h3 className="font-semibold text-white text-sm">New Platform Admin</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Username *</label>
                      <input required value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Email *</label>
                      <input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Password *</label>
                      <input required type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" disabled={saving}
                      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold px-4 py-2 rounded-lg text-sm">
                      {saving ? "Creating…" : "Create Platform Admin"}
                    </button>
                    <button type="button" onClick={() => setCreating(false)}
                      className="bg-gray-800 border border-gray-700 text-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-700">Cancel</button>
                  </div>
                </form>
              )}

              {loading ? (
                <div className="flex justify-center py-10">
                  <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : admins.length === 0 ? (
                <div className="bg-gray-900 border border-dashed border-gray-700 rounded-xl p-8 text-center">
                  <FiShield className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                  <p className="text-gray-500">No platform admins listed.</p>
                  <p className="text-gray-600 text-sm mt-1">The superadmin account may have been created via CLI.</p>
                </div>
              ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-800/40 border-b border-gray-800">
                      <tr>{["Username", "Email", "Status", "Last Login", "Created"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {admins.map(a => (
                        <tr key={a.id} className="hover:bg-gray-800/30">
                          <td className="px-4 py-3 font-medium text-white">{a.username}</td>
                          <td className="px-4 py-3 text-gray-400 text-sm">{a.email}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold ${a.is_active ? "text-green-400" : "text-red-400"}`}>
                              {a.is_active ? "Active" : "Disabled"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{fmtTs(a.last_login_at)}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{fmtTs(a.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="px-4 py-3 border-t border-gray-800 flex justify-end">
                    <button onClick={loadAdmins}
                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-white">
                      <FiRefreshCw className="w-3 h-3" /> Refresh
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Feature Flags ── */}
          {tab === "flags" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-400 mb-4">
                Toggle platform-wide features. Changes take effect immediately for all organizations.
              </p>
              {DEFAULT_FLAGS.map(flag => (
                <div key={flag.key} className={`flex items-center justify-between bg-gray-900 border rounded-xl px-5 py-4 transition-colors ${
                  flags[flag.key] ? "border-gray-700" : "border-gray-800 opacity-70"
                }`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white text-sm">{flag.label}</p>
                      {flag.key === "maintenance_mode" && flags[flag.key] && (
                        <span className="text-xs text-red-300 bg-red-900/40 border border-red-700 px-2 py-0.5 rounded-full font-semibold">
                          ⚠ Active — org logins blocked
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{flag.desc}</p>
                    <p className="text-xs text-gray-700 font-mono mt-0.5">{flag.key}</p>
                  </div>
                  <button onClick={() => toggleFlag(flag.key)}
                    className={`flex-shrink-0 ml-4 transition-colors ${flags[flag.key] ? "text-indigo-400 hover:text-indigo-300" : "text-gray-600 hover:text-gray-400"}`}>
                    {flags[flag.key]
                      ? <FiToggleRight className="w-8 h-8" />
                      : <FiToggleLeft className="w-8 h-8" />}
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── SMTP ── */}
          {tab === "smtp" && (
            <form onSubmit={saveSmtp} className="space-y-4">
              <p className="text-sm text-gray-400">Configure outbound email for alerts, reports, and notifications.</p>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">SMTP Host</label>
                    <input value={smtpForm.host} onChange={e => setSmtpForm({ ...smtpForm, host: e.target.value })}
                      placeholder="smtp.sendgrid.net"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Port</label>
                    <input value={smtpForm.port} onChange={e => setSmtpForm({ ...smtpForm, port: e.target.value })}
                      placeholder="587"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">SMTP Username</label>
                    <input value={smtpForm.user} onChange={e => setSmtpForm({ ...smtpForm, user: e.target.value })}
                      placeholder="apikey"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">SMTP Password</label>
                    <input type="password" value={smtpForm.password} onChange={e => setSmtpForm({ ...smtpForm, password: e.target.value })}
                      placeholder="••••••••"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">From Email</label>
                    <input type="email" value={smtpForm.from_email} onChange={e => setSmtpForm({ ...smtpForm, from_email: e.target.value })}
                      placeholder="alerts@ai-secos.com"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div className="flex items-center gap-3 pt-5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={smtpForm.tls} onChange={e => setSmtpForm({ ...smtpForm, tls: e.target.checked })}
                        className="rounded border-gray-600 bg-gray-800 text-indigo-500" />
                      <span className="text-sm text-gray-300">Enable TLS</span>
                    </label>
                  </div>
                </div>
              </div>
              <button type="submit"
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm">
                <FiSave className="w-4 h-4" /> Save SMTP Configuration
              </button>
            </form>
          )}

          {/* ── SSO ── */}
          {tab === "sso" && (
            <form onSubmit={saveSso} className="space-y-4">
              <p className="text-sm text-gray-400">Configure Single Sign-On for platform admin access.</p>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">SSO Provider</label>
                  <select value={ssoForm.provider} onChange={e => setSsoForm({ ...ssoForm, provider: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                    <option value="none">None (disabled)</option>
                    <option value="google">Google Workspace</option>
                    <option value="azure">Azure AD / Entra ID</option>
                    <option value="okta">Okta</option>
                    <option value="generic_oidc">Generic OIDC</option>
                    <option value="saml">SAML 2.0</option>
                  </select>
                </div>
                {ssoForm.provider !== "none" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Client ID</label>
                      <input value={ssoForm.client_id} onChange={e => setSsoForm({ ...ssoForm, client_id: e.target.value })}
                        placeholder="your-client-id"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Client Secret</label>
                      <input type="password" value={ssoForm.client_secret} onChange={e => setSsoForm({ ...ssoForm, client_secret: e.target.value })}
                        placeholder="••••••••"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Issuer / Discovery URL</label>
                      <input value={ssoForm.issuer_url} onChange={e => setSsoForm({ ...ssoForm, issuer_url: e.target.value })}
                        placeholder="https://accounts.google.com"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Redirect URI</label>
                      <input value={ssoForm.redirect_uri} onChange={e => setSsoForm({ ...ssoForm, redirect_uri: e.target.value })}
                        placeholder="https://your-domain/auth/callback"
                        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
                    </div>
                  </div>
                )}
              </div>
              <button type="submit"
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm">
                <FiSave className="w-4 h-4" /> Save SSO Configuration
              </button>
            </form>
          )}
        </div>
      </PlatformShell>
    </>
  );
};

export default PlatformSettings;
