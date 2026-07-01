#!/usr/bin/env python3
"""
deploy_graph_v2.py
Wires the new Graph Explorer backend together:
  1. Appends new Neo4jGraph methods into app/graph.py
  2. Registers the new graph_v2 router in app/main.py

Run from ~/ai-secos/backend:
  python3 ../graph_v2/backend/deploy_graph_v2.py
"""
import os

GRAPH_PY = "app/graph.py"
MAIN_PY  = "app/main.py"
METHODS_FILE = "../graph_v2/backend/graph_v2_methods.py"

if not os.path.exists(GRAPH_PY):
    print(f"ERROR: {GRAPH_PY} not found. Run from backend/"); exit(1)
if not os.path.exists(METHODS_FILE):
    print(f"ERROR: {METHODS_FILE} not found."); exit(1)

with open(GRAPH_PY) as f:
    graph_src = f.read()

with open(METHODS_FILE) as f:
    methods_src = f.read()

method_start = methods_src.index("# Method 1") if "# Method 1" in methods_src else methods_src.index("def get_risk_ranked_graph")
methods_to_insert = methods_src[method_start:]

RISK_LEVEL_MARKER = "def _risk_level(score: float) -> str:"
if RISK_LEVEL_MARKER in methods_to_insert:
    class_methods, helper_fn = methods_to_insert.split(RISK_LEVEL_MARKER, 1)
    helper_fn = RISK_LEVEL_MARKER + helper_fn
else:
    class_methods, helper_fn = methods_to_insert, ""

indented_methods = "\n".join(
    ("    " + line if line.strip() else line)
    for line in class_methods.splitlines()
)

ANCHOR = "    def get_asset_graph(self, asset_id: str) -> Dict[str, Any]:"
if ANCHOR in graph_src and "get_risk_ranked_graph" not in graph_src:
    graph_src = graph_src.replace(ANCHOR, indented_methods + "\n\n" + ANCHOR, 1)
    if helper_fn.strip():
        graph_src = graph_src.rstrip() + "\n\n\n" + helper_fn
    with open(GRAPH_PY, "w") as f:
        f.write(graph_src)
    print("Step 1: New Neo4j methods inserted into app/graph.py")
elif "get_risk_ranked_graph" in graph_src:
    print("Step 1: Already patched - skipping")
else:
    print("Step 1: ERROR - anchor 'get_asset_graph' not found in app/graph.py")
    print("        Manual insertion needed - see graph_v2_methods.py")

if not os.path.exists(MAIN_PY):
    print(f"ERROR: {MAIN_PY} not found."); exit(1)

with open(MAIN_PY) as f:
    main_src = f.read()

if "graph_v2" not in main_src:
    GRAPH_ANCHOR = "app.include_router(graph_router,        prefix=p)"
    if GRAPH_ANCHOR in main_src:
        addition = (
            GRAPH_ANCHOR + "\n\ntry:\n"
            "    from app.routes.graph_v2 import router as graph_v2_router\n"
            "    app.include_router(graph_v2_router, prefix=p)\n"
            "    logger.info(\"Graph Explorer v2 router registered\")\n"
            "except Exception as e:\n"
            "    logger.warning(f\"Graph v2 router skipped: {e}\")"
        )
        main_src = main_src.replace(GRAPH_ANCHOR, addition)
        with open(MAIN_PY, "w") as f:
            f.write(main_src)
        print("Step 2: graph_v2 router registered in app/main.py")
    else:
        print("Step 2: ERROR - graph_router anchor not found in app/main.py")
        print("        Add manually: from app.routes.graph_v2 import router as graph_v2_router")
else:
    print("Step 2: Already registered - skipping")

print("")
print("Done. Next steps:")
print("  1. Copy graph_v2.py to app/routes/graph_v2.py")
print("  2. Restart backend: docker compose restart backend")
print("  3. Test: curl http://localhost:8000/api/v1/graph/overview -H 'Authorization: Bearer <token>'")
