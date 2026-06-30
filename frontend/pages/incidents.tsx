import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import LoadingSpinner from "../components/LoadingSpinner";
import Alert from "../components/Alert";
import Badge from "../components/Badge";
import Button from "../components/Button";
import { incidentApi } from "../lib/apiClient";
import { getOrgToken } from "../lib/tokens";
import { Incident, IncidentStatus } from "../lib/types";
import {
  FiAlertTriangle, FiRefreshCw, FiX, FiCheckCircle, FiXCircle,
  FiUser, FiClock, FiShield, FiDatabase, FiList, FiActivity,
  FiSearch, FiChevronDown, FiChevronUp,
} from "react-icons/fi";

// ── Constants ──────────────────────────────────────────────────
const STATUSES: IncidentStatus[] = ["open","investigating","resolved","false_positive","closed"];

const STATUS_STYLE: Record<string,string> = {
  open:           "bg-red-50 text-red-700 border border-red-200",
  investigating:  "bg-orange-50 text-orange-700 border border-orange-200",
  resolved:       "bg-green-50 text-green-700 border border-green-200",
  false_positive: "bg-slate-100 text-slate-500 border border-slate-200",
  closed:         "bg-slate-100 text-slate-500 border border-slate-200",
};

const SEV_COLOR: Record<string,string> = {
  critical: "text-red-600", high: "text-orange-600",
  medium: "text-amber-600", low: "text-green-600",
};

const fmt = (d: string) =>
  new Date(d).toLocaleString("en-US", {
    month:"short", day:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit"
  });

// ── Timeline entry ─────────────────────────────────────────────
function TimelineEntry({ entry, isLast }: { entry: any; isLast: boolean }) {
  const isSystem = entry.actor === "system";
  const isCreated = entry.action?.includes("auto_created");
  return (
    <div className="relative flex gap-3">
      {!isLast && (
        <div className="absolute left-[15px] top-8 bottom-0 w-px bg-gray-700" />
      )}
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
        isCreated ? "bg-red-900/60 border-2 border-red-500" :
        isSystem  ? "bg-white border border-slate-200" :
                    "bg-indigo-900/60 border border-indigo-500"
      }`}>
        {isCreated ? <FiAlertTriangle className="w-3.5 h-3.5 text-red-600" /> :
         isSystem  ? <FiActivity className="w-3.5 h-3.5 text-slate-500" /> :
                     <FiUser className="w-3.5 h-3.5 text-indigo-600" />}
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-sm font-semibold ${isCreated ? "text-red-600" : "text-slate-900"}`}>
            {entry.action?.replace(/_/g," ")}
          </span>
          <span className="text-xs text-slate-400 ml-auto font-mono">{fmt(entry.ts)}</span>
        </div>
        <p className="text-xs text-slate-500">{entry.actor}</p>
        {entry.note && <p className="text-xs text-slate-600 mt-1 italic">"{entry.note}"</p>}
      </div>
    </div>
  );
}

// ── WHO / WHAT card ────────────────────────────────────────────
function InfoRow({ label, value, mono=false }: { label:string; value?:string|null; mono?:boolean }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-200 last:border-0">
      <span className="text-slate-500 text-sm min-w-[120px] flex-shrink-0">{label}</span>
      <span className={`text-slate-900 text-sm break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

// ── Investigation Drawer ───────────────────────────────────────
function InvestigationDrawer({
  incident: init, onClose, onSaved,
}: { incident: Incident; onClose: () => void; onSaved: (i: Incident) => void }) {
  const [incident, setIncident]       = useState<Incident>(init);
  const [investigation, setInvestigation] = useState<any>(null);
  const [auditTrail, setAuditTrail]   = useState<any[]>([]);
  const [invLoading, setInvLoading]   = useState(true);
  const [tab, setTab] = useState<"overview"|"timeline"|"events"|"investigation"|"audit">("overview");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string|null>(null);

  // Form
  const [status, setStatus]     = useState(init.status);
  const [owner, setOwner]       = useState(init.owner || "");
  const [note, setNote]         = useState("");
  const [resNotes, setResNotes] = useState(init.resolution_notes || "");

  useEffect(() => {
    setInvLoading(true);
    // Fetch investigation and audit trail in parallel
    Promise.allSettled([
      incidentApi.getInvestigation(init.id),
      incidentApi.getAuditTrail(init.id),
    ]).then(([invResult, auditResult]) => {
      if (invResult.status === "fulfilled") {
        setInvestigation(invResult.value.data);
      }
      if (auditResult.status === "fulfilled") {
        setAuditTrail(Array.isArray(auditResult.value.data) ? auditResult.value.data : []);
      }
    }).finally(() => setInvLoading(false));
  }, [init.id]);

  const handleSave = async () => {
    setSaving(true); setError(null);
    try {
      const r = await incidentApi.update(incident.id, {
        status, owner: owner || undefined,
        resolution_notes: resNotes || undefined,
        timeline_note: note || undefined,
      });
      const updated = r.data;
      setIncident(updated);
      setNote("");
      onSaved(updated);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to save");
    } finally { setSaving(false); }
  };

  const inv = investigation?.investigation;

  const tabs = [
    { id:"overview",      label:"Overview" },
    { id:"timeline",      label:`Timeline (${(incident.timeline||[]).length})` },
    { id:"events",        label:`Runtime Events (${inv?.what?.events?.length ?? "…"})` },
    { id:"investigation", label:"Investigation" },
    { id:"audit",         label:`Audit Trail (${auditTrail.length})` },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-slate-900/40" onClick={onClose} />
      <div className="w-full max-w-3xl bg-white border-l border-slate-200 h-full overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex-shrink-0">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                incident.severity === "critical" ? "bg-red-900/60" :
                incident.severity === "high"     ? "bg-orange-900/60" : "bg-yellow-900/60"
              }`}>
                <FiAlertTriangle className={`w-5 h-5 ${SEV_COLOR[incident.severity||"high"]}`} />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Incident Investigation</h2>
                <p className="text-slate-500 text-sm">{incident.incident_type?.replace(/_/g," ")}</p>
              </div>
            </div>
            <button onClick={onClose}><FiX className="w-5 h-5 text-slate-500 hover:text-slate-900" /></button>
          </div>

          {/* WHO/WHAT quick strip */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { icon:"🤖", label:"Agent",  value: incident.agent_name || "—" },
              { icon:"🗄", label:"Asset",  value: incident.asset_name || "—" },
              { icon:"👤", label:"User",   value: inv?.who?.end_users?.[0]?.email || inv?.who?.end_users?.[0]?.external || "—" },
              { icon:"📋", label:"Policy", value: inv?.why?.policies_applied?.[0]?.name || "—" },
            ].map(c => (
              <div key={c.label} className="bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2">
                <span>{c.icon}</span>
                <div className="min-w-0">
                  <p className="text-slate-400">{c.label}</p>
                  <p className="text-slate-900 font-medium truncate">{c.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 flex-shrink-0 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                tab === t.id
                  ? "border-b-2 border-indigo-500 text-indigo-600"
                  : "text-slate-500 hover:text-slate-900"
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && <div className="mb-4 bg-red-900/30 border border-red-700 text-red-300 rounded-lg px-4 py-2 text-sm">{error}</div>}

          {/* ── Overview ── */}
          {tab === "overview" && (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide">Update Incident</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Status</label>
                    <select value={status} onChange={e => setStatus(e.target.value as any)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none">
                      {STATUSES.map(s => <option key={s} value={s}>{s.replace("_"," ")}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Owner</label>
                    <input type="text" placeholder="analyst@company.com" value={owner}
                      onChange={e => setOwner(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Resolution Notes</label>
                  <textarea rows={2} value={resNotes} onChange={e => setResNotes(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Add Timeline Note</label>
                  <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
                    placeholder="What did you find? What action was taken?"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none" />
                </div>
                <Button variant="primary" onClick={handleSave} loading={saving} size="sm">Save Changes</Button>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4">
                <h3 className="text-xs text-slate-500 uppercase font-semibold mb-3">Incident Details</h3>
                <InfoRow label="Status"      value={incident.status} />
                <InfoRow label="Severity"    value={incident.severity} />
                <InfoRow label="Type"        value={incident.incident_type?.replace(/_/g," ")} />
                <InfoRow label="Owner"       value={incident.owner} />
                <InfoRow label="Created"     value={fmt(incident.created_at)} />
                <InfoRow label="Resolved"    value={incident.resolved_at ? fmt(incident.resolved_at) : undefined} />
                <InfoRow label="Description" value={incident.description} />
                {incident.resolution_notes && (
                  <InfoRow label="Resolution" value={incident.resolution_notes} />
                )}
              </div>
            </div>
          )}

          {/* ── Timeline ── */}
          {tab === "timeline" && (
            <div>
              {(incident.timeline || []).length === 0
                ? <p className="text-slate-500 text-sm">No timeline entries yet.</p>
                : (
                  <div className="relative">
                    {[...(incident.timeline || [])].reverse().map((entry: any, i: number, arr) => (
                      <TimelineEntry key={i} entry={entry} isLast={i === arr.length - 1} />
                    ))}
                  </div>
                )
              }
            </div>
          )}

          {/* ── Runtime Events ── */}
          {tab === "events" && (
            invLoading ? <LoadingSpinner text="Loading events…" /> :
            (inv?.what?.events || []).length === 0
              ? <p className="text-slate-500 text-sm">No runtime events in the incident window.</p>
              : (
                <div className="space-y-2">
                  <p className="text-xs text-slate-500 mb-3">
                    Events in ±1 hour window around incident creation
                  </p>
                  {(inv?.what?.events || []).map((e: any, i: number) => (
                    <div key={e.id || i} className={`border rounded-lg px-3 py-2.5 text-sm ${
                      e.decision === "deny"
                        ? "bg-red-900/20 border-red-800"
                        : "bg-green-900/10 border-green-900"
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {e.decision === "deny"
                            ? <FiXCircle className="w-3.5 h-3.5 text-red-600" />
                            : <FiCheckCircle className="w-3.5 h-3.5 text-green-600" />}
                          <span className={`font-bold text-xs uppercase ${
                            e.decision === "deny" ? "text-red-600" : "text-green-600"
                          }`}>{e.decision}</span>
                          <span className="text-slate-500 text-xs capitalize">{e.action}</span>
                          {e.end_user?.email && (
                            <span className="flex items-center gap-1 text-blue-600 text-xs">
                              <FiUser className="w-3 h-3" />{e.end_user.email}
                            </span>
                          )}
                        </div>
                        <span className="text-slate-400 text-xs font-mono">{fmt(e.ts)}</span>
                      </div>
                      {e.prompt && (
                        <p className="text-slate-600 text-xs italic truncate">"{e.prompt}"</p>
                      )}
                      {e.matched_policy && (
                        <p className="text-xs text-orange-600 mt-0.5">
                          <FiShield className="w-3 h-3 inline mr-1" />{e.matched_policy}
                        </p>
                      )}
                      {e.session_id && (
                        <p className="text-xs text-slate-400 mt-0.5 font-mono">
                          Session: {e.session_id}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )
          )}

          {/* ── Investigation ── */}
          {tab === "investigation" && (
            invLoading ? <LoadingSpinner text="Building investigation…" /> : (
              <div className="space-y-5">
                {!inv ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400">
                    <FiShield className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>Investigation data not available.</p>
                    <p className="text-sm mt-1">This incident may not have enough correlated runtime events yet.</p>
                  </div>
                ) : (
                  <>
                    {/* WHO */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <h3 className="text-sm font-bold text-indigo-600 uppercase tracking-wide mb-3">👤 WHO</h3>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div className="bg-slate-100 rounded-lg p-3">
                          <p className="text-xs text-slate-500 mb-1">Agent</p>
                          <p className="text-slate-900 font-semibold">{inv?.who?.agent?.name || "—"}</p>
                          <p className="text-slate-400 text-xs capitalize">{inv?.who?.agent?.agent_type}</p>
                        </div>
                        <div className="bg-slate-100 rounded-lg p-3">
                          <p className="text-xs text-slate-500 mb-1">Asset</p>
                          <p className="text-slate-900 font-semibold">{inv?.who?.asset?.name || "—"}</p>
                          <p className="text-slate-400 text-xs capitalize">{inv?.who?.asset?.classification}</p>
                        </div>
                      </div>
                      {(inv?.who?.end_users || []).length > 0 && (
                        <div>
                          <p className="text-xs text-slate-500 mb-2">End Users Involved</p>
                          {inv.who.end_users.map((eu: any, i: number) => (
                            <div key={eu.id || i} className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 mb-1">
                              <FiUser className="w-3.5 h-3.5 text-blue-600" />
                              <span className="text-blue-600 text-sm">{eu.email || eu.external || eu}</span>
                              {eu.ip && <span className="text-slate-400 text-xs ml-auto font-mono">{eu.ip}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* WHAT */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <h3 className="text-sm font-bold text-orange-600 uppercase tracking-wide mb-3">⚡ WHAT</h3>
                      <div className="grid grid-cols-3 gap-3 mb-3">
                        {[
                          { label:"Action",  value: inv?.what?.trigger_action },
                          { label:"Denials", value: inv?.what?.denial_count },
                          { label:"Window",  value: inv?.what?.window_minutes ? `${inv.what.window_minutes} min` : "—" },
                        ].map(c => (
                          <div key={c.label} className="bg-slate-100 rounded-lg p-3 text-center">
                            <p className="text-slate-900 font-bold">{c.value ?? "—"}</p>
                            <p className="text-slate-400 text-xs">{c.label}</p>
                          </div>
                        ))}
                      </div>
                      {inv?.what?.events?.find((e: any) => e.decision === "deny")?.prompt && (
                        <div className="bg-white border border-slate-200 rounded-lg p-3">
                          <p className="text-xs text-slate-500 mb-1">Triggering Prompt</p>
                          <p className="text-slate-900 text-sm italic">
                            "{inv.what.events.find((e: any) => e.decision === "deny").prompt}"
                          </p>
                        </div>
                      )}
                    </div>

                    {/* WHY */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <h3 className="text-sm font-bold text-red-600 uppercase tracking-wide mb-3">🚨 WHY</h3>
                      {inv?.why?.reason && (
                        <div className="bg-red-900/20 border border-red-800 rounded-lg px-4 py-3 mb-3">
                          <p className="text-red-300 font-semibold">{inv.why.reason}</p>
                        </div>
                      )}
                      {(inv?.why?.policies_applied || []).map((p: any, i: number) => (
                        <div key={p.id || i} className="flex items-center gap-2 bg-slate-100 rounded-lg px-3 py-2 mb-1">
                          <FiShield className="w-3.5 h-3.5 text-orange-600" />
                          <span className="text-slate-900 text-sm">{p.name}</span>
                          <span className="text-xs text-slate-400 ml-auto">Priority {p.priority}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )
          )}

          {/* ── Audit Trail ── */}
          {tab === "audit" && (
            <div className="space-y-2">
              {auditTrail.length === 0
                ? <p className="text-slate-500 text-sm">No audit trail entries yet.</p>
                : auditTrail.map((al: any, i: number) => (
                    <div key={al.id || i} className="bg-white border border-slate-200 rounded-lg px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-900 text-sm font-medium">{al.action?.replace(/_/g," ")}</span>
                        <span className="text-slate-400 text-xs font-mono">{fmt(al.ts)}</span>
                      </div>
                      {Object.keys(al.changes || {}).length > 0 && (
                        <pre className="text-xs text-slate-500 mt-1 overflow-x-auto bg-slate-100 rounded px-2 py-1">
                          {JSON.stringify(al.changes, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
const IncidentsPage: React.FC = () => {
  const router = useRouter();
  const [incidents, setIncidents]   = useState<Incident[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string|null>(null);
  const [drawer, setDrawer]         = useState<Incident|null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [sevFilter, setSevFilter]       = useState("");
  const [search, setSearch]             = useState("");

  useEffect(() => {
    // Use getOrgToken() — not legacy localStorage.getItem("token")
    if (!getOrgToken()) { router.push("/login"); return; }
    load();
  }, []);

  const load = () => {
    setLoading(true);
    incidentApi.list()
      .then(r => setIncidents(r.data))
      .catch(() => setError("Failed to load incidents"))
      .finally(() => setLoading(false));
  };

  const filtered = incidents.filter(i => {
    if (statusFilter && i.status !== statusFilter) return false;
    if (sevFilter && i.severity !== sevFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (i.description||"").toLowerCase().includes(s)
          || (i.agent_name||"").toLowerCase().includes(s)
          || (i.asset_name||"").toLowerCase().includes(s);
    }
    return true;
  });

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = incidents.filter(i => i.status === s).length;
    return acc;
  }, {} as Record<string,number>);

  return (
    <>
      <Head><title>Incidents — AI-SecOS</title></Head>
      {drawer && (
        <InvestigationDrawer
          incident={drawer}
          onClose={() => setDrawer(null)}
          onSaved={updated => {
            setIncidents(prev => prev.map(i => i.id === updated.id ? updated : i));
            setDrawer(updated);
          }}
        />
      )}

      <main className="min-h-screen py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                <FiAlertTriangle className="w-7 h-7 text-orange-600" />
                Incident Investigation
              </h1>
              <p className="text-slate-500 text-sm mt-1">
                {incidents.length} total · {counts["open"] || 0} open · {counts["investigating"] || 0} investigating
              </p>
            </div>
            <button onClick={load}
              className="flex items-center gap-2 bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm hover:bg-slate-200 transition-colors">
              <FiRefreshCw className="w-4 h-4" /> Refresh
            </button>
          </div>

          {error && <Alert type="error" message={error} onClose={() => setError(null)} />}

          {/* Status filter pills */}
          <div className="flex gap-2 mb-5 flex-wrap">
            <button onClick={() => setStatusFilter("")}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                !statusFilter ? "bg-indigo-600 border-indigo-500 text-slate-900" : "bg-white border-slate-200 text-slate-500 hover:border-gray-500"
              }`}>All ({incidents.length})</button>
            {STATUSES.map(s => (
              <button key={s} onClick={() => setStatusFilter(statusFilter === s ? "" : s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                  statusFilter === s ? "bg-gray-700 border-gray-500 text-slate-900" : "bg-white border-slate-200 text-slate-500 hover:border-gray-500"
                }`}>
                {s.replace("_"," ")} ({counts[s] || 0})
              </button>
            ))}
          </div>

          {/* Search + severity */}
          <div className="flex gap-3 mb-5">
            <div className="flex-1 flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5">
              <FiSearch className="w-4 h-4 text-slate-500" />
              <input type="text" placeholder="Search incidents…" value={search}
                onChange={e => setSearch(e.target.value)}
                className="flex-1 bg-transparent text-slate-900 text-sm placeholder-slate-400 outline-none" />
            </div>
            <select value={sevFilter} onChange={e => setSevFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-slate-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none">
              <option value="">All Severities</option>
              {["critical","high","medium","low"].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {loading ? <LoadingSpinner text="Loading incidents…" /> : (
            <div className="space-y-3">
              {filtered.length === 0
                ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
                    <FiAlertTriangle className="w-12 h-12 mx-auto mb-3 text-gray-700" />
                    <p className="text-slate-400 font-medium">No incidents match the current filters.</p>
                    <p className="text-slate-500 text-sm mt-1">
                      {statusFilter || sevFilter || search
                        ? "Try clearing filters."
                        : "Incidents are auto-created when agents are denied 3+ times in 10 minutes."}
                    </p>
                  </div>
                )
                : filtered.map(incident => (
                    <div key={incident.id}
                      onClick={() => setDrawer(incident)}
                      className="bg-white border border-slate-200 rounded-xl p-4 cursor-pointer hover:border-gray-500 hover:bg-white/80 transition-all">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            incident.severity === "critical" ? "bg-red-900/50" :
                            incident.severity === "high"     ? "bg-orange-900/50" : "bg-yellow-900/50"
                          }`}>
                            <FiAlertTriangle className={`w-4 h-4 ${SEV_COLOR[incident.severity||"high"]}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-slate-900 font-semibold text-sm leading-snug truncate">
                              {incident.description}
                            </p>
                            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                              {incident.agent_name && (
                                <span className="flex items-center gap-1 text-xs text-slate-500">🤖 {incident.agent_name}</span>
                              )}
                              {incident.asset_name && (
                                <span className="flex items-center gap-1 text-xs text-slate-500">🗄 {incident.asset_name}</span>
                              )}
                              {incident.owner && (
                                <span className="flex items-center gap-1 text-xs text-blue-600">
                                  <FiUser className="w-3 h-3" />{incident.owner}
                                </span>
                              )}
                              <span className="flex items-center gap-1 text-xs text-slate-400">
                                <FiClock className="w-3 h-3" />{fmt(incident.created_at)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${SEV_COLOR[incident.severity||"high"]}`}>
                            {incident.severity}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${STATUS_STYLE[incident.status]}`}>
                            {incident.status.replace("_"," ")}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
              }
            </div>
          )}
        </div>
      </main>
    </>
  );
};

export default IncidentsPage;
