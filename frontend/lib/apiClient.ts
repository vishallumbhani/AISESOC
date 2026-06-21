import api from "./api";
import { Asset, RiskScore, Agent, Policy, RuntimeDecision, AuthResponse } from "./types";

// Auth endpoints
export const authApi = {
  register: (username: string, email: string, password: string) =>
    api.post<AuthResponse>("/auth/register", { username, email, password, role: "user" }),
  login: (username: string, password: string) =>
    api.post<AuthResponse>("/auth/login", null, { params: { username, password } }),
};

// Asset endpoints
export const assetApi = {
  list: () => api.get<Asset[]>("/assets"),
  get: (id: string) => api.get<Asset>(`/assets/${id}`),
  create: (asset: Omit<Asset, "id" | "created_at" | "updated_at">) =>
    api.post<Asset>("/assets", asset),
  update: (id: string, asset: Partial<Asset>) =>
    api.patch<Asset>(`/assets/${id}`, asset),
  delete: (id: string) => api.delete(`/assets/${id}`),
  getRiskScore: (id: string) => api.get<RiskScore>(`/assets/${id}/risk-score`),
};

// Agent endpoints
export const agentApi = {
  list: () => api.get<Agent[]>("/agents"),
  get: (id: string) => api.get<Agent>(`/agents/${id}`),
  create: (agent: Omit<Agent, "id" | "created_at" | "updated_at">) =>
    api.post<Agent>("/agents", agent),
};

// Policy endpoints
export const policyApi = {
  list: () => api.get<Policy[]>("/policies"),
  get: (id: string) => api.get<Policy>(`/policies/${id}`),
  create: (policy: Omit<Policy, "id" | "created_at" | "updated_at">) =>
    api.post<Policy>("/policies", policy),
};

// Risk Score endpoints
export const riskScoreApi = {
  list: () => api.get<RiskScore[]>("/risk-scores"),
  recalculate: (
    assetId: string,
    dataSensitivity: number,
    permissionLevel: number,
    trustScore: number,
    environment: string,
    policyGap: number
  ) =>
    api.post<RiskScore>(
      `/risk-scores/recalculate/${assetId}`,
      null,
      {
        params: {
          data_sensitivity: dataSensitivity,
          permission_level: permissionLevel,
          trust_score: trustScore,
          environment,
          policy_gap: policyGap,
        },
      }
    ),
};

// Runtime endpoints
export const runtimeApi = {
  makeDecision: (agentId: string, assetId: string, action: string = "access") =>
    api.post<RuntimeDecision>("/runtime/decision", {
      agent_id: agentId,
      asset_id: assetId,
      action,
    }),
};
