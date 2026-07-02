#!/bin/bash
# Oracle Cloud first-time setup script
# Run after: git clone, create .env, docker compose up -d

set -e
echo "=== AI-SecOS Oracle Setup ==="

# Wait for postgres
sleep 15

# Create tables from models (bypasses migration order issues)
docker compose exec backend python3 -c "
from app.database import engine
from app.models import Base
import app.enterprise_models
Base.metadata.create_all(bind=engine)
print('Tables created')
"

# Stamp migrations as done
docker compose exec backend alembic stamp head

# Seed database
docker compose exec backend python3 /app/seed.py

echo "=== Setup complete ==="
echo "Login: admin / admin123"
