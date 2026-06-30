#!/usr/bin/env python3
"""
convert_to_light.py
Converts all org portal pages from dark theme to light enterprise theme.

Run from ~/ai-secos/frontend:
  python3 convert_to_light.py

What it does:
  1. Replaces dark page backgrounds  → var(--ds-page-bg) via ds-page class
  2. Replaces dark card backgrounds  → white
  3. Replaces dark input backgrounds → white
  4. Replaces dark text colors       → slate equivalents
  5. Replaces dark border colors     → slate equivalents
  6. Updates modal/drawer backgrounds
  7. Updates form field classes
"""

import re, os, shutil
from datetime import datetime

PAGES_DIR = "pages"
BACKUP_DIR = f".theme_backup_{datetime.now().strftime('%H%M%S')}"

# ── Files to convert (org portal only) ────────────────────────
FILES = [
    "pages/dashboard.tsx",
    "pages/enterprise.tsx",
    "pages/agents.tsx",
    "pages/policies.tsx",
    "pages/incidents.tsx",
    "pages/runtime.tsx",
    "pages/audit-logs.tsx",
    "pages/reports.tsx",
    "pages/users.tsx",
    "pages/settings.tsx",
    "pages/system.tsx",
    "pages/risk-timeline.tsx",
    "pages/policy-simulator.tsx",
    "pages/graph.tsx",
]

# ── Replacement rules (order matters — most specific first) ───
RULES = [
    # ── Page/section backgrounds ─────────────────────────────
    # Full page dark → light page bg
    ("min-h-screen bg-gray-950",      "min-h-screen" ),
    ("min-h-screen bg-gray-900",      "min-h-screen" ),
    ("min-h-screen bg-gray-800",      "min-h-screen" ),
    ("min-h-screen bg-slate-900",     "min-h-screen" ),
    ("min-h-screen bg-black",         "min-h-screen" ),

    # ── Dark cards → white cards ──────────────────────────────
    ("bg-gray-900 border border-gray-800",  "bg-white border border-slate-200"),
    ("bg-gray-900 border border-gray-700",  "bg-white border border-slate-200"),
    ("bg-gray-900 border border-gray-600",  "bg-white border border-slate-200"),
    ("bg-gray-950 border border-gray-800",  "bg-white border border-slate-200"),
    ("bg-gray-950 border border-gray-700",  "bg-white border border-slate-200"),
    ("bg-gray-800 border border-gray-700",  "bg-white border border-slate-200"),
    ("bg-gray-800 border border-gray-600",  "bg-white border border-slate-200"),
    ("bg-gray-800/40 border border-gray-700", "bg-white border border-slate-200"),
    ("bg-gray-800/50 border border-gray-700", "bg-white border border-slate-200"),
    ("bg-gray-800/60 border border-gray-700", "bg-white border border-slate-200"),
    ("bg-gray-800/30 border border-gray-700", "bg-white border border-slate-200"),

    # ── Modal/drawer backgrounds ──────────────────────────────
    ("bg-gray-950 border-l border-gray-700", "bg-white border-l border-slate-200"),
    ("bg-gray-900 border-l border-gray-700", "bg-white border-l border-slate-200"),
    ("bg-gray-950 rounded-2xl",             "bg-white rounded-2xl"),
    ("bg-gray-900 rounded-2xl",             "bg-white rounded-2xl"),
    ("bg-gray-900 rounded-xl",              "bg-white rounded-xl"),
    ("bg-gray-900 rounded-lg",              "bg-white rounded-lg"),

    # ── Standalone bg-gray-9xx / bg-gray-8xx ─────────────────
    ("bg-gray-950",   "bg-slate-50"),
    ("bg-gray-900/80","bg-white/80"),
    ("bg-gray-900/60","bg-white/60"),
    ("bg-gray-900/40","bg-slate-50"),
    ("bg-gray-900/20","bg-slate-50"),
    ("bg-gray-900",   "bg-white"),
    ("bg-gray-800/60","bg-slate-100"),
    ("bg-gray-800/50","bg-slate-50"),
    ("bg-gray-800/40","bg-slate-50"),
    ("bg-gray-800/30","bg-slate-50"),
    ("bg-gray-800/20","bg-slate-50"),
    ("bg-gray-800",   "bg-slate-100"),

    # ── Dark input backgrounds ────────────────────────────────
    ("bg-gray-700 rounded", "bg-slate-100 rounded"),

    # ── Dark borders ──────────────────────────────────────────
    ("border-gray-800",  "border-slate-200"),
    ("border-gray-700",  "border-slate-200"),
    ("border-gray-600",  "border-slate-300"),

    # ── Dark text ─────────────────────────────────────────────
    ("text-white",   "text-slate-900"),
    ("text-gray-100","text-slate-900"),
    ("text-gray-200","text-slate-700"),
    ("text-gray-300","text-slate-600"),
    ("text-gray-400","text-slate-500"),
    ("text-gray-500","text-slate-400"),
    ("text-gray-600","text-slate-500"),

    # ── Divide colors ─────────────────────────────────────────
    ("divide-gray-800","divide-slate-200"),
    ("divide-gray-700","divide-slate-200"),

    # ── Input classes (dark → light) ──────────────────────────
    ("focus:border-indigo-500", "focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"),

    # ── Table header backgrounds ──────────────────────────────
    ("bg-gray-800/50 border-b border-gray-700", "bg-slate-50 border-b border-slate-200"),
    ("bg-gray-800/40 border-b border-gray-700", "bg-slate-50 border-b border-slate-200"),

    # ── Hover states ──────────────────────────────────────────
    ("hover:bg-gray-800/30", "hover:bg-slate-50"),
    ("hover:bg-gray-800/50", "hover:bg-slate-50"),
    ("hover:bg-gray-800",    "hover:bg-slate-100"),
    ("hover:bg-gray-700",    "hover:bg-slate-200"),

    # ── Button/pill dark backgrounds ─────────────────────────
    ("bg-gray-800 border border-gray-700 text-gray-300 hover:text-white",
     "bg-white border border-slate-200 text-slate-600 hover:text-slate-900"),
    ("bg-gray-800 border border-gray-700 text-gray-400",
     "bg-white border border-slate-200 text-slate-500"),

    # ── Placeholder / animation ───────────────────────────────
    ("placeholder-white/30",  "placeholder-slate-400"),
    ("placeholder-gray-500",  "placeholder-slate-400"),
    ("placeholder-gray-600",  "placeholder-slate-400"),

    # ── Backdrop ──────────────────────────────────────────────
    ("bg-black/50",  "bg-slate-900/40"),
    ("bg-black/60",  "bg-slate-900/50"),
]

# ── Context-sensitive: color strings inside object literals ──
# These are used in Badge/mapping objects in enterprise.tsx etc.
OBJECT_RULES = [
    # Dark badge colors in JS objects → light badge colors
    ('"bg-gray-900/40 text-green-400 border border-green-700"',
     '"bg-green-50 text-green-700 border border-green-200"'),
    ('"bg-gray-900/40 text-red-400 border border-red-700"',
     '"bg-red-50 text-red-700 border border-red-200"'),
    ('"bg-gray-900/40 text-blue-400 border border-blue-700"',
     '"bg-blue-50 text-blue-700 border border-blue-200"'),
    ('"bg-gray-900/40 text-orange-400 border border-orange-700"',
     '"bg-orange-50 text-orange-700 border border-orange-200"'),
    ('"bg-gray-900/40 text-yellow-400 border border-yellow-700"',
     '"bg-amber-50 text-amber-700 border border-amber-200"'),
    ('"bg-gray-900/40 text-teal-400 border border-teal-700"',
     '"bg-teal-50 text-teal-700 border border-teal-200"'),
    ('"bg-gray-900/40 text-purple-400 border border-purple-700"',
     '"bg-purple-50 text-purple-700 border border-purple-200"'),
    ('"bg-gray-800 text-gray-400 border-gray-600"',
     '"bg-slate-100 text-slate-600 border-slate-200"'),
    ('"bg-gray-800 text-gray-400 border border-gray-600"',
     '"bg-slate-100 text-slate-500 border border-slate-200"'),
    ('"bg-gray-800 text-gray-500 border border-gray-700"',
     '"bg-slate-100 text-slate-500 border border-slate-200"'),
    # Status badge mappings
    ('"bg-red-900/40 text-red-400 border border-red-700"',
     '"bg-red-50 text-red-700 border border-red-200"'),
    ('"bg-orange-900/40 text-orange-400 border border-orange-700"',
     '"bg-orange-50 text-orange-700 border border-orange-200"'),
    ('"bg-yellow-900/40 text-yellow-400 border border-yellow-700"',
     '"bg-amber-50 text-amber-700 border border-amber-200"'),
    ('"bg-green-900/40 text-green-400 border border-green-700"',
     '"bg-green-50 text-green-700 border border-green-200"'),
    ('"bg-blue-900/40 text-blue-400 border border-blue-700"',
     '"bg-blue-50 text-blue-700 border border-blue-200"'),
    ('"bg-indigo-900/60 text-indigo-400 border border-indigo-700"',
     '"bg-indigo-50 text-indigo-700 border border-indigo-200"'),
    # JS template string versions (single quotes inside template literals)
    ("bg-red-900/40 text-red-400 border border-red-700",
     "bg-red-50 text-red-700 border border-red-200"),
    ("bg-orange-900/40 text-orange-400 border border-orange-700",
     "bg-orange-50 text-orange-700 border border-orange-200"),
    ("bg-yellow-900/40 text-yellow-400 border border-yellow-700",
     "bg-amber-50 text-amber-700 border border-amber-200"),
    ("bg-green-900/40 text-green-400 border border-green-700",
     "bg-green-50 text-green-700 border border-green-200"),
    ("bg-blue-900/40 text-blue-400 border border-blue-700",
     "bg-blue-50 text-blue-700 border border-blue-200"),
]

# ── Specific status/severity color patterns in JSX ────────────
STATUS_RULES = [
    ("text-red-400", "text-red-600"),
    ("text-orange-400", "text-orange-600"),
    ("text-yellow-400", "text-amber-600"),
    ("text-green-400", "text-green-600"),
    ("text-blue-400", "text-blue-600"),
    ("text-indigo-400", "text-indigo-600"),
    ("text-purple-400", "text-purple-600"),
    ("text-teal-400", "text-teal-600"),
]


def convert_file(path: str) -> tuple[int, str]:
    """Apply all rules to a file. Returns (changes_made, summary)."""
    with open(path) as f:
        src = f.read()

    original = src
    changes = 0

    # Apply object literal rules first (most specific)
    for old, new in OBJECT_RULES:
        if old in src:
            count = src.count(old)
            src = src.replace(old, new)
            changes += count

    # Apply main replacement rules
    for old, new in RULES:
        if old in src:
            count = src.count(old)
            src = src.replace(old, new)
            changes += count

    # Status/accent color lightening (only in JSX className contexts)
    # Only convert in className strings, not in logic conditions
    for old, new in STATUS_RULES:
        # Replace in className= contexts and template strings
        # Pattern: appears inside a className string or template literal
        # We use a heuristic: replace if surrounded by quotes, spaces, or ${}
        pattern = r'(?<=["\s`])' + re.escape(old) + r'(?=["\s`])'
        new_src, n = re.subn(pattern, new, src)
        if n > 0:
            src = new_src
            changes += n

    # Fix: Remove double "focus:outline-none" if introduced
    src = src.replace(
        "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none",
        "focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
    )

    if src != original:
        # Backup original
        os.makedirs(BACKUP_DIR, exist_ok=True)
        shutil.copy(path, os.path.join(BACKUP_DIR, os.path.basename(path)))
        with open(path, "w") as f:
            f.write(src)

    return changes, ("changed" if src != original else "no changes")


def main():
    print(f"AI-SecOS Light Theme Conversion")
    print(f"Backups will be saved to: {BACKUP_DIR}/")
    print("=" * 50)

    total = 0
    for path in FILES:
        if not os.path.exists(path):
            print(f"  SKIP  {path} (not found)")
            continue
        n, status = convert_file(path)
        icon = "✓" if n > 0 else "○"
        print(f"  {icon}  {path:<40} {n:>4} replacements  [{status}]")
        total += n

    print("=" * 50)
    print(f"  Total replacements: {total}")
    print(f"  Backups in:         {BACKUP_DIR}/")
    print()
    print("Next step:")
    print("  cd ~/ai-secos && docker compose restart frontend")


if __name__ == "__main__":
    main()
