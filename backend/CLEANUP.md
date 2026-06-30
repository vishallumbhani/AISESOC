# AI-SecOS Cleanup Guide

## Problem

The repository contained two Python packages:

```
backend/app/          ← correct location
backend/app/app/      ← duplicate (should not exist)
```

Because `PYTHONPATH=/app` is set in the container, Python resolved
`from app.models import ...` against whichever package it found first.
Different runs could load different versions of `models.py` and `graph.py`,
causing "column does not exist" errors and graph state corruption.

---

## Step 1 — Remove the duplicate package

Run inside the container (or on the host in the `backend/` directory):

```bash
# Verify the duplicate exists
find /app/app -maxdepth 1 -type d

# Remove it
rm -rf /app/app/app/

# Verify it is gone
find /app/app/app 2>/dev/null && echo "STILL EXISTS" || echo "Removed OK"
```

---

## Step 2 — Verify no code references the duplicate path

```bash
grep -R "app\.app\." /app/app  --include="*.py" -n
# Expected: no output
```

---

## Step 3 — Copy the fixed files

| File | Destination |
|------|-------------|
| `graph.py`              | `backend/app/graph.py`                              |
| `models.py`             | `backend/app/models.py`                             |
| `main.py`               | `backend/app/main.py`                               |
| `seed.py`               | `backend/seed.py`                                   |
| `reset_graph.py`        | `backend/reset_graph.py`                            |
| `0003_unique_constraints.py` | `backend/alembic/versions/0003_unique_constraints.py` |
| `docker-compose.yml`    | project root `docker-compose.yml`                   |

---

## Step 4 — Apply the migration

```bash
docker compose exec backend alembic upgrade head
```

Expected output includes:
```
Running upgrade 0002_policy_versions -> 0003_unique_constraints
+ uq_agents_org_name added on agents
+ uq_assets_org_name added on assets
+ uq_policies_org_name added on policies
```

---

## Step 5 — Reseed cleanly

```bash
# Clear Neo4j and reseed everything from scratch
docker compose exec backend python seed.py --reset-graph

# Or: clear Neo4j only (keep Postgres data)
docker compose exec backend python reset_graph.py --yes
```

---

## Step 6 — Acceptance validation

```bash
# 1. No duplicate package
find /app/app/app 2>/dev/null && echo "FAIL" || echo "PASS: no duplicate"

# 2. No app.app imports
grep -R "app\.app" /app/app --include="*.py" -n
# Expected: no output

# 3. Neo4j node count after clean reseed (should be deterministic)
docker compose exec neo4j cypher-shell -u neo4j -p password \
  "MATCH (n) RETURN labels(n)[0] AS label, count(n) AS count ORDER BY label"

# Expected (after seed.py --reset-graph):
# label        | count
# "Agent"      | 4
# "Asset"      | 5

# 4. No duplicate Postgres records
docker compose exec backend python -c "
from app.database import SessionLocal
from app.models import Agent, Asset, Policy
from sqlalchemy import func
db = SessionLocal()
for model, label in [(Agent,'agents'), (Asset,'assets'), (Policy,'policies')]:
    dupes = db.query(model.name, func.count(model.id)).group_by(model.name).having(func.count(model.id)>1).all()
    print(f'{label}: {len(dupes)} duplicates' if dupes else f'{label}: OK')
db.close()
"
```

---

## Startup logs to expect

After the fix, every container start logs:

```
INFO  Starting AI-SecOS
INFO  Loaded models module : /app/app/models.py
INFO  Loaded graph module  : /app/app/graph.py
INFO  Neo4j connected      : True          ← or False if Neo4j is down (not a crash)
INFO  Running database migrations ...
INFO  Migrations complete.
```

If you ever see a path like `/app/app/app/models.py` in those logs,
the duplicate package was not fully removed.
