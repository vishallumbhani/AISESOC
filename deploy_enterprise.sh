#!/bin/bash
# deploy_enterprise.sh
# Run from ~/ai-secos/ after downloading all files
# Copies enterprise backend routes to backend/app/routes/

set -e
cd ~/ai-secos

echo "=== Deploying enterprise backend routes ==="

# Ensure routes directory exists
mkdir -p backend/app/routes
mkdir -p backend/app/services

# Backend route files
cp api_keys_route.py     backend/app/routes/api_keys.py
cp rbac_route.py         backend/app/routes/rbac.py
cp connectors_route.py   backend/app/routes/connectors.py
cp reports_route.py      backend/app/routes/reports.py
cp platform.py           backend/app/routes/platform.py

# Backend service files
cp rbac_service.py       backend/app/services/rbac.py
cp connectors_service.py backend/app/services/connectors.py
cp compliance_service.py backend/app/services/compliance.py

# Create services __init__.py if missing
touch backend/app/services/__init__.py

# Enterprise models
cp enterprise_models.py  backend/app/enterprise_models.py

# Main app
cp main.py               backend/app/main.py
cp auth.py               backend/app/routes/auth.py
cp security.py           backend/app/security.py

echo "=== Restarting backend ==="
docker compose restart backend
sleep 5

echo "=== Verifying routes ==="
curl -s http://localhost:8000/api/v1/rbac/roles \
  -H "Authorization: Bearer $(curl -s -X POST 'http://localhost:8000/api/v1/auth/login?username=admin&password=admin123' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('rbac/roles OK -', len(d), 'roles')" 2>/dev/null || echo "rbac/roles: check failed (normal if no token)"

echo ""
echo "=== Backend logs ==="
docker compose logs backend --tail=10
