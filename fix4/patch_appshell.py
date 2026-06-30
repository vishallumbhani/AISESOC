#!/usr/bin/env python3
"""
patch_appshell.py
Fix 3: Merge "Connectors" and "API Keys" into a single "Integrations" nav entry.
Fix 4: Remove the duplicate "API Keys" entry since it's a tab in enterprise.tsx.

Run from ~/ai-secos/frontend:
  python3 ../fix4/patch_appshell.py
"""
import os

PATH = "components/AppShell.tsx"
if not os.path.exists(PATH):
    PATH = "../components/AppShell.tsx"

if not os.path.exists(PATH):
    print(f"ERROR: AppShell.tsx not found. Run from frontend/"); exit(1)

with open(PATH) as f:
    src = f.read()

orig = src

# Replace the Integrations group that has two separate entries
# with a single "Enterprise Admin" entry pointing to /enterprise
OLD_INTEGRATIONS = '''{
    label: "Integrations",
    emoji: "🔌",
    items: [
      { label: "Connectors", href: "/enterprise",   icon: Link2 },
      { label: "API Keys",   href: "/enterprise",   icon: Key },
    ],
  },'''

NEW_INTEGRATIONS = '''{
    label: "Integrations",
    emoji: "🔌",
    items: [
      { label: "Connectors & Keys", href: "/enterprise", icon: Link2 },
    ],
  },'''

if OLD_INTEGRATIONS in src:
    src = src.replace(OLD_INTEGRATIONS, NEW_INTEGRATIONS)
    print("✓ Merged Connectors + API Keys into single nav entry")
else:
    # Try alternate format from original sprint
    OLD2 = '''      { label: "Connectors", href: "/enterprise",   icon: Link2 },
      { label: "API Keys",   href: "/enterprise",   icon: Key },'''
    NEW2 = '''      { label: "Connectors & Keys", href: "/enterprise", icon: Link2 },'''
    if OLD2 in src:
        src = src.replace(OLD2, NEW2)
        print("✓ Merged Connectors + API Keys (alternate format)")
    else:
        print("⚠ Could not find Integrations group — check AppShell.tsx manually")
        print("  Manually change the Integrations nav group to have one item:")
        print('  { label: "Connectors & Keys", href: "/enterprise", icon: Link2 }')

if src != orig:
    with open(PATH, "w") as f:
        f.write(src)
    print(f"✓ {PATH} updated")
else:
    print("No changes written")
