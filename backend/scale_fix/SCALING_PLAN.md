# AI-SecOS Scaling Plan: 100+ Agents

## Why this matters

RC1 certification validated **correctness** at small scale (8 agents,
~140 runtime events). It did not validate **performance** at the scale
a real enterprise customer will hit — 100+ agents generating continuous
traffic across dozens of assets. This plan closes that gap.

---

## What breaks first, in order of how soon you'll feel it

| # | Bottleneck | Trigger | Symptom |
|---|---|---|---|
| 1 | Risk-history N+1 queries (60 round-trips per asset per page load) | Any customer opening the Risk Timeline page | Page takes seconds instead of milliseconds to load |
| 2 | Compliance summary (~36 queries per page load) | Anyone opening Reports or Dashboard | Dashboard load time creeps up as `runtime_events` grows |
| 3 | Missing composite indexes | `runtime_events`/`audit_logs` growing past ~100K-1M rows | All `COUNT()` queries slow down across the board |
| 4 | Table growth, no partitioning/archival | Months of continuous 100-agent traffic | Eventually: backup time, query planner degradation |

Items 1-3 are fixed in this delivery. Item 4 is a future-phase concern
(flagged below, not yet urgent).

---

## Fix 1: Composite database indexes

**File:** `backend/app/alembic/versions/0014_performance_indexes.py`

Adds 8 composite indexes covering every hot query path identified:
runtime event filtering by org+status+date, org+asset+status+date,
org+agent+date; audit log filtering by org+date and org+action+date;
incident filtering by org+status and org+date; risk score filtering
by org+severity; policy filtering by org+status.

These are additive and safe on a live database — no data migration,
no downtime required beyond the brief index-build time.

## Fix 2: Risk-history rewritten as one grouped query

**File:** `backend/risk_history_v2.py` (drop-in replacement function)

**Before:** `for day in range(30): query(); query()` — up to 60 round-trips.
**After:** One `GROUP BY DATE(created_at), status` query, computed
inside Postgres. Response time becomes independent of the `days`
parameter — a 30-day window costs the same as a 7-day window.

## Fix 3: Compliance summary caching

**Files:** `backend/cache.py` (general-purpose TTL cache utility),
`backend/patch_summary_cache.py` (wires a 10-minute cache into
`/reports/summary` specifically)

Reduces the ~36-query compliance summary load to once per 10 minutes
per organization, rather than once per page view. In-memory (no new
infrastructure dependency) — sufficient until you run multiple
backend replicas, at which point this becomes a Redis cache instead
(noted in the code comments for that future migration).

---

## Deployment order

```bash
cd ~/ai-secos

# 1. Database indexes
cp scale_fix/migrations/0014_performance_indexes.py backend/app/alembic/versions/
docker compose exec backend alembic upgrade head

# 2. Risk-history rewrite — manual merge into assets.py
#    (replace the existing get_asset_risk_history function with
#     the contents of scale_fix/backend/risk_history_v2.py)

# 3. Compliance summary cache
cp scale_fix/backend/cache.py backend/app/services/cache.py
cd backend
python3 ../scale_fix/backend/patch_summary_cache.py
cd ..

docker compose restart backend
```

---

## How to actually verify this works at scale (don't just trust it)

Generate synthetic load before claiming "100+ agents, no problem" to
a customer:

```
- Create 100 test agents via POST /agents
- Create 20 test assets via POST /assets
- Fire 10,000+ runtime decisions via POST /connectors/runtime/decision
  spread across random agent/asset/day combinations over 30 days
- Then re-run the RC1 certification's performance section
  (Section 9) against this loaded dataset
```

Compare before/after timings on:
- `GET /assets/{id}/risk-history?days=30`
- `GET /reports/summary`
- `GET /dashboard`

Target: all three should stay under the thresholds already defined in
`rc1_certify.py` (500ms / 2000ms / 3000ms respectively) even with
10,000+ runtime events in the table.

---

## What's NOT addressed yet (future phase, not urgent today)

- **Table partitioning** on `runtime_events` by month — only matters
  past several million rows, not a near-term concern
- **Redis-backed cache** instead of in-memory — only needed once you
  run more than one backend replica behind a load balancer
- **Read replicas** for reporting queries — only relevant at much
  higher concurrent user counts than a typical POC/early customer
- **Async background job for compliance scoring** instead of
  computed-on-request — worth revisiting if customers start asking
  for compliance scores updated more frequently than every 10 minutes

None of these are needed for "100+ agents" — they become relevant at
meaningfully larger scale (multiple customers, millions of events,
high concurrent dashboard users). Worth knowing they exist, not worth
building now.
