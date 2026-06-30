#!/usr/bin/env python3
"""
reset_graph.py -- Clear all Neo4j nodes and relationships.

Usage:
    python reset_graph.py           # prompt for confirmation
    python reset_graph.py --yes     # skip confirmation (for CI/scripts)

Equivalent Cypher:  MATCH (n) DETACH DELETE n
"""

import sys
import os
import argparse
import logging

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.graph import get_graph_db


def main():
    parser = argparse.ArgumentParser(description="Clear all Neo4j graph data")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
    args = parser.parse_args()

    graph = get_graph_db()

    if not graph.connected:
        logger.error(
            "Neo4j is not connected. "
            "Check NEO4J_HOST / NEO4J_PORT / NEO4J_AUTH in your environment."
        )
        sys.exit(1)

    # Count nodes before deletion
    result = graph.execute("MATCH (n) RETURN count(n) AS total")
    total  = result[0]["total"] if result else 0
    logger.info(f"Current node count: {total}")

    if total == 0:
        logger.info("Graph is already empty. Nothing to do.")
        return

    if not args.yes:
        answer = input(
            f"\nThis will permanently delete {total} nodes and all relationships.\n"
            "Type 'yes' to continue: "
        ).strip().lower()
        if answer != "yes":
            logger.info("Aborted.")
            sys.exit(0)

    ok = graph.reset()
    if ok:
        result_after = graph.execute("MATCH (n) RETURN count(n) AS total")
        after = result_after[0]["total"] if result_after else 0
        logger.info(f"Graph cleared. Node count after reset: {after}")
    else:
        logger.error("Reset failed. Check Neo4j logs.")
        sys.exit(1)


if __name__ == "__main__":
    main()
