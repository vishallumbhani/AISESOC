/**
 * pages/agents.tsx
 * DESIGN SYSTEM REFERENCE IMPLEMENTATION
 *
 * This page demonstrates correct usage of the AI-SecOS Enterprise Design System.
 * Every other page should follow this pattern.
 *
 * Key patterns:
 *   - Uses PageHeader for title/breadcrumbs/actions
 *   - Uses TableContainer + THead/TH/TD/TR for all tables
 *   - Uses SearchBar + FilterChip for filtering
 *   - Uses MetricCard for summary stats
 *   - Uses StatusBadge / RiskBadge for all status/risk display
 *   - Uses EmptyState for no-data states
 *   - Uses LoadingSkeleton during fetches
 *   - Uses ConfirmDialog for destructive actions
 *   - Uses InlineAlert for errors/success
 *   - Uses Btn for all buttons
 *   - Uses tw.input / tw.select / tw.fieldLabel for all form fields
 *   - Uses tw.page + tw.pageInner for page layout
 *   - NO dark classes (bg-gray-900, text-white, etc.) in this portal
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
  Pagination, FilterChip, Spinner,
} from "../components/ds";
import {
  FiCpu, FiPlus, FiEdit2, FiTrash2, FiX, FiActivity,
  FiAlertTriangle, FiCheckCircle, FiZap, FiRefreshCw,
} from "react-icons/fi";

const AGENT_TYPES = ["support", "data_analyst", "devops", "finance", "security", "copilot", "custom"];
const PAGE_SIZE   = 20;

// ── Modal ──────────────────────────────────────────────────────
function AgentModal({ agent, onClose, onSave }: {
  agent: any | null; onClose: () => void; onSave: () => void;
}) {
  const isNew = !agent;
  const [form, setForm] = useState({
    name:        agent?.name        ?? "",
    description: agent?.description ?? "",
    agent_type:  agent?.agent_type  ?? "support",
    status:      agent?.status      ?? "active",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

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
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 z-10 animate-fade-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            {isNew ? "Add AI Agent" : "Edit Agent"}
          </h2>
          <button onClick={onClose} className={tw.btnIcon}><FiX className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <InlineAlert type="error" message={error} onClose={() => setError(null)} />}
          <div>
            <label className={tw.fieldLabel}>Agent Name *</label>
            <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Support Agent" className={tw.input} required />
          </div>
          <div>
            <label className={tw.fieldLabel}>Description</label>
            <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="What does this agent do?" className={tw.textarea} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={tw.fieldLabel}>Type</label>
              <select value={form.agent_type} onChange={e => setForm({ ...form, agent_type: e.target.value })}
                className={tw.select}>
                {AGENT_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label className={tw.fieldLabel}>Status</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}
                className={tw.select}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="secondary" onClick={onClose}>Cancel</Btn>
            <Btn variant="primary" type="submit" loading={saving} icon={<FiCheckCircle className="w-4 h-4" />}>
              {isNew ? "Create Agent" : "Save Changes"}
            </Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
const AgentsPage: React.FC = () => {
  const router = useRouter();
  const [agents, setAgents]       = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatus] = useState("");
  const [typeFilter, setType]     = useState("");
  const [offset, setOffset]       = useState(0);
  const [modal, setModal]         = useState<any | null | "new">(undefined);
  const [confirmDelete, setDelete] = useState<any | null>(null);
  const [deleting, setDeleting]   = useState(false);
  const [success, setSuccess]     = useState<string | null>(null);

  // Read ?status= from URL (dashboard card click)
  useEffect(() => {
    const { status } = router.query;
    if (status && typeof status === "string") setStatus(status);
  }, [router.query]);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await agentApi.list();
      setAgents(r.data);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to load agents.");
    } finally { setLoading(false); }
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
      setAgents(a => a.filter(x => x.id !== confirmDelete.id));
      setDelete(null);
      setSuccess("Agent deleted successfully.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Failed to delete agent.");
    } finally { setDeleting(false); }
  };

  // Client-side filter
  const filtered = agents.filter(a => {
    if (statusFilter && a.status !== statusFilter) return false;
    if (typeFilter   && a.agent_type !== typeFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return a.name.toLowerCase().includes(s) || (a.description || "").toLowerCase().includes(s);
    }
    return true;
  });

  const paged  = filtered.slice(offset, offset + PAGE_SIZE);
  const active = agents.filter(a => a.status === "active").length;
  const inactive = agents.length - active;

  const fmt = (d?: string) => d
    ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Never";

  return (
    <>
      <Head><title>Agents — AI-SecOS</title></Head>

      {/* Modals */}
      {modal !== undefined && (
        <AgentModal
          agent={modal === "new" ? null : modal}
          onClose={() => setModal(undefined)}
          onSave={() => { setModal(undefined); load(); setSuccess("Agent saved successfully."); setTimeout(() => setSuccess(null), 3000); }}
        />
      )}
      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Agent"
        message={`Permanently delete "${confirmDelete?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDelete(null)}
      />

      <div className={tw.page}>
        <div className={tw.pageInner}>

          {/* Page Header */}
          <PageHeader
            title="AI Agents"
            description="Manage and monitor all AI agents in your organization."
            icon={<FiCpu className="w-5 h-5" />}
            breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Agents" }]}
            actions={
              <div className="flex gap-2">
                <Btn variant="secondary" icon={<FiRefreshCw className="w-4 h-4" />} onClick={load}>Refresh</Btn>
                <Btn variant="primary"   icon={<FiPlus className="w-4 h-4" />}      onClick={() => setModal("new")}>Add Agent</Btn>
              </div>
            }
          />

          {/* Alerts */}
          {error   && <InlineAlert type="error"   message={error}   onClose={() => setError(null)} />}
          {success && <InlineAlert type="success" message={success} onClose={() => setSuccess(null)} />}

          {/* Summary metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <MetricCard title="Total Agents"  value={agents.length} icon={<FiCpu className="w-4 h-4" />}       accent="blue"  loading={loading} />
            <MetricCard title="Active"        value={active}        icon={<FiCheckCircle className="w-4 h-4" />} accent="green" loading={loading} />
            <MetricCard title="Inactive"      value={inactive}      icon={<FiZap className="w-4 h-4" />}        accent="gray"  loading={loading} />
            <MetricCard title="Types"         value={new Set(agents.map(a => a.agent_type)).size}
              icon={<FiActivity className="w-4 h-4" />} accent="purple" loading={loading} />
          </div>

          {/* Table */}
          <TableContainer
            toolbar={
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <SearchBar value={search} onChange={setSearch} placeholder="Search agents…" className="w-56" />
                  <FilterChip label="All"      active={!statusFilter} onClick={() => setStatus("")} />
                  <FilterChip label="Active"   active={statusFilter === "active"}   onClick={() => setStatus(statusFilter === "active" ? "" : "active")} />
                  <FilterChip label="Inactive" active={statusFilter === "inactive"} onClick={() => setStatus(statusFilter === "inactive" ? "" : "inactive")} />
                </div>
                <div className="flex items-center gap-2">
                  <select value={typeFilter} onChange={e => setType(e.target.value)}
                    className={`${tw.select} w-auto text-xs`}>
                    <option value="">All Types</option>
                    {AGENT_TYPES.map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                  </select>
                  <span className="text-xs text-slate-400">{filtered.length} agents</span>
                </div>
              </>
            }
            footer={filtered.length > PAGE_SIZE ? (
              <Pagination total={filtered.length} limit={PAGE_SIZE} offset={offset}
                onPage={o => { setOffset(o); window.scrollTo(0, 0); }} />
            ) : undefined}
          >
            <THead>
              <TH>Agent</TH>
              <TH>Type</TH>
              <TH>Status</TH>
              <TH>Created</TH>
              <TH className="w-24">Actions</TH>
            </THead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="p-0"><LoadingSkeleton rows={6} cols={5} /></td></tr>
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={<FiCpu className="w-7 h-7" />}
                      title="No agents found"
                      description={
                        search || statusFilter
                          ? "Try adjusting your search or filters."
                          : "Add your first AI agent to start monitoring access decisions."
                      }
                      action={!search && !statusFilter
                        ? <Btn variant="primary" icon={<FiPlus className="w-4 h-4" />} onClick={() => setModal("new")}>Add Agent</Btn>
                        : undefined}
                    />
                  </td>
                </tr>
              ) : paged.map(agent => (
                <TR key={agent.id}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <FiCpu className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900 text-sm">{agent.name}</p>
                        {agent.description && (
                          <p className="text-xs text-slate-400 truncate max-w-xs">{agent.description}</p>
                        )}
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full capitalize border border-slate-200">
                      {(agent.agent_type || "—").replace("_", " ")}
                    </span>
                  </TD>
                  <TD><StatusBadge status={agent.status || "active"} /></TD>
                  <TD><span className="text-xs text-slate-400">{fmt(agent.created_at)}</span></TD>
                  <TD>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setModal(agent)} title="Edit"
                        className={tw.btnIcon}><FiEdit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDelete(agent)} title="Delete"
                        className={`${tw.btnIcon} hover:bg-red-50 hover:text-red-600`}>
                        <FiTrash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </TableContainer>
        </div>
      </div>
    </>
  );
};

export default AgentsPage;
