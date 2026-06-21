export interface Asset {
  id: string;
  name: string;
  description?: string;
  asset_type: string;
  status: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface RiskScore {
  id: string;
  asset_id: string;
  score: number;
  severity: string;
  data_sensitivity: number;
  permission_level: number;
  trust_score: number;
  environment: string;
  policy_gap: number;
  recommendation?: string;
}

export interface Agent {
  id: string;
  name: string;
  description?: string;
  agent_type?: string;
  status: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Policy {
  id: string;
  name: string;
  description?: string;
  policy_type?: string;
  rules: Record<string, any>;
  status: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface RuntimeDecision {
  decision: string;
  reason: string;
  risk_score?: number;
  policies_applied?: string[];
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}
