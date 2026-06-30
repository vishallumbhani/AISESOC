#!/usr/bin/env python3
"""
patch_main_dashboard.py
Registers the new /dashboard route in backend/app/main.py.
Run from ~/ai-secos:
  python3 sprint7/patch_main_dashboard.py
"""
import os, sys

path = "backend/app/main.py"
if not os.path.exists(path):
    print(f"ERROR: {path} not found. Run from ~/ai-secos root.")
    sys.exit(1)

with open(path) as f:
    src = f.read()

if "from app.routes.dashboard import router as dashboard_router" in src:
    print("✓ Dashboard router already registered.")
    sys.exit(0)

# Find the enterprise routers block and add dashboard there
insert_after = "app.include_router(connector_runtime_router, prefix=p)"
new_block = """app.include_router(connector_runtime_router, prefix=p)
    from app.routes.dashboard import router as dashboard_router
    app.include_router(dashboard_router, prefix=p)"""

if insert_after in src:
    src = src.replace(insert_after, new_block)
    with open(path, "w") as f:
        f.write(src)
    print("✓ Dashboard router registered in main.py")
else:
    # Fallback: add at end of try block
    insert_after2 = 'logger.info("Enterprise routers registered")'
    new_block2 = '''    from app.routes.dashboard import router as dashboard_router
    app.include_router(dashboard_router, prefix=p)
    logger.info("Enterprise routers registered")'''
    if insert_after2 in src:
        src = src.replace(insert_after2, new_block2)
        with open(path, "w") as f:
            f.write(src)
        print("✓ Dashboard router registered in main.py (fallback)")
    else:
        print("⚠ Could not auto-patch main.py.")
        print("Add this manually inside the enterprise try/except block in main.py:")
        print()
        print("    from app.routes.dashboard import router as dashboard_router")
        print("    app.include_router(dashboard_router, prefix=p)")
