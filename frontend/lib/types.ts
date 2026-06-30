export interface Asset {
  id: string;
  name: string;
  description?: string;
  asset_type: string;
  status: string;
  classification: "public" | "internal" | "confidential" | "restricted";
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
  deny_event_count?: number;
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
  agent_name?: string;
  asset_name?: string;
  action?: string;
  matched_policy_name?: string;
  evaluation_time?: string;
  incident_created?: boolean;
  end_user_id?: string;
  matched_policy?: string;
  matched_policy_id?: string;
  matched_rule?: string;
  rule_type?: string;
  explanation?: string;
  trace?: SimulateTraceEntry[];
}

export interface AuditLog {
  id: string;
  organization_id: string;
  user_id?: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  changes?: Record<string, any>;
  created_at: string;
}

export interface RuntimeEvent {
  id: string;
  agent_id?: string;
  asset_id?: string;
  event_type?: string;
  action?: string;
  status?: string;
  session_id?: string;
  prompt_preview?: string;
  source_ip?: string;
  created_at: string;
}

export type IncidentStatus =
  | "open"
  | "investigating"
  | "resolved"
  | "false_positive"
  | "closed";

export interface IncidentTimelineEntry {
  ts: string;
  actor: string;
  action: string;
  note?: string;
}

export interface Incident {
  id: string;
  organization_id: string;
  agent_id?: string;
  asset_id?: string;
  incident_type?: string;
  severity?: string;
  description?: string;
  status: IncidentStatus;
  owner?: string;
  resolution_notes?: string;
  resolution_details?: Record<string, any>;
  timeline?: IncidentTimelineEntry[];
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  agent_name?: string;
  asset_name?: string;
}

// Graph
export interface GraphNode {
  id: string;
  label: string;
  name: string;
  type?: string;
  email?: string;
  ip_address?: string;
  risk_score?: number;
}

export interface GraphEdge {
  id?: string;
  from: string;
  to: string;
  from_name?: string;
  to_name?: string;
  type: string;
  action?: string;
  decision?: string;
  session_id?: string;
  prompt_preview?: string;
  asset_id?: string;
  asset_name?: string;
  policy_name?: string;
  timestamp?: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface NodeDrillDown {
  node_id: string;
  node_type: string;
  name?: string;
  asset_type?: string;
  agent_type?: string;
  classification?: string;
  risk_score?: { score: number; severity: string; recommendation: string };
  event_counts?: Record<string, number>;
  related_policies?: { id: string; name: string; effect: string }[];
  open_incidents?: { id: string; description: string; severity: string }[];
  recent_events?: RuntimeEvent[];
}

// Analytics
export interface AuditAnalytics {
  denied_today: number;
  top_denied_agents: { agent_id: string; name: string; count: number }[];
  top_protected_assets: { asset_id: string; name: string; count: number }[];
  recent_decisions: {
    id: string;
    agent_name: string;
    asset_name: string;
    action: string;
    decision: string;
    created_at: string;
  }[];
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

// ── Phase 5: Policy Simulator ──────────────────────────────────

export interface SimulateTraceEntry {
  policy:  string;
  effect?: string;
  matched: boolean;
  rule?:   string;
}

export interface SimulateResponse {
  decision:          string;
  reason:            string;
  matched_policy?:   string;
  matched_policy_id?: string;
  matched_rule?:     string;
  rule_type?:        string;
  explanation:       string;
  trace:             SimulateTraceEntry[];
  policies_applied:  string[];
  action:            string;
}

// ── Phase 5: Policy Version History ────────────────────────────

export interface PolicyVersionSnapshot {
  version:        number;
  name:           string;
  description?:   string;
  policy_type?:   string;
  rules:          Record<string, any>;
  status?:        string;
  priority?:      number;
  saved_at:       string;
  change_summary?: string;
}

// Agent with live stats (returned by the new agents.py)
export interface AgentWithStats {
  id: string;
  organization_id: string;
  name: string;
  description?: string;
  agent_type?: string;
  status: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
  created_by?: string;
  // Stats
  total_requests:   number;
  denied_requests:  number;
  allowed_requests: number;
  incident_count:   number;
  distinct_assets:  number;
  last_activity?:   string;
  denial_rate:      number;
  risk_level:       string;
}

// Enriched runtime event (from the new /runtime/events endpoint)
export interface RuntimeEventEnriched {
  id:             string;
  agent_id?:      string;
  agent_name?:    string;
  asset_id?:      string;
  asset_name?:    string;
  end_user_id?:   string;
  end_user?:      string;
  action?:        string;
  status?:        string;
  session_id?:    string;
  prompt_preview?: string;
  source_ip?:     string;
  matched_policy?: string;
  explanation?:   string;
  created_at:     string;
}
