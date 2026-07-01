#!/usr/bin/env python3
"""
patch_reports_methodology.py
Adds GET /reports/compliance/{framework}/methodology endpoint.
Run from ~/ai-secos/backend:
  python3 ../compliance_v2/patch_reports_methodology.py
"""
import os

PATH = "app/routes/reports.py"
if not os.path.exists(PATH):
    print(f"ERROR: {PATH} not found. Run from backend/"); exit(1)

with open(PATH) as f:
    src = f.read()

orig = src

# 1. Add get_control_methodology to the import
OLD_IMPORT = """from app.services.compliance import (
    generate_executive_report,
    generate_compliance_report,
    report_to_csv,
    seed_compliance_mappings,
    COMPLIANCE_MAPPINGS,
)"""
NEW_IMPORT = """from app.services.compliance import (
    generate_executive_report,
    generate_compliance_report,
    report_to_csv,
    seed_compliance_mappings,
    get_control_methodology,
    THRESHOLDS,
    COMPLIANCE_MAPPINGS,
)"""
if OLD_IMPORT in src:
    src = src.replace(OLD_IMPORT, NEW_IMPORT)
    print("✓ Import updated")
else:
    print("⚠ Import block not found verbatim — check manually")

# 2. Add the methodology endpoint right after /compliance/{framework}/controls
ANCHOR = '@router.get("/compliance/{framework}/controls")'
if ANCHOR in src:
    METHODOLOGY_ENDPOINT = '''
@router.get("/compliance/{framework}/methodology")
async def compliance_methodology(
    framework: str,
    current_user: TokenData = Depends(get_current_user),
):
    """
    Full transparency endpoint: returns the exact evidence queries,
    weights, and scoring rules used to calculate compliance scores
    for this framework. No black box — every number is explainable.
    """
    framework = framework.upper()
    controls = get_control_methodology(framework)
    if not controls:
        raise HTTPException(status_code=404, detail=f"No methodology found for framework '{framework}'")
    return {
        "framework": framework,
        "scoring_method": "weighted_partial_credit",
        "scoring_explanation": (
            "Each control is assessed against live evidence from your organization's "
            "runtime events, policies, incidents, and audit logs. A control can score "
            "PASS (1.0), PARTIAL (0.5), or NEEDS_REVIEW (0.0) based on documented "
            "thresholds. The framework score is a weighted average across all controls, "
            "where higher-impact controls (e.g. access control) carry more weight than "
            "single-metric controls."
        ),
        "global_thresholds": THRESHOLDS,
        "controls": controls,
    }


'''
    src = src.replace(ANCHOR, METHODOLOGY_ENDPOINT + ANCHOR)
    print("✓ Methodology endpoint added")
else:
    print("⚠ Anchor not found — appending at end of file instead")
    src += '''

@router.get("/compliance/{framework}/methodology")
async def compliance_methodology(
    framework: str,
    current_user: TokenData = Depends(get_current_user),
):
    """Full transparency endpoint for compliance scoring methodology."""
    framework = framework.upper()
    controls = get_control_methodology(framework)
    if not controls:
        raise HTTPException(status_code=404, detail=f"No methodology found for framework '{framework}'")
    return {
        "framework": framework,
        "scoring_method": "weighted_partial_credit",
        "global_thresholds": THRESHOLDS,
        "controls": controls,
    }
'''

if src != orig:
    with open(PATH, "w") as f:
        f.write(src)
    print(f"✓ {PATH} patched successfully")
else:
    print("No changes written")
