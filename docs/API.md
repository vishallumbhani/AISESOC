# API Documentation

## Base URL

```
http://localhost:8000/api/v1
```

## Authentication

All endpoints except `/auth/register` and `/auth/login` require JWT token in Authorization header:

```
Authorization: Bearer <token>
```

## Endpoints

### Authentication

#### Register

```
POST /auth/register
```

**Request Body:**

```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "secure_password",
  "role": "user"
}
```

**Response (200):**

```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer"
}
```

#### Login

```
POST /auth/login?username=john_doe&password=secure_password
```

**Response (200):**

```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer"
}
```

### Assets

#### List Assets

```
GET /assets
```

**Response (200):**

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "organization_id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "Database Server",
    "description": "Production database",
    "asset_type": "database",
    "status": "active",
    "metadata": {"version": "15.0"},
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
]
```

#### Create Asset

```
POST /assets
```

**Request Body:**

```json
{
  "name": "API Server",
  "description": "Main API server",
  "asset_type": "server",
  "status": "active",
  "metadata": {
    "region": "us-east-1",
    "environment": "production"
  }
}
```

**Response (200):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "organization_id": "550e8400-e29b-41d4-a716-446655440001",
  "name": "API Server",
  "description": "Main API server",
  "asset_type": "server",
  "status": "active",
  "metadata": {
    "region": "us-east-1",
    "environment": "production"
  },
  "created_at": "2024-01-15T11:30:00Z",
  "updated_at": "2024-01-15T11:30:00Z"
}
```

#### Get Asset

```
GET /assets/{asset_id}
```

**Response (200):** See Create Asset response

#### Update Asset

```
PATCH /assets/{asset_id}
```

**Request Body:**

```json
{
  "status": "maintenance",
  "metadata": {"updated_by": "admin"}
}
```

**Response (200):** Updated asset object

#### Delete Asset

```
DELETE /assets/{asset_id}
```

**Response (200):**

```json
{"message": "Asset deleted successfully"}
```

#### Get Asset Risk Score

```
GET /assets/{asset_id}/risk-score
```

**Response (200):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440003",
  "asset_id": "550e8400-e29b-41d4-a716-446655440002",
  "organization_id": "550e8400-e29b-41d4-a716-446655440001",
  "score": 65.5,
  "severity": "high",
  "data_sensitivity": 80,
  "permission_level": 70,
  "trust_score": 45,
  "environment": "production",
  "policy_gap": 30,
  "recommendation": "Review data access controls | Reduce permission levels",
  "calculated_at": "2024-01-15T12:00:00Z",
  "created_at": "2024-01-15T12:00:00Z",
  "updated_at": "2024-01-15T12:00:00Z"
}
```

### Agents

#### List Agents

```
GET /agents
```

**Response (200):**

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440004",
    "organization_id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "DataAnalyzer",
    "description": "Data analysis agent",
    "agent_type": "llm",
    "status": "active",
    "metadata": {"model": "gpt-4"},
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
]
```

#### Create Agent

```
POST /agents
```

**Request Body:**

```json
{
  "name": "SecurityBot",
  "description": "Security monitoring agent",
  "agent_type": "monitoring",
  "status": "active",
  "metadata": {
    "version": "1.0.0",
    "capabilities": ["log_analysis", "threat_detection"]
  }
}
```

**Response (200):** Agent object

#### Get Agent

```
GET /agents/{agent_id}
```

**Response (200):** Agent object

### Policies

#### List Policies

```
GET /policies
```

**Response (200):**

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440005",
    "organization_id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "Production Access Policy",
    "description": "Control production resource access",
    "policy_type": "access_control",
    "rules": {
      "allow": ["agent:support-*, resource:customer-data"],
      "deny": ["agent:*, resource:admin-panel"]
    },
    "status": "active",
    "priority": 100,
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  }
]
```

#### Create Policy

```
POST /policies
```

**Request Body:**

```json
{
  "name": "Data Analyst Policy",
  "description": "Policy for data analysis agents",
  "policy_type": "access_control",
  "rules": {
    "allow": ["agent:data-analyzer-*, resource:analytics-db"],
    "deny": ["agent:*, resource:payroll-db"]
  },
  "status": "active",
  "priority": 50
}
```

**Response (200):** Policy object

#### Get Policy

```
GET /policies/{policy_id}
```

**Response (200):** Policy object

### Runtime Decisions

#### Make Runtime Decision

```
POST /runtime/decision
```

**Request Body:**

```json
{
  "agent_id": "550e8400-e29b-41d4-a716-446655440004",
  "asset_id": "550e8400-e29b-41d4-a716-446655440002",
  "action": "access"
}
```

**Response (200):**

```json
{
  "decision": "allow",
  "reason": "Policy 'Production Access Policy' allows this access",
  "risk_score": 65.5,
  "policies_applied": ["550e8400-e29b-41d4-a716-446655440005"]
}
```

Or (if denied):

```json
{
  "decision": "deny",
  "reason": "Policy 'Data Sensitivity Policy' denies this access",
  "risk_score": 85.0,
  "policies_applied": ["550e8400-e29b-41d4-a716-446655440006"]
}
```

### Risk Scores

#### List Risk Scores

```
GET /risk-scores
```

**Response (200):** Array of risk score objects

#### Recalculate Risk Score

```
POST /risk-scores/recalculate/{asset_id}?data_sensitivity=75&permission_level=60&trust_score=40&environment=production&policy_gap=25
```

**Response (200):** Updated risk score object

### Health Check

#### Health Status

```
GET /health
```

**Response (200):**

```json
{
  "status": "healthy",
  "database": "healthy",
  "graph": "healthy"
}
```

## Error Responses

### 400 Bad Request

```json
{
  "detail": "Invalid request format"
}
```

### 401 Unauthorized

```json
{
  "detail": "Could not validate credentials"
}
```

### 404 Not Found

```json
{
  "detail": "Asset not found"
}
```

### 500 Internal Server Error

```json
{
  "detail": "Internal server error"
}
```
