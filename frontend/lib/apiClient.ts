import orgApi from "./orgApi";
import { getOrgToken } from "./tokens";
import {
  Asset, RiskScore, Agent, Policy, RuntimeDecision,
  AuthResponse, AuditLog, RuntimeEvent, Incident,
  GraphData, AuditAnalytics, NodeDrillDown,
  SimulateResponse, PolicyVersionSnapshot,
} from "./types";

const api = orgApi;

export const authApi = {
  register: (username: string, email: string, password: string) =>
    api.post<AuthResponse>("/auth/register", { username, email, password, role: "user" }),
  login: (username: string, password: string) =>
    api.post<AuthResponse>("/auth/login", null, { params: { username, password } }),
};

export const assetApi = {
  list: (classification?: string) =>
    api.get<Asset[]>("/assets", { params: classification ? { classification } : {} }),
  get: (id: string) => api.get<Asset>(`/assets/${id}`),
  create: (asset: Omit<Asset, "id" | "created_at" | "updated_at">) =>
    api.post<Asset>("/assets", asset),
  update: (id: string, asset: Partial<Asset>) =>
    api.patch<Asset>(`/assets/${id}`, asset),
  delete: (id: string) => api.delete(`/assets/${id}`),
  getRiskScore: (id: string) => api.get<RiskScore>(`/assets/${id}/risk-score`),
  getRuntimeEvents: (id: string) => api.get<RuntimeEvent[]>(`/assets/${id}/runtime-events`),
  getRiskHistory: (id: string, days = 30) =>
    api.get(`/assets/${id}/risk-history`, { params: { days } }),
};

export const agentApi = {
  list: () => api.get<Agent[]>("/agents"),
  get: (id: string) => api.get<Agent>(`/agents/${id}`),
  create: (agent: Omit<Agent, "id" | "created_at" | "updated_at">) =>
    api.post<Agent>("/agents", agent),
  update: (id: string, data: Partial<Agent>) =>
    api.patch<Agent>(`/agents/${id}`, data),
  // ── Was missing — caused "Failed to delete agent" ────────────
  delete: (id: string) => api.delete(`/agents/${id}`),
  disable: (id: string) => api.patch(`/agents/${id}/disable`),
};

export const policyApi = {
  list: () => api.get<Policy[]>("/policies"),
  get: (id: string) => api.get<Policy>(`/policies/${id}`),
  create: (policy: Omit<Policy, "id" | "created_at" | "updated_at">) =>
    api.post<Policy>("/policies", policy),
  update: (id: string, policy: Partial<Policy>) =>
    api.patch<Policy>(`/policies/${id}`, policy),
  delete: (id: string) => api.delete(`/policies/${id}`),
  // ── Was missing — caused policyApi.getDeleteSafety crash ────
  getDeleteSafety: (id: string) =>
    api.get(`/policies/${id}/delete-safety`),
  simulate: (body: {
    agent_id: string;
    asset_id: string;
    action?: string;
    test_rules?: Record<string, any>;
  }) => api.post<SimulateResponse>("/policies/simulate", body),
  getVersions: (id: string) =>
    api.get<PolicyVersionSnapshot[]>(`/policies/${id}/versions`),
  lifecycle: (id: string, state: string, note?: string) =>
    api.post(`/policies/${id}/lifecycle`, { state, note }),
  detectConflicts: () => api.post("/policies/conflicts", {}),
};

export const riskScoreApi = {
  list: () => api.get<RiskScore[]>("/risk-scores"),
  recalculate: (
    assetId: string,
    dataSensitivity: number,
    permissionLevel: number,
    trustScore: number,
    environment: string,
    policyGap: number,
  ) =>
    api.post<RiskScore>(`/risk-scores/recalculate/${assetId}`, null, {
      params: {
        data_sensitivity: dataSensitivity,
        permission_level: permissionLevel,
        trust_score: trustScore,
        environment,
        policy_gap: policyGap,
      },
    }),
};

export const runtimeApi = {
  makeDecision: (payload: {
    agent_id: string;
    asset_id: string;
    action?: string;
    end_user_external_id?: string;
    end_user_email?: string;
    end_user_ip?: string;
    user_agent?: string;
    session_id?: string;
    prompt?: string;
  }) => api.post<RuntimeDecision>("/runtime/decision", payload),
  listEvents: (params?: {
    agent_id?: string; asset_id?: string; decision?: string;
    end_user?: string; session_id?: string; date_from?: string;
    date_to?: string; search?: string; limit?: number; offset?: number;
  }) => api.get<{ total: number; items: any[] }>("/runtime/events", { params }),
  getSummary: () => api.get("/runtime/stats/summary"),
};

export const auditLogApi = {
  list: (params?: {
    resource_type?: string; action?: string; agent_id?: string;
    asset_id?: string; decision?: string; incident_id?: string;
    user_filter?: string; date_from?: string; date_to?: string; limit?: number;
  }) => api.get<AuditLog[]>("/audit-logs", { params }),
  analytics: () => api.get<AuditAnalytics>("/audit-logs/analytics/summary"),
  exportCsvUrl: (params?: Record<string, string>) => {
    const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const qs = params ? "?" + new URLSearchParams(params).toString() : "";
    return `${base}/api/v1/audit-logs/export/csv${qs}`;
  },
};

export const graphApi = {
  getFullGraph: () => api.get<GraphData>("/graph"),
  getAssetGraph: (assetId: string) => api.get<GraphData>(`/graph/asset/${assetId}`),
  getNodeDetail: (nodeId: string, nodeType: "asset" | "agent") =>
    api.get<NodeDrillDown>(`/graph/node/${nodeId}`, { params: { node_type: nodeType } }),
  createRelationship: (body: {
    from_id: string; to_id: string; from_label?: string;
    to_label?: string; relationship_type: string; properties?: Record<string, any>;
  }) => api.post("/graph/relationships", body),
  sync: () => api.get("/graph/sync"),
  getIntelligence: () => api.get("/graph/intelligence"),
};

export const incidentApi = {
  list: (params?: { status_filter?: string; severity?: string; owner?: string }) =>
    api.get<Incident[]>("/incidents", { params }),
  get: (id: string) => api.get<Incident>(`/incidents/${id}`),
  update: (id: string, data: {
    status?: string; severity?: string; owner?: string;
    resolution_notes?: string; resolution_details?: Record<string, any>;
    description?: string; timeline_note?: string;
  }) => api.patch<Incident>(`/incidents/${id}`, data),
  getEvents: (id: string) => api.get<RuntimeEvent[]>(`/incidents/${id}/events`),
  getInvestigation: (id: string) => api.get(`/incidents/${id}/investigation`),
  getAuditTrail: (id: string) => api.get(`/incidents/${id}/audit-trail`),
};
