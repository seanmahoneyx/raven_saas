# Raven SaaS - Digital Ocean Deployment Guide

This guide covers two deployment options for Raven SaaS on Digital Ocean.

---

## Option A: App Platform (Managed, Easy)

App Platform is Digital Ocean's PaaS. It handles SSL, scaling, and infrastructure automatically.

**Cost:** ~$29/mo (Professional plan) + $15/mo DB + $15/mo Redis = ~$59/mo starting

### Prerequisites

- Digital Ocean account
- GitHub repo with this codebase pushed
- `doctl` CLI installed (`brew install doctl` or [docs](https://docs.digitalocean.com/reference/doctl/how-to/install/))

### Step 1: Configure the App Spec

Edit `deploy/digitalocean/app.yaml`:

1. Replace `your-github-username/raven_saas` with your actual GitHub repo
2. Generate a secret key:
   ```bash
   python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
   ```
3. Update the `SECRET_KEY` value in the spec (or set it via DO dashboard after creation)

### Step 2: Deploy

```bash
# Authenticate with Digital Ocean
doctl auth init

# Create the app from spec
doctl apps create --spec deploy/digitalocean/app.yaml

# Or deploy via the DO dashboard:
# 1. Go to https://cloud.digitalocean.com/apps
# 2. Click "Create App"
# 3. Connect your GitHub repo
# 4. DO will detect the Dockerfile automatically
```

### Step 3: Run Migrations

After the first deploy completes:

```bash
# Find your app ID
doctl apps list

# Open a console
doctl apps console <app-id> web

# In the console:
python manage.py migrate
python manage.py createsuperuser
```

### Step 4: Custom Domain & SSL

1. Go to your app in the DO dashboard
2. Click "Settings" > "Domains"
3. Add your domain (e.g., `app.yourdomain.com`)
4. Point your DNS to the provided CNAME
5. SSL is provisioned automatically by DO

### Step 5: Environment Variables

Set sensitive values via the DO dashboard (Settings > App-Level Environment Variables):

- `SECRET_KEY` - Django secret key
- `DEFAULT_FROM_EMAIL` - Sender email address
- `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` - SMTP credentials

---

## Option B: Droplet with Docker Compose (More Control, Cheaper)

Run everything on a single Droplet using Docker Compose. More control over the stack and significantly cheaper at scale.

**Cost:** ~$12-24/mo for a 2-4GB Droplet (everything included)

### Prerequisites

- Digital Ocean account
- SSH key added to your DO account
- Domain name pointed to your Droplet IP

### Step 1: Create a Droplet

```bash
# Create a Docker-ready droplet
doctl compute droplet create raven-saas \
  --image docker-20-04 \
  --size s-2vcpu-4gb \
  --region nyc1 \
  --ssh-keys <your-ssh-key-fingerprint> \
  --tag-name raven
```

Or use the dashboard: Create Droplet > Marketplace > Docker on Ubuntu.

### Step 2: Initial Server Setup

SSH into the droplet:

```bash
ssh root@<droplet-ip>

# Create a deploy user (don't run as root)
adduser deploy
usermod -aG sudo deploy
usermod -aG docker deploy

# Copy SSH keys
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy

# Set up firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable

# Switch to deploy user
su - deploy
```

### Step 3: Clone and Configure

```bash
# Clone the repo
git clone https://github.com/your-username/raven_saas.git
cd raven_saas

# Create .env from template
cp .env.example .env

# Edit .env with production values
nano .env
```

Key values to set in `.env`:
```
SECRET_KEY=<generate-a-real-key>
DEBUG=False
ALLOWED_HOSTS=yourdomain.com,www.yourdomain.com
DB_PASSWORD=<strong-random-password>
CORS_ALLOWED_ORIGINS=https://yourdomain.com
```

### Step 4: Build and Start

```bash
# Build the images
docker compose build

# Start all services
docker compose up -d

# Run database migrations
docker compose exec web python manage.py migrate

# Create admin user
docker compose exec web python manage.py createsuperuser

# Verify everything is healthy
docker compose ps
curl http://localhost/api/v1/health/
```

### Step 5: SSL with Let's Encrypt

Install Certbot on the host and get certificates:

```bash
# Install certbot
sudo apt-get update
sudo apt-get install -y certbot

# Get certificates (stop nginx temporarily)
docker compose stop nginx
sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

# Copy certs to nginx directory
sudo mkdir -p nginx/certs
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/certs/
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/certs/
sudo chown -R deploy:deploy nginx/certs
```

Then edit `nginx/nginx.conf`:
1. Uncomment the HTTP-to-HTTPS redirect server block
2. Uncomment the SSL lines in the main server block
3. Replace `yourdomain.com` with your actual domain

```bash
# Restart nginx with SSL
docker compose up -d nginx

# Set up auto-renewal (cron)
sudo crontab -e
# Add this line:
# 0 3 * * * certbot renew --pre-hook "cd /home/deploy/raven_saas && docker compose stop nginx" --post-hook "cp /etc/letsencrypt/live/yourdomain.com/*.pem /home/deploy/raven_saas/nginx/certs/ && cd /home/deploy/raven_saas && docker compose up -d nginx"
```

### Step 6: Set Up a Managed Database (Optional but Recommended)

Instead of running PostgreSQL in Docker, use DO Managed Databases for automatic backups, failover, and updates:

```bash
# Create managed PostgreSQL
doctl databases create raven-db --engine pg --version 16 --size db-s-1vcpu-1gb --region nyc1

# Get connection details
doctl databases connection raven-db

# Update .env with managed DB credentials
# Then remove the db service from docker-compose.yml
```

---

## Database Migrations

Always run migrations after deploying new code:

```bash
# Docker Compose (Droplet)
docker compose exec web python manage.py migrate

# App Platform
doctl apps console <app-id> web
# Then: python manage.py migrate
```

For data migrations or schema changes, always back up first:

```bash
# Backup (Docker Compose)
docker compose exec db pg_dump -U raven raven_db > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup (Managed DB)
doctl databases backups list <db-id>
```

---

## Backup Strategy

### Database Backups

**Managed Database (App Platform / recommended):**
- Automatic daily backups with 7-day retention (included)
- Point-in-time recovery available

**Self-managed (Droplet with Docker Compose):**

```bash
# Create a backup script at /home/deploy/backup.sh
#!/bin/bash
BACKUP_DIR="/home/deploy/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Database backup
docker compose -f /home/deploy/raven_saas/docker-compose.yml \
  exec -T db pg_dump -U raven raven_db | gzip > $BACKUP_DIR/db_$TIMESTAMP.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +30 -delete

# Optional: upload to DO Spaces
# s3cmd put $BACKUP_DIR/db_$TIMESTAMP.sql.gz s3://your-bucket/backups/
```

```bash
# Schedule daily backups
chmod +x /home/deploy/backup.sh
crontab -e
# Add: 0 2 * * * /home/deploy/backup.sh
```

### Media File Backups

Option 1: Use DO Spaces for media storage (recommended, see `.env.example`)

Option 2: Sync media directory to Spaces:
```bash
# Install s3cmd
sudo apt-get install s3cmd
s3cmd --configure  # Enter your Spaces credentials

# Sync media files
s3cmd sync /home/deploy/raven_saas/media/ s3://your-bucket/media-backup/
```

---

## Updating / Redeploying

### App Platform
Push to `main` branch. Auto-deploy is enabled.

### Droplet

```bash
cd ~/raven_saas
git pull origin main
docker compose build
docker compose up -d
docker compose exec web python manage.py migrate
```

For zero-downtime deploys:

```bash
# Build new image
docker compose build web websocket

# Rolling restart (one at a time)
docker compose up -d --no-deps web
docker compose up -d --no-deps websocket
docker compose up -d --no-deps nginx
```

---

## Monitoring

### Health Check

```bash
# Quick check
curl https://yourdomain.com/api/v1/health/

# Expected response:
# {"status": "healthy", "database": "connected", "redis": "connected"}
```

### Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f web
docker compose logs -f nginx

# Last 100 lines
docker compose logs --tail=100 web
```

### Resource Usage

```bash
docker stats
```

---

## Troubleshooting

| Symptom | Check | Fix |
|---------|-------|-----|
| 502 Bad Gateway | `docker compose ps` - is web running? | `docker compose restart web` |
| WebSocket won't connect | `docker compose logs websocket` | Check ALLOWED_HOSTS includes your domain |
| Static files 404 | `docker compose exec web ls /app/staticfiles/` | `docker compose exec web python manage.py collectstatic` |
| Database connection error | `docker compose exec db pg_isready` | Check DB_HOST, DB_PASSWORD in .env |
| CORS errors | Check browser console for origin | Add origin to CORS_ALLOWED_ORIGINS in .env |
| CSRF errors behind proxy | Check CSRF_TRUSTED_ORIGINS | Add `CSRF_TRUSTED_ORIGINS=https://yourdomain.com` to .env |
