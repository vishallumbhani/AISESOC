#!/usr/bin/env python3
"""
seed.py -- Idempotent database + graph seeder.

Usage:
    python seed.py                 # seed Postgres + Neo4j (safe to re-run)
    python seed.py --reset-graph   # clear Neo4j first, then seed everything
    python seed.py --graph-only    # reset + seed Neo4j only (skip Postgres)

Idempotency strategy (Postgres):
  - Uses get-or-create for every record: checks by (org_id, name) before inserting.
  - Safe to run multiple times without creating duplicates.
  - Relies on UniqueConstraint(organization_id, name) on agents/assets/policies
    as a DB-level safety net.

Neo4j:
  - With --reset-graph: runs MATCH (n) DETACH DELETE n first.
  - Without the flag: uses MERGE so re-running is safe too.
"""

import sys
import os
import argparse
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

# Ensure the app package is importable when running from backend/
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, engine, Base
from app.models import (
    Organization, User, Agent, Asset, Policy,
    RiskScore, DataSource, Tool,
)
from app.security import get_password_hash
from app.graph import get_graph_db
from app.risk_engine import RiskEngine
import inspect
import app.models as _models_module
import app.graph as _graph_module


# ── Startup validation logging ────────────────────────────────────

def _log_loaded_modules():
    logger.info(f"Loaded models module : {inspect.getfile(_models_module)}")
    logger.info(f"Loaded graph module  : {inspect.getfile(_graph_module)}")
    graph = get_graph_db()
    logger.info(f"Neo4j connected      : {graph.connected}")


# ── Helpers ────────────────────────────────────────────────────────

def _get_or_create(db, model, defaults: dict, **lookup):
    """
    Return (instance, created).
    Looks up by **lookup fields; creates with {**lookup, **defaults} if absent.
    """
    instance = db.query(model).filter_by(**lookup).first()
    if instance:
        return instance, False
    instance = model(**lookup, **defaults)
    db.add(instance)
    db.flush()
    return instance, True


# ── Postgres seed ─────────────────────────────────────────────────

def seed_postgres():
    logger.info("Seeding PostgreSQL...")
    db = SessionLocal()
    try:
        # Ensure tables exist
        Base.metadata.create_all(bind=engine)

        # ── Organization ───────────────────────────────────────────
        org, created = _get_or_create(
            db, Organization,
            defaults={"description": "Default organisation for AI-SecOS"},
            name="Default Organization",
        )
        if created:
            logger.info(f"  Created organisation: {org.name}")
        else:
            logger.info(f"  Organisation exists : {org.name}")

        # ── Admin user ─────────────────────────────────────────────
        user, created = _get_or_create(
            db, User,
            defaults={
                "email":         "admin@secos.local",
                "password_hash": get_password_hash("admin123"),
                "role":          "admin",
                "is_active":     True,
            },
            organization_id=org.id,
            username="admin",
        )
        if created:
            logger.info(f"  Created user        : {user.username} / admin123")
        else:
            logger.info(f"  User exists         : {user.username}")

        # ── Assets ─────────────────────────────────────────────────
        asset_specs = [
            {"name": "Payroll Database",      "asset_type": "database", "classification": "restricted"},
            {"name": "Customer CRM",          "asset_type": "database", "classification": "confidential"},
            {"name": "Internal Wiki",         "asset_type": "api",      "classification": "internal"},
            {"name": "Public API Gateway",    "asset_type": "api",      "classification": "public"},
            {"name": "HR Document Storage",   "asset_type": "storage",  "classification": "confidential"},
        ]
        CLASS_SENSITIVITY = {
            "public": 10, "internal": 40, "confidential": 70, "restricted": 95,
        }
        assets = {}
        for spec in asset_specs:
            asset, created = _get_or_create(
                db, Asset,
                defaults={
                    "asset_type":     spec["asset_type"],
                    "classification": spec["classification"],
                    "status":         "active",
                    "created_by":     user.id,
                },
                organization_id=org.id,
                name=spec["name"],
            )
            assets[spec["name"]] = asset
            # Seed risk score if none exists
            rs = db.query(RiskScore).filter(
                RiskScore.asset_id == asset.id,
                RiskScore.organization_id == org.id,
            ).first()
            if not rs:
                sens = CLASS_SENSITIVITY.get(spec["classification"], 40)
                result = RiskEngine.calculate_risk_score(
                    data_sensitivity=sens, permission_level=30,
                    trust_score=60, environment="production", policy_gap=10,
                )
                rs = RiskScore(
                    organization_id=org.id, asset_id=asset.id,
                    score=result["score"], severity=result["severity"],
                    data_sensitivity=sens, permission_level=30, trust_score=60,
                    environment="production", policy_gap=10,
                    recommendation=result["recommendation"],
                )
                db.add(rs)
            logger.info(f"  {'Created' if created else 'Exists '} asset : {asset.name}")

        # ── Agents ─────────────────────────────────────────────────
        agent_specs = [
            {"name": "Support Agent",    "agent_type": "support"},
            {"name": "Finance Agent",    "agent_type": "finance"},
            {"name": "Analytics Agent",  "agent_type": "analytics"},
            {"name": "HR Agent",         "agent_type": "hr"},
        ]
        agents = {}
        for spec in agent_specs:
            agent, created = _get_or_create(
                db, Agent,
                defaults={
                    "agent_type": spec["agent_type"],
                    "status":     "active",
                    "created_by": user.id,
                },
                organization_id=org.id,
                name=spec["name"],
            )
            agents[spec["name"]] = agent
            logger.info(f"  {'Created' if created else 'Exists '} agent : {agent.name}")

        # ── Policies ───────────────────────────────────────────────
        support_agent_id = str(agents["Support Agent"].id)
        payroll_id       = str(assets["Payroll Database"].id)
        crm_id           = str(assets["Customer CRM"].id)

        policy_specs = [
            {
                "name":        "Block Support from Payroll",
                "policy_type": "access_control",
                "priority":    10,
                "rules": {
                    "deny": [{
                        "agent_id": support_agent_id,
                        "asset_id": payroll_id,
                        "actions":  ["access", "read", "write", "delete"],
                    }],
                    "allow": [],
                },
            },
            {
                "name":        "Allow Support to CRM",
                "policy_type": "access_control",
                "priority":    20,
                "rules": {
                    "allow": [{
                        "agent_id": support_agent_id,
                        "asset_id": crm_id,
                        "actions":  ["access", "read"],
                    }],
                    "deny": [],
                },
            },
            {
                "name":        "Restrict Restricted Assets",
                "policy_type": "data_classification",
                "priority":    5,
                "description": "No agent may write to restricted assets without explicit allow",
                "rules": {
                    "deny": [{
                        "agent_id": "*",
                        "asset_id": payroll_id,
                        "actions":  ["write", "delete", "admin"],
                    }],
                    "allow": [],
                },
            },
        ]
        for spec in policy_specs:
            policy, created = _get_or_create(
                db, Policy,
                defaults={
                    "policy_type": spec.get("policy_type", "access_control"),
                    "rules":       spec["rules"],
                    "status":      "active",
                    "priority":    spec.get("priority", 100),
                    "description": spec.get("description"),
                    "created_by":  user.id,
                },
                organization_id=org.id,
                name=spec["name"],
            )
            logger.info(f"  {'Created' if created else 'Exists '} policy: {policy.name}")

        db.commit()
        logger.info("PostgreSQL seeding complete.")
        return org, agents, assets

    except Exception as exc:
        db.rollback()
        logger.error(f"Postgres seed failed: {exc}")
        raise
    finally:
        db.close()


# ── Neo4j seed ────────────────────────────────────────────────────

def seed_neo4j(org, agents: dict, assets: dict, reset: bool = False):
    logger.info("Seeding Neo4j...")
    graph = get_graph_db()

    if not graph.connected:
        logger.warning("Neo4j not connected — skipping graph seed.")
        return

    if reset:
        logger.info("  Clearing existing graph nodes (MATCH (n) DETACH DELETE n)...")
        cleared = graph.reset()
        if cleared:
            logger.info("  Graph cleared.")
        else:
            logger.warning("  Graph clear failed — continuing anyway.")

    # Create agent nodes
    for name, agent in agents.items():
        ok = graph.create_agent_node(str(agent.id), agent.name, agent.agent_type or "agent")
        logger.info(f"  Graph agent  : {agent.name} ({'ok' if ok else 'skip'})")

    # Create asset nodes
    for name, asset in assets.items():
        ok = graph.create_asset_node(str(asset.id), asset.name, asset.asset_type)
        logger.info(f"  Graph asset  : {asset.name} ({'ok' if ok else 'skip'})")

    # Example relationships
    support = agents.get("Support Agent")
    crm     = assets.get("Customer CRM")
    payroll = assets.get("Payroll Database")

    if support and crm:
        graph.create_relationship(
            str(support.id), str(crm.id),
            "AGENT_USES_ASSET", "Agent", "Asset",
            {"action": "read", "timestamp": __import__("time").time()},
        )
        logger.info(f"  Relationship : {support.name} -> USES -> {crm.name}")

    if support and payroll:
        graph.create_relationship(
            str(support.id), str(payroll.id),
            "AGENT_ACCESS_DENIED", "Agent", "Asset",
            {"action": "access", "timestamp": __import__("time").time()},
        )
        logger.info(f"  Relationship : {support.name} -> DENIED -> {payroll.name}")

    logger.info("Neo4j seeding complete.")


# ── Reset graph only ──────────────────────────────────────────────

def reset_graph_only():
    logger.info("Resetting Neo4j graph...")
    graph = get_graph_db()
    if not graph.connected:
        logger.error("Neo4j not connected. Cannot reset.")
        sys.exit(1)
    ok = graph.reset()
    if ok:
        logger.info("Graph cleared successfully.")
    else:
        logger.error("Graph reset failed.")
        sys.exit(1)


# ── Entry point ───────────────────────────────────────────────────

def main():
    _log_loaded_modules()

    parser = argparse.ArgumentParser(description="AI-SecOS database seeder")
    parser.add_argument(
        "--reset-graph", action="store_true",
        help="Clear all Neo4j nodes before seeding (MATCH (n) DETACH DELETE n)",
    )
    parser.add_argument(
        "--graph-only", action="store_true",
        help="Only reset and re-seed Neo4j; skip Postgres",
    )
    args = parser.parse_args()

    if args.graph_only:
        reset_graph_only()
        return

    org, agents, assets = seed_postgres()
    seed_neo4j(org, agents, assets, reset=args.reset_graph)
    logger.info("Done.")


if __name__ == "__main__":
    main()
