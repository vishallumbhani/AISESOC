# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                    │
│              (React, Tailwind CSS, Axios)               │
└────────────────────────┬────────────────────────────────┘
                         │
                    HTTP/HTTPS
                         │
        ┌────────────────┴────────────────┐
        │                                 │
┌───────▼────────────────────┐    ┌──────▼──────────────┐
│    Backend (FastAPI)       │    │  Reverse Proxy      │
│ ┌────────────────────────┐ │    │   (Nginx/Caddy)    │
│ │ Routes Layer           │ │    └──────┬──────────────┘
│ │ - Auth                 │ │           │
│ │ - Assets               │ │      SSL/TLS
│ │ - Agents               │ │           │
│ │ - Policies             │ │      Internet
│ │ - Runtime              │ │
│ └────────────┬───────────┘ │
│              │             │
│ ┌────────────▼───────────┐ │
│ │ Business Logic Layer   │ │
│ │ - Policy Engine        │ │
│ │ - Risk Engine          │ │
│ │ - Decision Engine      │ │
│ └────────────┬───────────┘ │
│              │             │
│ ┌────────────▼───────────┐ │
│ │ Data Access Layer      │ │
│ │ - SQLAlchemy ORM       │ │
│ │ - Neo4j Handler        │ │
│ └────────────┬───────────┘ │
└───────────────┼─────────────┘
                │
      ┌─────────┴──────────┐
      │                    │
┌─────▼───────────┐  ┌────▼────────────┐
│   PostgreSQL    │  │    Neo4j        │
│   (Relational)  │  │    (Graph)      │
│                 │  │                 │
│ - Organizations │  │ - Agent nodes   │
│ - Users         │  │ - Asset nodes   │
│ - Assets        │  │ - Relationships │
│ - Agents        │  │ - Paths         │
│ - Policies      │  │ - Patterns      │
│ - Risk Scores   │  │                 │
│ - Audit Logs    │  │                 │
└─────────────────┘  └─────────────────┘
```

## Component Architecture

### Backend Components

```
┌──────────────────────────────────────┐
│     FastAPI Application (main.py)    │
├──────────────────────────────────────┤
│         Route Handlers Layer          │
│  ┌────────────────────────────────┐  │
│  │ /auth    /assets    /agents    │  │
│  │ /policies /runtime /risk-scores│  │
│  └────────────────────────────────┘  │
├──────────────────────────────────────┤
│      Business Logic Layer             │
│  ┌────────────────────────────────┐  │
│  │ PolicyEngine   RiskEngine       │  │
│  │ SecurityUtils  GraphHandling    │  │
│  └────────────────────────────────┘  │
├──────────────────────────────────────┤
│      Data Access Layer                │
│  ┌────────────────────────────────┐  │
│  │ SQLAlchemy Models   Database    │  │
│  │ Neo4j Graph         Schemas     │  │
│  └────────────────────────────────┘  │
├──────────────────────────────────────┤
│      Persistence Layer                │
│  ┌────────────────────────────────┐  │
│  │ PostgreSQL (Relational DB)     │  │
│  │ Neo4j (Graph DB)               │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

## Data Flow

### Authentication Flow

```
1. User submits credentials (POST /auth/login)
   ↓
2. Backend validates credentials against PostgreSQL
   ↓
3. Password verification using bcrypt
   ↓
4. Generate JWT token with user_id and org_id
   ↓
5. Return token to client
   ↓
6. Client stores token in localStorage/cookie
   ↓
7. Client includes token in Authorization header for subsequent requests
```

### Asset Creation Flow

```
1. Request: POST /assets {name, description, type, ...}
   ↓
2. Verify JWT token and extract organization_id
   ↓
3. Create Asset record in PostgreSQL
   ↓
4. Create Asset node in Neo4j graph
   ↓
5. Calculate initial risk score using RiskEngine
   ↓
6. Store RiskScore in PostgreSQL
   ↓
7. Return Asset object to client
```

### Runtime Decision Flow

```
1. Request: POST /runtime/decision {agent_id, asset_id, action}
   ↓
2. Fetch Agent from PostgreSQL
   ↓
3. Fetch Asset from PostgreSQL
   ↓
4. Fetch all active Policies from PostgreSQL
   ↓
5. PolicyEngine evaluates policies
      ├─ Check deny rules
      ├─ Check allow rules
      └─ Make decision (allow/deny)
   ↓
6. Fetch RiskScore for asset
   ↓
7. Create RuntimeEvent in PostgreSQL (audit)
   ↓
8. Return decision with risk score and applied policies
```

### Risk Scoring Flow

```
1. Request to recalculate: POST /risk-scores/recalculate/{asset_id}
   ↓
2. Extract parameters: data_sensitivity, permission_level, trust_score, etc.
   ↓
3. RiskEngine.calculate_risk_score() called
   ├─ Apply weights to each factor
   ├─ Calculate weighted sum
   ├─ Apply environment multiplier
   └─ Determine severity level
   ↓
4. Update RiskScore in PostgreSQL
   ↓
5. Return updated risk score with recommendation
```

## Database Design

### Entity Relationships

```
Organization (1) ─────── (M) User
    │
    ├─ (1) ─────── (M) Asset
    │               │
    │               └─ (1) ─────── (M) RiskScore
    │
    ├─ (1) ─────── (M) Agent
    │               │
    │               └─ → connects to Assets (via RuntimeEvent)
    │
    ├─ (1) ─────── (M) Policy
    │               │
    │               └─ rules: {allow: [...], deny: [...]}
    │
    ├─ (1) ─────── (M) Tool
    │
    ├─ (1) ─────── (M) Model
    │
    ├─ (1) ─────── (M) DataSource
    │               │
    │               └─ connection_config: {...}
    │
    └─ (1) ─────── (M) RuntimeEvent
                    └─ records agent-asset interactions
```

### Neo4j Graph Structure

```
(Agent:DataAnalyzer)
    ├─ USES → (Tool:PythonLib)
    ├─ USES → (Model:GPT4)
    └─ ACCESSES → (Asset:Database)
                    ├─ CONTAINS → (DataSource:CustomerTable)
                    └─ HAS_POLICY → (Policy:ProductionPolicy)

(Agent:SecurityBot)
    ├─ MONITORS → (Asset:APIServer)
    ├─ ALERTS_ON → (RiskScore:High)
    └─ ENFORCES → (Policy:SecurityPolicy)
```

## Security Architecture

### Authentication & Authorization

```
┌─────────────────────────────────────┐
│     Request with JWT Token          │
└──────────────────┬──────────────────┘
                   │
                   ▼
         ┌─────────────────────┐
         │  Extract Token      │
         └──────────┬──────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │  Verify Signature   │
         │  Check Expiration   │
         └──────────┬──────────┘
                    │
            ┌───────┴────────┐
            │                │
      Valid │                │ Invalid
            ▼                ▼
       ┌─────────┐    ┌──────────────┐
       │ Proceed │    │ 401 Reject   │
       └────┬────┘    └──────────────┘
            │
            ▼
   ┌────────────────────┐
   │Extract organization│
   │  and user IDs      │
   └────────┬───────────┘
            │
            ▼
   ┌────────────────────┐
   │Add to request ctx  │
   └────────┬───────────┘
            │
            ▼
      ┌──────────────┐
      │Execute route │
      │handler with  │
      │auth context  │
      └──────────────┘
```

## Deployment Architecture

### Docker Compose Services

```
┌─────────────────────────────────────────────────┐
│         Docker Compose Network                  │
│  (secos-network - bridge network)              │
│                                                 │
│  ┌──────────────┐  ┌──────────────┐           │
│  │ PostgreSQL   │  │    Neo4j     │           │
│  │ :5432        │  │ :7687, :7474 │           │
│  └──────────────┘  └──────────────┘           │
│         ▲                  ▲                    │
│         │                  │                    │
│  ┌──────┴──────────────────┴──────┐           │
│  │      Backend (FastAPI)         │           │
│  │      :8000                     │           │
│  │  ┌──────────────────────────┐  │           │
│  │  │ app/main.py              │  │           │
│  │  │ - Routes                 │  │           │
│  │  │ - Business Logic         │  │           │
│  │  │ - Data Access            │  │           │
│  │  └──────────────────────────┘  │           │
│  └──────────────────────────────────┘           │
│           ▲                                     │
│           │                                     │
│  ┌────────┴────────────────────┐              │
│  │    Frontend (Next.js)       │              │
│  │    :3000                    │              │
│  │ ┌────────────────────────┐  │              │
│  │ │ pages/                 │  │              │
│  │ │ components/            │  │              │
│  │ │ styles/                │  │              │
│  │ └────────────────────────┘  │              │
│  └─────────────────────────────┘              │
│           ▲                                     │
└───────────┼─────────────────────────────────────┘
            │
       Nginx/Caddy
       Reverse Proxy
            │
        :80, :443
            │
         Internet
```

## Scalability Considerations

### Current Setup
- Single instance per service
- Suitable for MVP and small deployments
- ~100-1000 concurrent users

### Future Scaling
- Horizontal scaling with multiple backend instances
- Load balancer (Nginx, HAProxy)
- Database replication (PostgreSQL streaming replication)
- Neo4j cluster for high availability
- Caching layer (Redis) for frequently accessed data
- Message queue (RabbitMQ, Kafka) for async operations

## Monitoring & Observability

### Health Checks
- `/health` endpoint for container orchestration
- Database connection verification
- Neo4j connectivity check

### Logging
- Application logs to stdout (Docker)
- Structured logging for debugging
- Audit logs in database

### Future Enhancements
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Prometheus metrics
- Grafana dashboards
- Distributed tracing (Jaeger)
