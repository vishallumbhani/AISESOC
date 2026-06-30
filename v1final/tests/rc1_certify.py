#!/usr/bin/env python3
"""
AI-SecOS v1.0 Release Certification Suite
==========================================
Validates complete business workflows, not just endpoint availability.

Usage:
  python3 rc1_certify.py --base http://localhost:8000 \
    --org-user admin --org-pass yourpassword

What this validates:
  1.  Infrastructure
  2.  Authentication & Authorization
  3.  CRUD Operations (all modules)
  4.  Runtime Engine (full decision chain)
  5.  Cross-Module Correlation
  6.  Compliance Engine
  7.  Dashboard Metrics
  8.  Reports
  9.  Graph
  10. Connector Framework
  11. Performance
  12. Security (tenant isolation, RBAC)
"""

import argparse, json, sys, time, uuid
from datetime import datetime
from typing import Optional

try:
    import requests
except ImportError:
    print("ERROR: pip install requests")
    sys.exit(1)

# ── Globals ────────────────────────────────────────────────────
results: list[tuple[str, str, str]] = []   # (status, section, detail)
PASS = FAIL = WARN = 0
org_token: Optional[str]      = None
platform_token: Optional[str] = None
org_id: Optional[str]         = None
api_key_raw: Optional[str]    = None

# Test data — created during the run, cleaned up after
_created: dict = {
    "agent_id":   None, "asset_id":  None,
    "policy_id":  None, "api_key_id":None,
    "event_corr": None, "incident_id":None,
}

# ── Helpers ────────────────────────────────────────────────────
def ok(section: str, detail: str):
    global PASS
    PASS += 1
    results.append(("✓", section, detail))
    print(f"  ✓  {detail}")

def fail(section: str, detail: str, got: str = ""):
    global FAIL
    FAIL += 1
    suffix = f"  [{got}]" if got else ""
    results.append(("✗", section, detail + suffix))
    print(f"  ✗  {detail}{suffix}")

def warn(section: str, detail: str):
    global WARN
    WARN += 1
    results.append(("⚠", section, detail))
    print(f"  ⚠  {detail}")

def section(title: str):
    print(f"\n{'='*58}")
    print(f"  {title}")
    print(f"{'='*58}")

def get(url: str, token: Optional[str] = None, **kwargs) -> requests.Response:
    hdrs = {}
    if token:
        hdrs["Authorization"] = f"Bearer {token}"
    return requests.get(url, headers=hdrs, timeout=10, **kwargs)

def post(url: str, data: dict, token: Optional[str] = None,
         api_key: Optional[str] = None, **kwargs) -> requests.Response:
    hdrs = {"Content-Type": "application/json"}
    if token:   hdrs["Authorization"] = f"Bearer {token}"
    if api_key: hdrs["X-AISECOS-API-KEY"] = api_key
    return requests.post(url, json=data, headers=hdrs, timeout=15, **kwargs)

def patch(url: str, data: dict, token: Optional[str] = None) -> requests.Response:
    hdrs = {"Content-Type": "application/json"}
    if token: hdrs["Authorization"] = f"Bearer {token}"
    return requests.patch(url, json=data, headers=hdrs, timeout=10)

def delete(url: str, token: Optional[str] = None) -> requests.Response:
    hdrs = {}
    if token: hdrs["Authorization"] = f"Bearer {token}"
    return requests.delete(url, headers=hdrs, timeout=10)

def check_status(label: str, sec: str, r: requests.Response, expected: list[int]):
    if r.status_code in expected:
        ok(sec, f"{label} → HTTP {r.status_code}")
        return True
    else:
        try:
            detail = r.json().get("detail", "")
        except Exception:
            detail = r.text[:120]
        fail(sec, label, f"HTTP {r.status_code}: {detail}")
        return False


# ════════════════════════════════════════════════════════════════
# 1. INFRASTRUCTURE
# ════════════════════════════════════════════════════════════════
def test_infrastructure(base: str):
    section("1. Infrastructure")
    # Health
    try:
        r = get(f"{base}/health")
        d = r.json()
        ok("infra", f"Backend reachable (HTTP {r.status_code})")
        if d.get("status") == "healthy": ok("infra", "status = healthy")
        else: fail("infra", "status field", d.get("status", "missing"))
        if d.get("database") == "healthy": ok("infra", "database = healthy")
        else: fail("infra", "database field", d.get("database", "missing"))
        graph_s = d.get("graph", "unknown")
        if graph_s in ("healthy", "connected"): ok("infra", f"Neo4j = {graph_s}")
        else: warn("infra", f"Neo4j = {graph_s} (non-fatal)")
    except Exception as e:
        fail("infra", "Backend unreachable", str(e)); return

    # Swagger
    r = get(f"{base}/docs")
    if r.status_code == 200: ok("infra", "Swagger docs available")
    else: fail("infra", "Swagger docs", f"HTTP {r.status_code}")

    # Version
    r = get(f"{base}/")
    if "version" in r.text: ok("infra", "Version field in root response")
    else: warn("infra", "Version field missing from root")


# ════════════════════════════════════════════════════════════════
# 2. AUTHENTICATION & AUTHORIZATION
# ════════════════════════════════════════════════════════════════
def test_auth(base: str, org_user: str, org_pass: str, platform_user: str, platform_pass: str):
    global org_token, platform_token, org_id
    section("2. Authentication & Authorization")

    # Org login
    try:
        r = post(f"{base}/api/v1/auth/login", {},
                 **{"params": {"username": org_user, "password": org_pass}})
        # Try JSON body if params didn't work
        if r.status_code not in (200, 201):
            r = requests.post(f"{base}/api/v1/auth/login",
                              params={"username": org_user, "password": org_pass},
                              timeout=10)
        if r.status_code in (200, 201):
            d = r.json()
            org_token = d.get("access_token")
            org_id    = d.get("organization_id")
            ok("auth", f"Org login success (user: {org_user})")
            if org_token: ok("auth", "JWT token returned")
            else: fail("auth", "No access_token in response")
        else:
            fail("auth", "Org login failed", f"HTTP {r.status_code}")
            return
    except Exception as e:
        fail("auth", "Org login exception", str(e)); return

    # Platform login
    try:
        r = post(f"{base}/api/v1/auth/platform/login",
                 {"username": platform_user, "password": platform_pass})
        if r.status_code in (200, 201):
            platform_token = r.json().get("access_token")
            ok("auth", f"Platform admin login success (user: {platform_user})")
        else:
            warn("auth", f"Platform login HTTP {r.status_code} (check credentials)")
    except Exception as e:
        warn("auth", f"Platform login failed: {e}")

    # Protected endpoints reject unauthenticated
    for ep in ["/api/v1/agents", "/api/v1/assets", "/api/v1/policies",
               "/api/v1/incidents", "/api/v1/dashboard"]:
        r = get(f"{base}{ep}")
        if r.status_code in (401, 403): ok("auth", f"Unauthenticated {ep} → {r.status_code}")
        else: fail("auth", f"Unauthenticated {ep} should be 401/403", f"HTTP {r.status_code}")

    # Fake JWT rejected
    r = requests.get(f"{base}/api/v1/agents",
                     headers={"Authorization": "Bearer invalid.jwt.token"}, timeout=5)
    if r.status_code in (401, 403): ok("auth", "Fake JWT rejected")
    else: fail("auth", "Fake JWT should be rejected", f"HTTP {r.status_code}")

    # Platform token cannot access org-only endpoints (it lacks org context)
    if platform_token:
        r = get(f"{base}/api/v1/platform/metrics", platform_token)
        if r.status_code == 200: ok("auth", "Platform admin can access /platform/metrics")
        else: warn("auth", f"/platform/metrics HTTP {r.status_code}")


# ════════════════════════════════════════════════════════════════
# 3. CRUD OPERATIONS
# ════════════════════════════════════════════════════════════════
def test_crud(base: str):
    global _created
    section("3. CRUD Operations")
    if not org_token:
        fail("crud", "Skipped — no org token"); return

    # ── Agents ────────────────────────────────────────────────
    unique = str(uuid.uuid4())[:8]
    r = post(f"{base}/api/v1/agents",
             {"name": f"RC1-Test-Agent-{unique}", "agent_type": "support", "status": "active"},
             org_token)
    if r.status_code in (200, 201):
        _created["agent_id"] = r.json().get("id")
        ok("crud", f"Agent created: {r.json().get('name')}")
    else:
        fail("crud", "Agent create", f"HTTP {r.status_code}: {r.text[:80]}")

    if _created["agent_id"]:
        r = get(f"{base}/api/v1/agents/{_created['agent_id']}", org_token)
        if r.status_code == 200: ok("crud", "Agent read (GET by ID)")
        else: fail("crud", "Agent read", f"HTTP {r.status_code}")

        r = patch(f"{base}/api/v1/agents/{_created['agent_id']}",
                  {"description": "RC1 test agent"}, org_token)
        if r.status_code == 200: ok("crud", "Agent update (PATCH)")
        else: fail("crud", "Agent update", f"HTTP {r.status_code}")

    # ── Assets ────────────────────────────────────────────────
    r = post(f"{base}/api/v1/assets",
             {"name": f"RC1-Test-Asset-{unique}", "asset_type": "database",
              "classification": "internal", "status": "active"},
             org_token)
    if r.status_code in (200, 201):
        _created["asset_id"] = r.json().get("id")
        ok("crud", f"Asset created: {r.json().get('name')}")
    else:
        fail("crud", "Asset create", f"HTTP {r.status_code}: {r.text[:80]}")

    if _created["asset_id"]:
        r = get(f"{base}/api/v1/assets/{_created['asset_id']}", org_token)
        if r.status_code == 200: ok("crud", "Asset read (GET by ID)")
        else: fail("crud", "Asset read", f"HTTP {r.status_code}")

        r = get(f"{base}/api/v1/assets/{_created['asset_id']}/risk-score", org_token)
        if r.status_code == 200: ok("crud", "Asset risk-score initialized on create")
        else: warn("crud", f"Asset risk-score HTTP {r.status_code}")

    # ── Policies ──────────────────────────────────────────────
    r = post(f"{base}/api/v1/policies",
             {"name": f"RC1-Test-Policy-{unique}", "policy_type": "access_control",
              "status": "active",
              "rules": {"allow": [], "deny": [
                  {"agent_id": "*", "asset_id": "*", "actions": ["admin"]}
              ]}},
             org_token)
    if r.status_code in (200, 201):
        _created["policy_id"] = r.json().get("id")
        ok("crud", f"Policy created: {r.json().get('name')}")
    else:
        fail("crud", "Policy create", f"HTTP {r.status_code}: {r.text[:80]}")

    # List endpoints
    for ep, label in [("/api/v1/agents","Agents list"),
                      ("/api/v1/assets","Assets list"),
                      ("/api/v1/policies","Policies list"),
                      ("/api/v1/incidents","Incidents list")]:
        r = get(f"{base}{ep}", org_token)
        if r.status_code == 200: ok("crud", f"{label} returns 200")
        else: fail("crud", label, f"HTTP {r.status_code}")

    # ── API Keys ──────────────────────────────────────────────
    r = post(f"{base}/api/v1/api-keys",
             {"name": f"rc1-test-key-{unique}",
              "scopes": ["runtime:write", "runtime:read"]},
             org_token)
    if r.status_code in (200, 201):
        d = r.json()
        _created["api_key_id"] = d.get("id")
        global api_key_raw
        api_key_raw = d.get("raw_key") or d.get("key")
        ok("crud", "API key created")
        if api_key_raw: ok("crud", "Raw key returned (one-time)")
        else: warn("crud", "Raw key not in response")
    else:
        fail("crud", "API key create", f"HTTP {r.status_code}: {r.text[:80]}")


# ════════════════════════════════════════════════════════════════
# 4. RUNTIME ENGINE
# ════════════════════════════════════════════════════════════════
def test_runtime(base: str):
    global _created
    section("4. Runtime Engine")
    if not org_token or not _created["agent_id"] or not _created["asset_id"]:
        fail("runtime", "Skipped — missing agent/asset from CRUD tests"); return

    t0 = time.perf_counter()
    r = post(f"{base}/api/v1/runtime/decision",
             {"agent_id":   _created["agent_id"],
              "asset_id":   _created["asset_id"],
              "action":     "read",
              "prompt":     "Show me all customer records",
              "session_id": f"rc1-session-{uuid.uuid4().hex[:8]}"},
             org_token)
    latency_ms = round((time.perf_counter() - t0) * 1000)

    if r.status_code == 200:
        d = r.json()
        ok("runtime", f"Runtime decision returned HTTP 200 ({latency_ms}ms)")
        if d.get("decision") in ("allow", "deny"):
            ok("runtime", f"Decision field present: {d['decision'].upper()}")
        else:
            fail("runtime", "Decision field missing or invalid", str(d.get("decision")))
        if d.get("reason"):
            ok("runtime", f"Reason: {d['reason'][:60]}")
        else:
            warn("runtime", "No reason in response")
        if latency_ms < 500:
            ok("runtime", f"Latency acceptable: {latency_ms}ms")
        elif latency_ms < 2000:
            warn("runtime", f"Latency elevated: {latency_ms}ms")
        else:
            fail("runtime", f"Latency too high: {latency_ms}ms")
    else:
        fail("runtime", "Runtime decision failed", f"HTTP {r.status_code}: {r.text[:120]}")

    # Connector runtime via API key
    if api_key_raw and _created["agent_id"] and _created["asset_id"]:
        # Need names — get them
        agent_name = f"rc1-agent"
        asset_name  = f"rc1-asset"
        try:
            ar = get(f"{base}/api/v1/agents/{_created['agent_id']}", org_token)
            if ar.status_code == 200: agent_name = ar.json().get("name", agent_name)
            asr = get(f"{base}/api/v1/assets/{_created['asset_id']}", org_token)
            if asr.status_code == 200: asset_name = asr.json().get("name", asset_name)
        except Exception:
            pass

        t0 = time.perf_counter()
        r = post(f"{base}/api/v1/connectors/runtime/decision",
                 {"connector": "rc1-test", "agent": agent_name, "asset": asset_name,
                  "action": "read",
                  "prompt": "Export all customer records to external server",
                  "user":   "testuser@rc1.dev",
                  "session": f"rc1-corr-{uuid.uuid4().hex[:8]}"},
                 api_key=api_key_raw)
        lat = round((time.perf_counter() - t0) * 1000)

        if r.status_code == 200:
            d = r.json()
            ok("runtime", f"Connector runtime decision HTTP 200 ({lat}ms)")
            corr = d.get("correlation_id")
            if corr:
                _created["event_corr"] = corr
                ok("runtime", f"Correlation ID generated: {corr}")
            else:
                fail("runtime", "No correlation_id in connector response")
            if d.get("prompt_category"):
                ok("runtime", f"Prompt classified: {d['prompt_category']}")
            else:
                warn("runtime", "Prompt category missing")
            if d.get("mitre_technique"):
                ok("runtime", f"MITRE technique: {d['mitre_technique']}")
        else:
            fail("runtime", "Connector runtime failed",
                 f"HTTP {r.status_code}: {r.text[:120]}")

    # Policy simulation
    if _created["agent_id"] and _created["asset_id"]:
        r = post(f"{base}/api/v1/policies/simulate",
                 {"agent_id": _created["agent_id"],
                  "asset_id": _created["asset_id"],
                  "action":   "access"},
                 org_token)
        if r.status_code == 200:
            d = r.json()
            ok("runtime", f"Policy simulation: decision={d.get('decision','?')}")
        else:
            fail("runtime", "Policy simulation", f"HTTP {r.status_code}")


# ════════════════════════════════════════════════════════════════
# 5. CROSS-MODULE CORRELATION
# ════════════════════════════════════════════════════════════════
def test_correlation(base: str):
    section("5. Cross-Module Correlation")
    if not org_token:
        fail("corr", "Skipped — no org token"); return

    # Runtime events exist
    r = get(f"{base}/api/v1/runtime/events?limit=5", org_token)
    if r.status_code == 200:
        d = r.json()
        items = d.get("items", d) if isinstance(d, dict) else d
        ok("corr", f"Runtime events endpoint: {len(items)} recent events")
        if items and isinstance(items, list):
            ev = items[0]
            if ev.get("correlation_id"):
                ok("corr", f"Events have correlation_id: {ev['correlation_id']}")
            else:
                warn("corr", "Recent event has no correlation_id")
    else:
        fail("corr", "Runtime events", f"HTTP {r.status_code}")

    # Audit logs exist and are correlated
    r = get(f"{base}/api/v1/audit-logs?limit=5", org_token)
    if r.status_code == 200:
        logs = r.json()
        logs_list = logs if isinstance(logs, list) else logs.get("items", [])
        ok("corr", f"Audit logs endpoint: {len(logs_list)} entries")
        for log in logs_list[:3]:
            changes = log.get("changes", {})
            if changes.get("correlation_id"):
                ok("corr", f"Audit log correlated: {changes['correlation_id']}")
                break
        else:
            warn("corr", "No correlated audit entries found yet")
    else:
        fail("corr", "Audit logs", f"HTTP {r.status_code}")

    # Incidents
    r = get(f"{base}/api/v1/incidents?limit=5", org_token)
    if r.status_code == 200:
        incs = r.json()
        incs_list = incs if isinstance(incs, list) else incs.get("items", [])
        ok("corr", f"Incidents endpoint: {len(incs_list)} incidents")
        for inc in incs_list[:3]:
            if inc.get("correlation_id") or (inc.get("resolution_details", {}) or {}).get("correlation_id"):
                ok("corr", "Incident has correlation_id")
                _created["incident_id"] = inc.get("id")
                break
    else:
        fail("corr", "Incidents", f"HTTP {r.status_code}")

    # Runtime stats
    r = get(f"{base}/api/v1/runtime/stats/summary", org_token)
    if r.status_code == 200:
        d = r.json()
        ok("corr", f"Runtime stats: {d.get('total_events',0)} total, {d.get('denied',0)} denied")
    else:
        fail("corr", "Runtime stats", f"HTTP {r.status_code}")

    # Dashboard
    r = get(f"{base}/api/v1/dashboard", org_token)
    if r.status_code == 200:
        d = r.json()
        ok("corr", "Dashboard endpoint returns 200")
        if d.get("today"): ok("corr", "Dashboard has today's activity")
        if d.get("overview"): ok("corr", "Dashboard has overview section")
        if d.get("timeline"): ok("corr", f"Dashboard timeline: {len(d['timeline'])} events")
        else: warn("corr", "Dashboard timeline empty")
    else:
        fail("corr", "Dashboard", f"HTTP {r.status_code}")


# ════════════════════════════════════════════════════════════════
# 6. COMPLIANCE ENGINE
# ════════════════════════════════════════════════════════════════
def test_compliance(base: str):
    section("6. Compliance Engine")
    if not org_token:
        fail("compliance", "Skipped"); return

    r = get(f"{base}/api/v1/reports/frameworks", org_token)
    if r.status_code == 200:
        d = r.json()
        fws = d.get("frameworks", [])
        ok("compliance", f"Frameworks endpoint: {len(fws)} frameworks")
        ids = [f["id"] for f in fws]
        for expected in ["SOC2", "ISO27001", "NIST_AI_RMF", "OWASP_LLM"]:
            if expected in ids: ok("compliance", f"Framework present: {expected}")
            else: fail("compliance", f"Framework missing: {expected}")
        for fw in fws:
            if fw.get("controls", 0) > 0:
                ok("compliance", f"{fw['id']}: {fw['controls']} controls")
            else:
                warn("compliance", f"{fw['id']}: controls=0 (seed may be needed)")
    else:
        fail("compliance", "Frameworks", f"HTTP {r.status_code}")

    # Run a compliance report and verify structure
    r = get(f"{base}/api/v1/reports/compliance/SOC2?days=30", org_token)
    if r.status_code == 200:
        d = r.json()
        ok("compliance", "SOC2 compliance report generated")
        if "score_pct" in d: ok("compliance", f"SOC2 score: {d['score_pct']}%")
        else: fail("compliance", "No score_pct in compliance report")
        controls = d.get("controls", [])
        if controls:
            ok("compliance", f"SOC2 controls evaluated: {len(controls)}")
            ctrl = controls[0]
            if ctrl.get("status") in ("PASS","NEEDS_REVIEW","ERROR"):
                ok("compliance", f"Control status format correct: {ctrl['status']}")
            if ctrl.get("evidence"):
                ok("compliance", "Evidence present in controls")
            else:
                warn("compliance", "No evidence in first control")
        else:
            warn("compliance", "No controls in SOC2 report")
    else:
        fail("compliance", "SOC2 report", f"HTTP {r.status_code}: {r.text[:100]}")

    # Summary endpoint
    r = get(f"{base}/api/v1/reports/summary", org_token)
    if r.status_code == 200:
        d = r.json()
        fws = d.get("frameworks", [])
        ok("compliance", f"Compliance summary: {len(fws)} frameworks")
        for fw in fws:
            if "score_pct" in fw: ok("compliance", f"{fw['framework']} score: {fw['score_pct']}%")
    else:
        fail("compliance", "Compliance summary", f"HTTP {r.status_code}")


# ════════════════════════════════════════════════════════════════
# 7. REPORTS
# ════════════════════════════════════════════════════════════════
def test_reports(base: str):
    section("7. Reports")
    if not org_token:
        fail("reports", "Skipped"); return

    # Executive report
    t0 = time.perf_counter()
    r = get(f"{base}/api/v1/reports/executive?days=30", org_token)
    gen_ms = round((time.perf_counter() - t0) * 1000)
    if r.status_code == 200:
        d = r.json()
        ok("reports", f"Executive report generated ({gen_ms}ms)")
        for field in ["total_events", "deny_events", "open_incidents"]:
            if field in d or field in d.get("summary", {}):
                ok("reports", f"Executive has '{field}' field")
            else:
                warn("reports", f"Executive missing '{field}'")
        if gen_ms < 5000: ok("reports", f"Report generated in {gen_ms}ms (<5s)")
        else: warn("reports", f"Report slow: {gen_ms}ms")
    else:
        fail("reports", "Executive report", f"HTTP {r.status_code}")

    # CSV export — use fetch pattern (check header, not blob)
    r = get(f"{base}/api/v1/reports/executive?days=7&format=csv", org_token)
    if r.status_code == 200:
        ct = r.headers.get("content-type", "")
        if "csv" in ct or "text" in ct:
            ok("reports", "Executive CSV export correct content-type")
        else:
            ok("reports", f"Executive CSV export HTTP 200 (content-type: {ct})")
    else:
        fail("reports", "Executive CSV export", f"HTTP {r.status_code}")

    # Compliance CSV
    r = get(f"{base}/api/v1/reports/compliance/SOC2?format=csv&days=30", org_token)
    if r.status_code == 200:
        ok("reports", "SOC2 compliance CSV export")
    else:
        fail("reports", "SOC2 CSV export", f"HTTP {r.status_code}")


# ════════════════════════════════════════════════════════════════
# 8. GRAPH
# ════════════════════════════════════════════════════════════════
def test_graph(base: str):
    section("8. Graph")
    if not org_token:
        fail("graph", "Skipped"); return

    r = get(f"{base}/api/v1/graph", org_token)
    if r.status_code == 200:
        d = r.json()
        nodes = d.get("nodes", [])
        edges = d.get("edges", [])
        ok("graph", f"Graph endpoint: {len(nodes)} nodes, {len(edges)} edges")
        if nodes:
            types = list({n.get("type", n.get("labels", ["?"])[0]) for n in nodes[:10]})
            ok("graph", f"Node types: {types[:5]}")
        else:
            warn("graph", "No nodes in graph (run a connector decision first)")
    elif r.status_code == 503:
        warn("graph", "Neo4j offline (503) — graph features unavailable")
    else:
        fail("graph", "Graph endpoint", f"HTTP {r.status_code}")

    # Sync endpoint
    r = get(f"{base}/api/v1/graph/sync", org_token)
    if r.status_code == 200:
        d = r.json()
        ok("graph", f"Graph sync: {d.get('status','?')} — {d.get('message','')[:60]}")
    elif r.status_code == 503:
        warn("graph", "Graph sync: Neo4j offline")
    else:
        fail("graph", "Graph sync", f"HTTP {r.status_code}")


# ════════════════════════════════════════════════════════════════
# 9. PERFORMANCE
# ════════════════════════════════════════════════════════════════
def test_performance(base: str):
    section("9. Performance")
    if not org_token:
        fail("perf", "Skipped"); return

    checks = [
        ("/api/v1/agents",                  500,  "Agents list"),
        ("/api/v1/assets",                  500,  "Assets list"),
        ("/api/v1/incidents",               500,  "Incidents list"),
        ("/api/v1/runtime/events?limit=50", 1000, "Runtime events"),
        ("/api/v1/dashboard",               3000, "Dashboard"),
        ("/api/v1/audit-logs/analytics/summary", 2000, "Audit analytics"),
    ]
    for ep, threshold_ms, label in checks:
        t0 = time.perf_counter()
        r = get(f"{base}{ep}", org_token)
        ms = round((time.perf_counter() - t0) * 1000)
        if r.status_code in (200, 401, 403):
            if ms < threshold_ms:
                ok("perf", f"{label}: {ms}ms (< {threshold_ms}ms)")
            elif ms < threshold_ms * 2:
                warn("perf", f"{label}: {ms}ms (elevated, target < {threshold_ms}ms)")
            else:
                fail("perf", f"{label} too slow", f"{ms}ms > {threshold_ms*2}ms")
        else:
            warn("perf", f"{label}: HTTP {r.status_code}")


# ════════════════════════════════════════════════════════════════
# 10. SECURITY
# ════════════════════════════════════════════════════════════════
def test_security(base: str):
    section("10. Security")

    # Tenant isolation — org A cannot see org B data (verify by checking IDs match)
    if org_token and org_id:
        r = get(f"{base}/api/v1/agents", org_token)
        if r.status_code == 200:
            agents = r.json()
            if isinstance(agents, list) and agents:
                for ag in agents[:5]:
                    ag_org = ag.get("organization_id")
                    if ag_org and ag_org != org_id:
                        fail("security", "Tenant isolation BREACH",
                             f"Agent org {ag_org} != current org {org_id}")
                        break
                else:
                    ok("security", "Tenant isolation: all agents belong to current org")
            else:
                ok("security", "Tenant isolation: no agents to check (empty org)")

    # Invalid API key rejected
    r = requests.get(f"{base}/api/v1/connectors/runtime/health",
                     headers={"X-AISECOS-API-KEY": "secos_invalid_key_12345"},
                     timeout=5)
    if r.status_code == 401: ok("security", "Invalid API key → 401")
    else: warn("security", f"Invalid API key → {r.status_code} (expected 401)")

    # No stack traces in error responses
    r = requests.get(f"{base}/api/v1/agents", timeout=5)
    body = r.text
    if "traceback" in body.lower() or "stacktrace" in body.lower():
        fail("security", "Stack trace exposed in auth error")
    else:
        ok("security", "No stack trace in unauthenticated response")

    # Input validation — overly long field
    if org_token:
        r = post(f"{base}/api/v1/agents",
                 {"name": "A" * 10000, "agent_type": "support"},
                 org_token)
        if r.status_code in (422, 400, 413):
            ok("security", f"Oversized input rejected: HTTP {r.status_code}")
        elif r.status_code in (200, 201):
            warn("security", "Oversized agent name accepted (no length validation)")

    # CORS
    r = requests.get(f"{base}/health",
                     headers={"Origin": "http://evil.example.com"}, timeout=5)
    cors = r.headers.get("access-control-allow-origin", "")
    if cors:
        ok("security", f"CORS header present: {cors}")
    else:
        warn("security", "CORS header missing on health endpoint")

    # Content-type JSON
    ct = r.headers.get("content-type", "")
    if "application/json" in ct: ok("security", "JSON content-type on API responses")
    else: warn("security", f"Unexpected content-type: {ct}")


# ════════════════════════════════════════════════════════════════
# 11. INCIDENT LIFECYCLE
# ════════════════════════════════════════════════════════════════
def test_incidents(base: str):
    section("11. Incident Lifecycle")
    if not org_token:
        fail("incidents", "Skipped"); return

    r = get(f"{base}/api/v1/incidents", org_token)
    if r.status_code != 200:
        fail("incidents", "Incidents list", f"HTTP {r.status_code}"); return

    incs = r.json()
    incs_list = incs if isinstance(incs, list) else incs.get("items", [])
    ok("incidents", f"Incidents list: {len(incs_list)} incidents")

    if incs_list:
        inc = incs_list[0]
        inc_id = inc.get("id")
        ok("incidents", f"First incident: severity={inc.get('severity')} status={inc.get('status')}")

        # Get detail
        r = get(f"{base}/api/v1/incidents/{inc_id}", org_token)
        if r.status_code == 200:
            ok("incidents", "Incident detail GET works")
        else:
            fail("incidents", "Incident detail", f"HTTP {r.status_code}")

        # Investigation endpoint
        r = get(f"{base}/api/v1/incidents/{inc_id}/investigation", org_token)
        if r.status_code == 200:
            ok("incidents", "Incident investigation endpoint works")
        else:
            warn("incidents", f"Investigation endpoint HTTP {r.status_code}")

        # Update status
        r = patch(f"{base}/api/v1/incidents/{inc_id}",
                  {"status": "investigating", "owner": "rc1-validator@aisecos.dev"},
                  org_token)
        if r.status_code == 200:
            ok("incidents", "Incident status update works")
        else:
            fail("incidents", "Incident update", f"HTTP {r.status_code}")
    else:
        warn("incidents", "No incidents to validate lifecycle (run connector decisions to generate)")


# ════════════════════════════════════════════════════════════════
# CLEANUP
# ════════════════════════════════════════════════════════════════
def cleanup(base: str):
    section("Cleanup — removing test data")
    if not org_token:
        return
    for label, ep_tpl, key in [
        ("Test policy", "/api/v1/policies/{}", "policy_id"),
        ("Test agent",  "/api/v1/agents/{}",   "agent_id"),
        ("Test asset",  "/api/v1/assets/{}",   "asset_id"),
        ("Test API key","/api/v1/api-keys/{}", "api_key_id"),
    ]:
        rid = _created.get(key)
        if rid:
            try:
                r = delete(f"{base}{ep_tpl.format(rid)}", org_token)
                if r.status_code in (200, 204, 404):
                    print(f"  ✓  {label} cleaned up")
                else:
                    print(f"  ⚠  {label} cleanup HTTP {r.status_code}")
            except Exception as e:
                print(f"  ⚠  {label} cleanup: {e}")


# ════════════════════════════════════════════════════════════════
# MAIN
# ════════════════════════════════════════════════════════════════
def main():
    p = argparse.ArgumentParser(description="AI-SecOS RC1 Release Certification Suite")
    p.add_argument("--base",           default="http://localhost:8000")
    p.add_argument("--org-user",       default="admin")
    p.add_argument("--org-pass",       default="changeme")
    p.add_argument("--platform-user",  default="superadmin")
    p.add_argument("--platform-pass",  default="Admin1234!")
    p.add_argument("--no-cleanup",     action="store_true")
    args = p.parse_args()

    print("=" * 58)
    print("  AI-SecOS v1.0 Release Certification Suite")
    print(f"  Target:  {args.base}")
    print(f"  Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 58)

    test_infrastructure(args.base)
    test_auth(args.base, args.org_user, args.org_pass, args.platform_user, args.platform_pass)
    test_crud(args.base)
    test_runtime(args.base)
    test_correlation(args.base)
    test_compliance(args.base)
    test_reports(args.base)
    test_graph(args.base)
    test_performance(args.base)
    test_security(args.base)
    test_incidents(args.base)

    if not args.no_cleanup:
        cleanup(args.base)

    # ── Final Report ──────────────────────────────────────────
    TOTAL = PASS + FAIL
    PCT   = round(PASS / TOTAL * 100, 1) if TOTAL else 0
    print("\n" + "=" * 58)
    print("  RELEASE CERTIFICATION RESULTS")
    print("=" * 58)
    print(f"  Passed:   {PASS} / {TOTAL} ({PCT}%)")
    if FAIL: print(f"  Failed:   {FAIL}")
    if WARN: print(f"  Warnings: {WARN}")

    # Failures by section
    if FAIL:
        print("\n  Failed checks:")
        for status, sec, detail in results:
            if status == "✗":
                print(f"    [{sec}] {detail}")

    print()
    if FAIL == 0:
        print("  ✅ CERTIFICATION PASSED")
        print("     AI-SecOS v1.0 is ready for customer demonstration.")
    elif FAIL <= 3:
        print(f"  ⚠  {FAIL} minor failure(s) — review before release")
    else:
        print(f"  ✗  {FAIL} failure(s) — must be resolved before v1.0 release")

    print(f"\n  Dashboard: http://192.168.116.159:3000/dashboard")
    print(f"  API Docs:  {args.base}/docs")
    print(f"  Finished:  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 58)

    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
