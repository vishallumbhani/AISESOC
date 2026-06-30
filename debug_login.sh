#!/bin/bash
# Run on your server to test login directly

BASE="http://localhost:8000/api/v1"

echo "=== Test 1: Normal login (query params - old style) ==="
curl -s -X POST "$BASE/auth/login?username=admin&password=admin123" \
  -H "Content-Type: application/json" | python3 -m json.tool 2>/dev/null || echo "raw: $(curl -s -X POST "$BASE/auth/login?username=admin&password=admin123")"

echo ""
echo "=== Test 2: Check what users exist ==="
docker compose exec postgres psql -U secos_user -d ai_secos_db \
  -c "SELECT id, username, email, role, is_active FROM users LIMIT 5;"

echo ""
echo "=== Test 3: Check platform_admins table ==="
docker compose exec postgres psql -U secos_user -d ai_secos_db \
  -c "SELECT * FROM platform_admins LIMIT 5;" 2>/dev/null || echo "Table does not exist yet"

echo ""
echo "=== Test 4: Backend logs ==="
docker compose logs backend --tail=20
