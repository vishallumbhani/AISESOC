/**
 * pages/agents.tsx — AI-SecOS Enterprise
 * Decision dashboard: What agents are running? Which need attention?
 */
import React, { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { getOrgToken } from "../lib/tokens";
import { agentApi } from "../lib/apiClient";
import { tw } from "../theme/colors";
import {
  PageHeader, MetricCard, TableContainer, THead, TH, TD, TR,
  EmptyState, LoadingSkeleton, InlineAlert, ConfirmDialog,
  SearchBar, StatusBadge, RiskBadge, Btn, Card, SectionHeader,
  Pagination, FilterChip, RowMenu,
} from "../components/ds";
import {
  FiCpu, FiPlus, FiEdit2, FiTrash2, FiX, FiActivity,
  FiAlertTriangle, FiCheckCircle, FiZap, FiRefreshCw,
  FiShield, FiInfo, FiExternalLink,
} from "react-icons/fi";

const AGENT_TYPES = ["support","data_analyst","devops","finance","security","copilot","custom"];
const PAGE_SIZE   = 20;

function AgentModal({ agent, onClose, onSave }: { agent: any|null; onClose:()=>void; onSave:()=>void }) {
  const isNew = !agent;
  const [form, setForm] = useState({
    name:        agent?.name        ?? "",
    description: agent?.description ?? "",
    agent_type:  agent?.agent_type  ?? "support",
    status:      agent?.status      ?? "active",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string|null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Agent name is required."); return; }
    setSaving(true); setError(null);
    try {
      if (isNew) await agentApi.create(form as any);
      else       await agentApi.update(agent!.id, form);
      onSave();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to save agent.");
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 z-10">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            {isNew ? "Register New AI Agent" : "Edit Agent"}
          </h2>
          <button onClick={onClose} className={tw.btnIcon}><FiX className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <InlineAlert type="error" message={error} onClose={() => setError(null)} />}
          <div>
            <label className={tw.fieldLabel}>Agent Name *</label>
            <input value={form.name} onChange={e => setForm({...form,name:e.target.value})}
              placeholder="e.g. Support Agent" className={tw.input} required />
            <p className={tw.fieldHint}>Use a clear name that reflects the agent's business purpose.</p>
          </div>
          <div>
            <label className={tw.fieldLabel}>Description</label>
            <textarea value={form.description} onChange={e => setForm({...form,description:e.target.value})}
              placeholder="What does this agent do? What systems does it access?" className={tw.textarea} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={tw.fieldLabel}>Agent Type</label>
              <select value={form.agent_type} onChange={e => setForm({...form,agent_type:e.target.value})} className={tw.select}>
                {AGENT_TYPES.map(t => <option key={t} value={t}>{t.replace("_"," ")}</option>)}
              </select>
            </div>
            <div>
              <label className={tw.fieldLabel}>Status</label>
              <select value={form.status} onChange={e => setForm({...form,status:e.target.value})} className={tw.select}>
                <option value="active">🟢 Active</option>
                <option value="inactive">⚪ Inactive</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" type="submit" loading={saving} icon={<FiCheckCircle className="w-4 h-4" />}>
              {isNew ? "Register Agent" : "Save Changes"}
            </Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

const AgentsPage: React.FC = () => {
  const router = useRouter();
  const [agents,      setAgents]  = useState<any[]>([]);
  const [loading,     setLoading] = useState(true);
  const [error,       setError]   = useState<string|null>(null);
  const [success,     setSuccess] = useState<string|null>(null);
  const [modal,       setModal]   = useState<any>(undefined);
  const [confirmDelete, setDelete] = useState<any>(null);
  const [deleting,    setDeleting] = useState(false);
  const [search,      setSearch]  = useState("");
  const [statusFilter, setStatus] = useState("");
  const [typeFilter,  setType]    = useState("");
  const [offset,      setOffset]  = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await agentApi.list(); setAgents(r.data); }
    catch { setError("Failed to load agents. Check your connection."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!getOrgToken()) { router.push("/login"); return; }
    load();
  }, []);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await agentApi.delete(confirmDelete.id);
      setDelete(null); load();
      setSuccess(`"${confirmDelete.name}" was removed from your agent inventory.`);
      setTimeout(() => setSuccess(null), 4000);
    } catch { setError("Failed to delete agent."); }
    finally { setDeleting(false); }
  };

  const filtered = agents.filter(a => {
    if (statusFilter && a.status !== statusFilter) return false;
    if (typeFilter   && a.agent_type !== typeFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return a.name.toLowerCase().includes(s) || (a.description||"").toLowerCase().includes(s);
    }
    return true;
  });

  const paged    = filtered.slice(offset, offset + PAGE_SIZE);
  const active   = agents.filter(a => a.status === "active").length;
  const inactive = agents.length - active;
  const highRisk = agents.filter(a => (a.risk_score || 0) >= 60).length;

  const fmt = (d?: string) => d
    ? new Date(d).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" })
    : "Never";

  return (
    <>
      <Head><title>AI Agents — AI-SecOS</title></Head>

      {modal !== undefined && (
        <AgentModal agent={modal==="new"?null:modal} onClose={() => setModal(undefined)}
          onSave={() => { setModal(undefined); load(); setSuccess("Agent saved successfully."); setTimeout(()=>setSuccess(null),3000); }} />
      )}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Remove Agent from Inventory"
        message={`This will remove "${confirmDelete?.name}" from AI-SecOS monitoring. Runtime decisions for this agent will no longer be governed. This action cannot be undone.`}
        confirmLabel="Remove Agent" danger loading={deleting}
        onConfirm={handleDelete} onCancel={() => setDelete(null)}
      />

      <div className={tw.page}>
        <div className={tw.pageInner}>

          {/* Page Header */}
          <PageHeader
            title="AI Agents"
            description="Inventory of all AI agents registered in your organization. Every agent listed here has its runtime decisions evaluated against your security policies in real time."
            icon={<FiCpu className="w-5 h-5" />}
            breadcrumbs={[{ label:"Dashboard", href:"/dashboard" }, { label:"Agents" }]}
            actions={
              <div className="flex gap-2">
                <Btn variant="secondary" icon={<FiRefreshCw className="w-4 h-4" />} onClick={load}>Refresh Data</Btn>
                <Btn variant="primary"   icon={<FiPlus className="w-4 h-4" />}      onClick={() => setModal("new")}>Register Agent</Btn>
              </div>
            }
          />

          {error   && <InlineAlert type="error"   message={error}   onClose={() => setError(null)} />}
          {success && <InlineAlert type="success" message={success} onClose={() => setSuccess(null)} />}

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <MetricCard
              title="Registered Agents" value={agents.length}
              description="Total AI agents in inventory"
              icon={<FiCpu className="w-4 h-4" />} accent="blue" loading={loading} />
            <MetricCard
              title="Active & Monitored" value={active}
              description={`${agents.length > 0 ? Math.round(active/agents.length*100) : 0}% of total — all runtime-governed`}
              icon={<FiCheckCircle className="w-4 h-4" />} accent="green" loading={loading} />
            <MetricCard
              title="Inactive Agents" value={inactive}
              description="Not generating runtime events"
              icon={<FiZap className="w-4 h-4" />} accent="gray" loading={loading} />
            <MetricCard
              title="High Risk Agents" value={highRisk}
              description={highRisk > 0 ? "Review policies for these agents" : "No high-risk agents detected"}
              icon={<FiAlertTriangle className="w-4 h-4" />} accent={highRisk > 0 ? "red" : "green"} loading={loading} />
          </div>

          {/* Table */}
          <TableContainer
            toolbar={
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <SearchBar value={search} onChange={setSearch} placeholder="Search agents by name or description…" className="w-64" />
                  <FilterChip label="All Status"  active={!statusFilter} onClick={() => setStatus("")} />
                  <FilterChip label="🟢 Active"   active={statusFilter==="active"}   onClick={() => setStatus(statusFilter==="active"?"":"active")} />
                  <FilterChip label="⚪ Inactive" active={statusFilter==="inactive"} onClick={() => setStatus(statusFilter==="inactive"?"":"inactive")} />
                </div>
                <div className="flex items-center gap-2">
                  <select value={typeFilter} onChange={e => setType(e.target.value)} className={`${tw.select} w-auto text-xs`}>
                    <option value="">All Types</option>
                    {AGENT_TYPES.map(t => <option key={t} value={t}>{t.replace("_"," ")}</option>)}
                  </select>
                  <span className="text-xs text-slate-400">{filtered.length} agent{filtered.length!==1?"s":""}</span>
                </div>
              </>
            }
            footer={filtered.length > PAGE_SIZE ? (
              <Pagination total={filtered.length} limit={PAGE_SIZE} offset={offset}
                onPage={o => { setOffset(o); window.scrollTo(0,0); }} />
            ) : undefined}
          >
            <THead>
              <TH>Agent</TH>
              <TH>Type</TH>
              <TH>Status</TH>
              <TH>Risk</TH>
              <TH>Registered</TH>
              <TH className="w-24">Actions</TH>
            </THead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="p-0"><LoadingSkeleton rows={6} cols={6} /></td></tr>
              ) : paged.length === 0 ? (
                <tr><td colSpan={6}>
                  <EmptyState
                    icon={<FiCpu className="w-7 h-7" />}
                    title="No agents found"
                    description={search || statusFilter
                      ? "No agents match your current filters. Try adjusting your search or clearing filters."
                      : "Register your first AI agent to start governing its access to enterprise resources. Once registered, every runtime decision is evaluated against your security policies."}
                    action={!search && !statusFilter
                      ? <Btn variant="primary" icon={<FiPlus className="w-4 h-4" />} onClick={() => setModal("new")}>Register First Agent</Btn>
                      : undefined}
                  />
                </td></tr>
              ) : paged.map(agent => (
                <TR key={agent.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0 border border-blue-100">
                        <FiCpu className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{agent.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {agent.description || "No description — add one to help your team identify this agent."}
                        </p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize border border-slate-200">
                      {(agent.agent_type||"—").replace("_"," ")}
                    </span>
                  </TD>
                  <TD><StatusBadge status={agent.status||"active"} /></TD>
                  <TD>
                    {agent.risk_score != null
                      ? <RiskBadge score={agent.risk_score} />
                      : <span className="text-xs text-slate-400">Not scored</span>
                    }
                  </TD>
                  <TD><span className="text-xs text-slate-400">{fmt(agent.created_at)}</span></TD>
                  <TD>
                    <RowMenu actions={[
                      { label: "Edit Agent",   icon: <FiEdit2 className="w-3.5 h-3.5" />,  onClick: () => setModal(agent) },
                      { label: "View Runtime", icon: <FiActivity className="w-3.5 h-3.5" />, onClick: () => router.push(`/runtime?agent=${agent.id}`) },
                      { label: "Remove Agent", icon: <FiTrash2 className="w-3.5 h-3.5" />,  onClick: () => setDelete(agent), danger: true },
                    ]} />
                  </TD>
                </TR>
              ))}
            </tbody>
          </TableContainer>

          {/* Contextual help */}
          <div className="mt-8 bg-blue-50 border border-blue-100 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <FiInfo className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-900 mb-2">About AI Agents</p>
                <p className="text-xs text-blue-700 mb-3">
                  An AI Agent in AI-SecOS represents any AI-powered system or workflow that accesses your enterprise resources.
                  This includes LLM-based assistants, n8n workflows, Copilot extensions, LangChain agents, and custom integrations.
                  Once registered, every request is evaluated by the Policy Engine in under 100ms before reaching your data.
                </p>
                <div className="flex gap-4">
                  <Link href="/policies" className="text-xs text-blue-600 font-medium hover:underline flex items-center gap-1">
                    <FiShield className="w-3 h-3" /> Manage Policies
                  </Link>
                  <Link href="/runtime" className="text-xs text-blue-600 font-medium hover:underline flex items-center gap-1">
                    <FiActivity className="w-3 h-3" /> View Runtime Decisions
                  </Link>
                  <Link href="/incidents" className="text-xs text-blue-600 font-medium hover:underline flex items-center gap-1">
                    <FiAlertTriangle className="w-3 h-3" /> Review Incidents
                  </Link>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};

export default AgentsPage;
