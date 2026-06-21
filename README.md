# AI-SecOS - AI Security Operations System MVP

## Overview

AI-SecOS is a comprehensive security operations platform designed to manage, monitor, and control AI agents' access to sensitive assets and data sources. It combines policy-based access control, runtime decision-making, and risk scoring to ensure secure AI operations.

## Features

### Core Features
- **Asset Inventory Management**: Track all assets, data sources, and resources
- **Agent Management**: Register and manage AI agents with metadata and capabilities
- **Policy Engine**: Define fine-grained policies for access control
- **Risk Scoring**: Automated risk assessment for assets using multiple factors
- **Runtime Decision Making**: Real-time policy evaluation for agent requests
- **Graph Database**: Neo4j for relationship mapping and path analysis
- **Audit Logging**: Complete audit trail of all operations

### Security Features
- JWT-based authentication
- Password hashing with bcrypt
- Organization-based multi-tenancy
- Role-based access control (RBAC)
- Policy-based access control (PBAC)

## Architecture

### Backend Stack
- **Framework**: FastAPI (Python 3.11)
- **Database**: PostgreSQL 15
- **Graph DB**: Neo4j 5.11
- **Authentication**: JWT with python-jose
- **ORM**: SQLAlchemy 2.0

### Frontend Stack
- **Framework**: Next.js 14
- **Styling**: Tailwind CSS
- **State Management**: React Context API
- **HTTP Client**: axios

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Networking**: Docker Compose networks
- **Volume Management**: Named volumes for persistence

## Project Structure

```
ai-secos/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py              # FastAPI app
│   │   ├── config.py            # Configuration
│   │   ├── database.py          # Database setup
│   │   ├── models.py            # SQLAlchemy models
│   │   ├── schemas.py           # Pydantic schemas
│   │   ├── security.py          # JWT & password utilities
│   │   ├── policy_engine.py     # Policy evaluation
│   │   ├── risk_engine.py       # Risk scoring
│   │   ├── graph.py             # Neo4j handler
│   │   └── routes/
│   │       ├── __init__.py
│   │       ├── auth.py          # Authentication routes
│   │       ├── assets.py        # Asset CRUD
│   │       ├── agents.py        # Agent CRUD
│   │       ├── policies.py      # Policy CRUD
│   │       ├── runtime.py       # Runtime decisions
│   │       ├── risk_scores.py   # Risk scoring
│   │       └── health.py        # Health checks
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── pages/
│   ├── components/
│   ├── styles/
│   ├── package.json
│   └── Dockerfile
├── infra/
│   └── postgres/
│       └── init.sql             # Database schema
├── docs/
│   ├── API.md                   # API documentation
│   ├── DEPLOYMENT.md            # Deployment guide
│   └── ARCHITECTURE.md          # Architecture docs
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

## Quick Start

### Prerequisites
- Docker & Docker Compose
- Python 3.11+ (for local development)
- Node.js 18+ (for frontend development)

### Using Docker Compose

1. **Clone the repository**
   ```bash
   git clone https://github.com/vishallumbhani/ai-secos.git
   cd ai-secos
   ```

2. **Copy environment file**
   ```bash
   cp .env.example .env
   ```

3. **Start services**
   ```bash
   docker-compose up -d
   ```

4. **Access services**
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs
   - Frontend: http://localhost:3000
   - PostgreSQL: localhost:5432
   - Neo4j: http://localhost:7474 (browser)

### Local Development

#### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp ../.env.example .env

# Run migrations (if using Alembic)
alembic upgrade head

# Start server
uvicorn app.main:app --reload
```

#### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local

# Start development server
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user

### Assets
- `GET /api/v1/assets` - List assets
- `POST /api/v1/assets` - Create asset
- `GET /api/v1/assets/{id}` - Get asset
- `PATCH /api/v1/assets/{id}` - Update asset
- `DELETE /api/v1/assets/{id}` - Delete asset
- `GET /api/v1/assets/{id}/risk-score` - Get asset risk score

### Agents
- `GET /api/v1/agents` - List agents
- `POST /api/v1/agents` - Create agent
- `GET /api/v1/agents/{id}` - Get agent

### Policies
- `GET /api/v1/policies` - List policies
- `POST /api/v1/policies` - Create policy
- `GET /api/v1/policies/{id}` - Get policy

### Runtime Decisions
- `POST /api/v1/runtime/decision` - Make runtime access decision

### Risk Scores
- `GET /api/v1/risk-scores` - List risk scores
- `POST /api/v1/risk-scores/recalculate/{asset_id}` - Recalculate risk score

### Health
- `GET /health` - Health check

## Database Schema

### Tables (14 total)

1. **organizations** - Organization/tenant management
2. **users** - User accounts with organization association
3. **assets** - Assets to be managed and protected
4. **agents** - AI agents requiring access control
5. **models** - ML/LLM models used by agents
6. **tools** - Tools available to agents
7. **mcp_servers** - Model Context Protocol servers
8. **data_sources** - Data sources agents access
9. **policies** - Access control policies
10. **risk_scores** - Risk assessment for assets
11. **runtime_events** - Runtime access events
12. **incidents** - Security incidents
13. **audit_logs** - Complete audit trail
14. **relationships** - Neo4j relationships between entities

## Risk Scoring Algorithm

Risk Score = (DS × 0.30) + (PL × 0.25) + (TS × 0.20) + (PG × 0.10) × ENV_MULTIPLIER

Where:
- **DS** = Data Sensitivity (0-100)
- **PL** = Permission Level (0-100)
- **TS** = Trust Score (0-100, inverted)
- **PG** = Policy Gap (0-100)
- **ENV_MULTIPLIER** = Environment factor (Production: 1.0, Staging: 0.7, Dev: 0.3)

Severity Levels:
- **Critical**: Score ≥ 80
- **High**: Score ≥ 60
- **Medium**: Score ≥ 40
- **Low**: Score ≥ 20
- **Minimal**: Score < 20

## Configuration

Edit `.env` file to configure:

```env
# Database
POSTGRES_USER=secos_user
POSTGRES_PASSWORD=your_password
POSTGRES_DB=ai_secos_db
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

# Neo4j
NEO4J_AUTH=neo4j/password
NEO4J_HOST=neo4j
NEO4J_PORT=7687

# Security
SECRET_KEY=your-secret-key-here
JWT_ALGORITHM=HS256
JWT_EXPIRATION_HOURS=24

# API
FASTAPI_ENV=development
FASTAPI_DEBUG=true
FASTAPI_HOST=0.0.0.0
FASTAPI_PORT=8000
```

## Development Guide

### Adding a New Route

1. Create schema in `app/schemas.py`
2. Create model in `app/models.py` (if new entity)
3. Create route file in `app/routes/`
4. Import in `app/routes/__init__.py`
5. Include router in `app/main.py`

### Database Migrations (using Alembic)

```bash
# Create migration
alembic revision --autogenerate -m "description"

# Apply migration
alembic upgrade head

# Rollback
alembic downgrade -1
```

## Testing

```bash
# Run tests
pytest

# With coverage
pytest --cov=app

# Specific test file
pytest tests/test_assets.py
```

## Deployment

See `docs/DEPLOYMENT.md` for production deployment guide.

## Contributing

1. Create a feature branch
2. Make your changes
3. Write tests
4. Submit a pull request

## License

MIT License - See LICENSE file for details

## Support

For issues and questions, please use GitHub Issues.

## Roadmap

- [ ] Advanced policy templates
- [ ] ML-based anomaly detection
- [ ] Real-time streaming events
- [ ] Advanced graph analytics
- [ ] Mobile app
- [ ] CLI tool
- [ ] Kubernetes deployment
- [ ] GitOps integration

## Authors

- Vishal Lumbhani - [@vishallumbhani](https://github.com/vishallumbhani)
