#!/usr/bin/env python3
"""
patch_executive_csv.py
Fixes: KeyError 'summary' in /reports/executive?format=csv

The executive report structure changed from {"summary": {...}} to flat
top-level fields (total_events, deny_events, open_incidents, etc.) when
the compliance engine was rebuilt. This route was never updated to match.

Run from ~/ai-secos/backend:
  python3 ../exec_csv_fix/patch_executive_csv.py
"""
import os

PATH = "app/routes/reports.py"
if not os.path.exists(PATH):
    print(f"ERROR: {PATH} not found. Run from backend/"); exit(1)

with open(PATH) as f:
    src = f.read()

orig = src

OLD = '''    if format == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        s = report["summary"]
        w.writerow(["Metric", "Value"])
        for k, v in s.items():
            w.writerow([k.replace("_"," ").title(), v])
        w.writerow([])
        w.writerow(["Top Violating Agents"])
        w.writerow(["Agent", "Deny Count"])
        for ag in report.get("top_violating_agents", []):
            w.writerow([ag["agent"], ag["deny_count"]])
        return StreamingResponse(
            io.BytesIO(buf.getvalue().encode()),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=executive_report_{days}d.csv"},
        )'''

NEW = '''    if format == "csv":
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["Executive Security Report"])
        w.writerow(["Generated", report.get("generated_at", "")])
        w.writerow(["Period (days)", report.get("period_days", days)])
        w.writerow([])
        w.writerow(["Metric", "Value"])
        # Flat report structure — iterate scalar top-level fields only,
        # skip nested structures (top_violating_agents) which get their
        # own section below.
        for k, v in report.items():
            if k in ("top_violating_agents", "generated_at", "period_days"):
                continue
            if isinstance(v, (list, dict)):
                continue
            w.writerow([k.replace("_", " ").title(), v])
        w.writerow([])
        w.writerow(["Top Violating Agents"])
        w.writerow(["Agent", "Deny Count"])
        for ag in report.get("top_violating_agents", []):
            w.writerow([ag.get("agent", ""), ag.get("deny_count", 0)])
        return StreamingResponse(
            io.BytesIO(buf.getvalue().encode()),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=executive_report_{days}d.csv"},
        )'''

if OLD in src:
    src = src.replace(OLD, NEW)
    print("✓ Executive CSV export fixed — now matches flat report structure")
else:
    print("⚠ Exact block not found — check app/routes/reports.py manually around the /executive route")
    print("  Looking for: s = report[\"summary\"]")

if src != orig:
    with open(PATH, "w") as f:
        f.write(src)
    print(f"✓ {PATH} patched")
else:
    print("No changes written")
