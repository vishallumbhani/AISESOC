import React, { useState, useEffect } from "react";
import Head from "next/head";
import PlatformShell from "../../components/PlatformShell";
import platformApi from "../../lib/platformApi";
import { hasPlatformToken, clearPlatformSession, startImpersonation, getImpersonatingOrg } from "../../lib/tokens";
import { FiDollarSign, FiRefreshCw, FiDownload, FiCheckCircle } from "react-icons/fi";

interface OrgBilling {
  id: string;
  name: string;
  plan: string;
  status: string;
  billing_email: string;
  user_count: number;
  agent_count: number;
}

const PLAN_PRICES: Record<string, number> = {
  free: 0, trial: 0, starter: 299, pro: 899, enterprise: 2499,
};

const PLAN_CLS: Record<string, string> = {
  enterprise: "text-purple-300 bg-purple-900/30 border-purple-700",
  pro:        "text-blue-300 bg-blue-900/30 border-blue-700",
  starter:    "text-teal-300 bg-teal-900/30 border-teal-700",
  trial:      "text-yellow-300 bg-yellow-900/20 border-yellow-700",
  free:       "text-gray-400 bg-gray-800 border-gray-600",
};

// Deterministic fake invoices based on org data
function generateInvoices(orgs: OrgBilling[]) {
  return orgs
    .filter(o => PLAN_PRICES[o.plan] > 0)
    .flatMap(org => {
      const price = PLAN_PRICES[org.plan];
      return [0, 1, 2].map(i => {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        return {
          id:     `INV-${org.id.slice(0,6).toUpperCase()}-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}`,
          org:    org.name,
          org_id: org.id,
          plan:   org.plan,
          amount: price,
          status: i === 0 ? "pending" : "paid",
          date:   d.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }),
          due:    new Date(d.getFullYear(), d.getMonth()+1, 1).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }),
        };
      });
    })
    .sort((a, b) => (a.status === "pending" ? -1 : 1));
}

const Billing: React.FC = () => {
  const [orgs, setOrgs]         = useState<OrgBilling[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [tab, setTab]           = useState<"overview" | "invoices" | "subscriptions">("overview");
  const [search, setSearch]     = useState("");

  useEffect(() => {
    platformApi.get("/platform/organizations")
      .then(r => setOrgs(r.data))
      .catch(() => setError("Failed to load organization billing data"))
      .finally(() => setLoading(false));
  }, []);

  const invoices = generateInvoices(orgs);
  const totalMRR = orgs.reduce((s, o) => s + (PLAN_PRICES[o.plan] || 0), 0);
  const paidOrgs  = orgs.filter(o => PLAN_PRICES[o.plan] > 0).length;
  const pending   = invoices.filter(i => i.status === "pending").length;
  const totalARR  = totalMRR * 12;

  const filteredInvoices = invoices.filter(i =>
    i.org.toLowerCase().includes(search.toLowerCase()) ||
    i.id.toLowerCase().includes(search.toLowerCase())
  );

  const TABS = [
    { id: "overview",       label: "Overview" },
    { id: "invoices",       label: `Invoices (${invoices.length})` },
    { id: "subscriptions",  label: `Subscriptions (${orgs.length})` },
  ] as const;

  return (
    <>
      <Head><title>Billing — AI-SecOS Platform</title></Head>
      <PlatformShell>
        <div className="p-6 max-w-screen-xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-white">Billing & Revenue</h1>
              <p className="text-gray-500 text-sm mt-0.5">Subscription management and invoice tracking</p>
            </div>
            <button onClick={() => { setLoading(true); platformApi.get("/platform/organizations").then(r => setOrgs(r.data)).finally(() => setLoading(false)); }}
              className="p-2.5 bg-gray-900 border border-gray-800 text-gray-400 hover:text-white rounded-xl">
              <FiRefreshCw className="w-4 h-4" />
            </button>
          </div>

          {error && <div className="mb-4 bg-red-900/30 border border-red-700 text-red-300 rounded-xl px-4 py-3 text-sm">{error}</div>}

          {loading ? (
            <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                  { label: "Monthly Recurring Revenue", value: `$${totalMRR.toLocaleString()}`, sub: "MRR", color: "text-green-400", bg: "bg-green-900/20 border-green-800" },
                  { label: "Annual Recurring Revenue",  value: `$${totalARR.toLocaleString()}`, sub: "ARR", color: "text-blue-400",  bg: "bg-blue-900/20 border-blue-800" },
                  { label: "Paying Organizations",      value: paidOrgs,  sub: `of ${orgs.length} total`,        color: "text-purple-400", bg: "bg-purple-900/20 border-purple-800" },
                  { label: "Pending Invoices",          value: pending,   sub: "awaiting payment",               color: pending > 0 ? "text-orange-400" : "text-gray-400", bg: "bg-gray-900 border-gray-800" },
                ].map(c => (
                  <div key={c.label} className={`border rounded-xl p-5 ${c.bg}`}>
                    <p className="text-xs text-gray-500 mb-2">{c.label}</p>
                    <p className={`text-2xl font-bold ${c.color}`}>{typeof c.value === "number" ? c.value.toLocaleString() : c.value}</p>
                    <p className="text-xs text-gray-600 mt-0.5">{c.sub}</p>
                  </div>
                ))}
              </div>

              {/* Tabs */}
              <div className="flex border-b border-gray-800 mb-5">
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id as any)}
                    className={`px-5 py-3 text-sm font-medium transition-colors ${tab === t.id ? "border-b-2 border-indigo-500 text-indigo-400" : "text-gray-500 hover:text-white"}`}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Overview */}
              {tab === "overview" && (
                <div className="grid grid-cols-5 gap-4">
                  {Object.entries(PLAN_PRICES).map(([plan, price]) => {
                    const count = orgs.filter(o => o.plan === plan).length;
                    return (
                      <div key={plan} className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                        <p className="font-bold text-white capitalize mb-1">{plan}</p>
                        <p className="text-2xl font-bold text-indigo-400">{count}</p>
                        <p className="text-xs text-gray-500 mb-2">organizations</p>
                        <p className="text-sm font-semibold text-green-400">{price > 0 ? `$${price}/mo` : "Free"}</p>
                        <p className="text-xs text-gray-600 mt-1">${(price * count).toLocaleString()}/mo total</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Invoices */}
              {tab === "invoices" && (
                <>
                  <div className="flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-2.5 mb-4">
                    <input placeholder="Search invoices…" value={search} onChange={e => setSearch(e.target.value)}
                      className="flex-1 bg-transparent text-white text-sm placeholder-gray-600 outline-none" />
                  </div>
                  {filteredInvoices.length === 0 ? (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
                      <FiDollarSign className="w-10 h-10 text-gray-700 mx-auto mb-3" />
                      <p className="text-gray-500">No invoices found.</p>
                      <p className="text-gray-600 text-sm mt-1">Invoices are generated for paid plans (Starter, Pro, Enterprise).</p>
                    </div>
                  ) : (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-800/40 border-b border-gray-800">
                          <tr>{["Invoice","Organization","Plan","Amount","Status","Date","Due",""].map(h => (
                            <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                          ))}</tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                          {filteredInvoices.map(inv => (
                            <tr key={inv.id} className="hover:bg-gray-800/30">
                              <td className="px-4 py-3 font-mono text-xs text-indigo-400">{inv.id}</td>
                              <td className="px-4 py-3 text-white font-medium">{inv.org}</td>
                              <td className="px-4 py-3">
                                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${PLAN_CLS[inv.plan] || ""}`}>{inv.plan}</span>
                              </td>
                              <td className="px-4 py-3 text-green-400 font-semibold">${inv.amount.toLocaleString()}</td>
                              <td className="px-4 py-3">
                                <span className={`flex items-center gap-1 text-xs font-semibold ${inv.status === "paid" ? "text-green-400" : "text-orange-400"}`}>
                                  {inv.status === "paid" && <FiCheckCircle className="w-3 h-3" />}
                                  {inv.status.toUpperCase()}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-gray-400 text-xs">{inv.date}</td>
                              <td className="px-4 py-3 text-gray-400 text-xs">{inv.due}</td>
                              <td className="px-4 py-3">
                                <button className="p-1.5 text-gray-500 hover:text-indigo-400 hover:bg-gray-800 rounded" title="Download">
                                  <FiDownload className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}

              {/* Subscriptions */}
              {tab === "subscriptions" && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-800/40 border-b border-gray-800">
                      <tr>{["Organization","Plan","Monthly","Status","Users","Agents","Billing Email"].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {orgs.length === 0 ? (
                        <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-600">No organizations found.</td></tr>
                      ) : orgs.map(org => (
                        <tr key={org.id} className="hover:bg-gray-800/30">
                          <td className="px-4 py-3 font-medium text-white">{org.name}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${PLAN_CLS[org.plan] || ""}`}>{org.plan}</span>
                          </td>
                          <td className="px-4 py-3 text-green-400 font-semibold">
                            {PLAN_PRICES[org.plan] > 0 ? `$${PLAN_PRICES[org.plan].toLocaleString()}` : "Free"}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold ${org.status === "active" ? "text-green-400" : "text-red-400"}`}>
                              {org.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{org.user_count}</td>
                          <td className="px-4 py-3 text-gray-400 text-xs">{org.agent_count}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{org.billing_email || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </PlatformShell>
    </>
  );
};

export default Billing;
