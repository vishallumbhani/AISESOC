#!/bin/bash
# deploy_rc2.sh
# Complete RC2 frontend redesign deployment
# Run from ~/ai-secos: bash deploy_rc2.sh

set -e
cd ~/ai-secos

echo "=== AI-SecOS RC2 Frontend Deploy ==="

# 1. Backup
BACKUP=~/ai-secos-frontend-backup-$(date +%Y%m%d_%H%M%S).tar.gz
tar -czf "$BACKUP" frontend/pages frontend/components frontend/styles frontend/theme 2>/dev/null || true
echo "Backup: $BACKUP"

# 2. Extract RC2 zip
unzip -o rc2-frontend.zip -d /tmp/rc2
echo "Extracted RC2"

# 3. Deploy styles and theme
cp /tmp/rc2/styles/globals.css frontend/styles/globals.css
mkdir -p frontend/theme
cp /tmp/rc2/theme/colors.ts frontend/theme/colors.ts
echo "Styles and theme deployed"

# 4. Deploy components
cp /tmp/rc2/components/AppShell.tsx        frontend/components/AppShell.tsx
cp /tmp/rc2/components/Alert.tsx           frontend/components/Alert.tsx
cp /tmp/rc2/components/Badge.tsx           frontend/components/Badge.tsx
cp /tmp/rc2/components/Button.tsx          frontend/components/Button.tsx
cp /tmp/rc2/components/LoadingSpinner.tsx  frontend/components/LoadingSpinner.tsx
cp /tmp/rc2/components/ErrorBoundary.tsx   frontend/components/ErrorBoundary.tsx 2>/dev/null || true
cp /tmp/rc2/components/IntelligencePanel.tsx frontend/components/IntelligencePanel.tsx 2>/dev/null || true
cp /tmp/rc2/components/IncidentTimelineTrail.tsx frontend/components/IncidentTimelineTrail.tsx 2>/dev/null || true
mkdir -p frontend/components/ds
cp /tmp/rc2/components/ds/index.tsx        frontend/components/ds/index.tsx
echo "Components deployed"

# 5. Deploy pages
cp /tmp/rc2/pages/_app.tsx                 frontend/pages/_app.tsx
cp /tmp/rc2/pages/_document.tsx            frontend/pages/_document.tsx
cp /tmp/rc2/pages/dashboard.tsx            frontend/pages/dashboard.tsx
cp /tmp/rc2/pages/agents.tsx               frontend/pages/agents.tsx
cp /tmp/rc2/pages/policies.tsx             frontend/pages/policies.tsx
cp /tmp/rc2/pages/incidents.tsx            frontend/pages/incidents.tsx
cp /tmp/rc2/pages/runtime.tsx              frontend/pages/runtime.tsx
cp /tmp/rc2/pages/audit-logs.tsx           frontend/pages/audit-logs.tsx
cp /tmp/rc2/pages/reports.tsx              frontend/pages/reports.tsx
cp /tmp/rc2/pages/risk-timeline.tsx        frontend/pages/risk-timeline.tsx
cp /tmp/rc2/pages/policy-simulator.tsx     frontend/pages/policy-simulator.tsx
cp /tmp/rc2/pages/users.tsx                frontend/pages/users.tsx
cp /tmp/rc2/pages/settings.tsx             frontend/pages/settings.tsx
cp /tmp/rc2/pages/system.tsx               frontend/pages/system.tsx
cp /tmp/rc2/pages/graph.tsx                frontend/pages/graph.tsx
cp /tmp/rc2/pages/index.tsx                frontend/pages/index.tsx
cp /tmp/rc2/pages/login.tsx                frontend/pages/login.tsx
mkdir -p frontend/pages/assets
cp /tmp/rc2/pages/assets/index.tsx         frontend/pages/assets/index.tsx
cp /tmp/rc2/pages/assets/[id].tsx          "frontend/pages/assets/[id].tsx"
echo "Pages deployed"

# 6. Install react-icons if missing
docker compose exec -T frontend npm list react-icons 2>/dev/null | grep -q react-icons || \
  (docker compose stop frontend && \
   npm install react-icons --save --prefix frontend && \
   docker compose up -d frontend && sleep 5)

# 7. Restart
docker compose restart frontend
echo "Frontend restarting..."
sleep 10

# 8. Verify
docker compose logs frontend --tail=8
echo ""
echo "=== Deploy complete ==="
echo "Open: http://$(hostname -I | awk '{print $1}'):3000/dashboard"
