#!/bin/bash
# ================================================================
# AI-SecOS Design System v2.0 — Deploy
# Run from ~/ai-secos
# ================================================================
set -e

SPRINT="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(pwd)"

if [ ! -f "docker-compose.yml" ]; then
  echo "ERROR: Run from ~/ai-secos directory"; exit 1
fi

echo "======================================================"
echo "  AI-SecOS Enterprise Design System v2.0 — Deploy"
echo "======================================================"

# 1. Install lucide-react if missing
echo ""
echo "[1/4] Checking lucide-react..."
if docker compose exec -T frontend node -e "require('lucide-react')" 2>/dev/null; then
  echo "      ✓ lucide-react installed"
else
  echo "      Installing lucide-react..."
  docker compose exec -T frontend npm install lucide-react --save --silent 2>&1 | tail -3
  echo "      ✓ lucide-react installed"
fi

# 2. Copy files
echo ""
echo "[2/4] Copying design system files..."

cp "$SPRINT/components/AppShell.tsx"      frontend/components/AppShell.tsx
echo "      ✓ AppShell.tsx"

cp "$SPRINT/styles/globals.css"           frontend/styles/globals.css
echo "      ✓ globals.css"

cp "$SPRINT/pages/_app.tsx"              frontend/pages/_app.tsx
echo "      ✓ _app.tsx"

cp "$SPRINT/pages/risk-timeline.tsx"     frontend/pages/risk-timeline.tsx
echo "      ✓ risk-timeline.tsx (auth bug fixed)"

# 3. Restart
echo ""
echo "[3/4] Restarting frontend..."
docker compose restart frontend
sleep 8

# 4. Verify
echo ""
echo "[4/4] Checking..."
STATUS=$(curl -sf http://localhost:3000 -o /dev/null -w "%{http_code}" 2>/dev/null || echo "000")
if [ "$STATUS" = "200" ] || [ "$STATUS" = "307" ]; then
  echo "      ✓ Frontend healthy (HTTP $STATUS)"
else
  echo "      ⚠ HTTP $STATUS — showing last 20 log lines:"
  docker compose logs frontend --tail=20
fi

echo ""
echo "======================================================"
echo "  ✅ Done"
echo "======================================================"
echo ""
echo "  Changes:"
echo "  • AppShell.tsx    — polished enterprise sidebar"
echo "  • globals.css     — full design token system"
echo "  • _app.tsx        — clean dual-portal routing"
echo "  • risk-timeline   — auth bug fixed (was using legacy token)"
echo ""
echo "  View: http://192.168.116.159:3000/dashboard"
