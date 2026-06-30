#!/usr/bin/env python3
"""
patch_graph.py
Fixes: TypeError: Cannot read properties of undefined (reading 'toFixed')
at graph.tsx line 193.

drillDown.risk_score exists but .score is undefined (the backend
/graph/node/{id} returns risk_score with a null score in some cases).

Run from ~/ai-secos/frontend:
  python3 ../fix4/patch_graph.py
"""
import os, re

PATH = "pages/graph.tsx"
if not os.path.exists(PATH):
    print(f"ERROR: {PATH} not found. Run from frontend/"); exit(1)

with open(PATH) as f:
    src = f.read()

orig = src

# Fix 1: score.toFixed(1) → safe null check
OLD1 = 'drillDown.risk_score.score.toFixed(1)'
NEW1 = '(drillDown.risk_score.score ?? 0).toFixed(1)'
src = src.replace(OLD1, NEW1)

# Fix 2: severity.toUpperCase() → safe fallback
OLD2 = 'drillDown.risk_score.severity.toUpperCase()'
NEW2 = '(drillDown.risk_score.severity ?? "unknown").toUpperCase()'
src = src.replace(OLD2, NEW2)

# Fix 3: Wrap the whole risk_score block with stricter guard
# Change: {drillDown.risk_score && (
# To:     {drillDown.risk_score?.score != null && (
OLD3 = '{drillDown.risk_score && ('
NEW3 = '{drillDown.risk_score?.score != null && ('
src = src.replace(OLD3, NEW3, 1)  # only first occurrence (the risk score block)

if src == orig:
    print("⚠ No changes made — check that the file matches expected patterns")
else:
    with open(PATH, "w") as f:
        f.write(src)
    print(f"✓ {PATH} patched — 3 null-safety fixes applied")
