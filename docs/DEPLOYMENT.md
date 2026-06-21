# Deployment Guide

## Prerequisites

- Docker & Docker Compose installed
- Linux server (Ubuntu 20.04 or later recommended)
- At least 4GB RAM
- Port 80, 443, 8000 available

## Production Deployment

### Step 1: Setup Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### Step 2: Clone Repository

```bash
git clone https://github.com/vishallumbhani/ai-secos.git
cd ai-secos
```

### Step 3: Configure Environment

```bash
cp .env.example .env

# Edit .env with production values
nano .env
```

**Important Production Settings:**

```env
FASTAPI_ENV=production
FASTAPI_DEBUG=false
SECRET_KEY=<generate-strong-random-key>
POSTGRES_PASSWORD=<strong-password>
NEO4J_AUTH=neo4j/<strong-password>
```

### Step 4: Start Services

```bash
# Build and start
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f backend
```

### Step 5: Setup Nginx Reverse Proxy

Create `/etc/nginx/sites-available/ai-secos`:

```nginx
upstream backend {
    server 127.0.0.1:8000;
}

upstream frontend {
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/ai-secos /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 6: Setup SSL Certificate

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot certonly --nginx -d your-domain.com
```

## Monitoring

### Health Checks

```bash
# Check backend
curl http://localhost:8000/health

# Check database
docker-compose exec postgres pg_isready -U secos_user

# Check Neo4j
curl -u neo4j:password http://localhost:7474/browser/
```

### View Logs

```bash
# All services
docker-compose logs

# Specific service
docker-compose logs backend
docker-compose logs postgres

# Follow logs
docker-compose logs -f
```

## Backup & Restore

### PostgreSQL Backup

```bash
# Backup
docker-compose exec postgres pg_dump -U secos_user ai_secos_db > backup.sql

# Restore
cat backup.sql | docker-compose exec -T postgres psql -U secos_user ai_secos_db
```

### Neo4j Backup

```bash
# Create backup
docker-compose exec neo4j neo4j-admin database dump neo4j > neo4j-backup.dump
```

## Scaling

### Horizontal Scaling

For multiple backend instances, use a load balancer:

```yaml
services:
  backend-1:
    # ... backend config
  backend-2:
    # ... backend config
  load-balancer:
    image: nginx
    ports:
      - "8000:8000"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
```

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL status
docker-compose exec postgres pg_isready

# Check connection
docker-compose exec backend python -c "from app.database import SessionLocal; db = SessionLocal(); print(db.execute('SELECT 1'))"
```

### Neo4j Connection Issues

```bash
# Check Neo4j logs
docker-compose logs neo4j

# Restart Neo4j
docker-compose restart neo4j
```

## Performance Optimization

### PostgreSQL Tuning

Edit postgresql.conf:

```conf
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
```

### Application Tuning

Update docker-compose.yml:

```yaml
backend:
  environment:
    - WORKERS=4
    - THREADS=2
  resources:
    limits:
      cpus: '2'
      memory: 1G
```

## Security Checklist

- [ ] Change default passwords in .env
- [ ] Enable SSL/TLS (Let's Encrypt)
- [ ] Setup firewall (ufw)
- [ ] Enable 2FA for admin users
- [ ] Regular backups
- [ ] Update dependencies regularly
- [ ] Monitor logs for suspicious activity
- [ ] Setup intrusion detection
- [ ] Regular security audits
