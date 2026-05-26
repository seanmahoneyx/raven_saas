# Pilot Deploy Runbook — DigitalOcean

Step-by-step guide to stand up a fresh pilot of MS Packaging & Supply
Distribution on a single DigitalOcean Droplet. Estimated time: ~1 hour
once you have the inputs ready.

---

## 0. Prerequisites

Before you start, have these in hand:

| Item | Where to get it |
|---|---|
| DigitalOcean account | https://www.digitalocean.com (referral links give $200 credit) |
| SSH keypair | `ssh-keygen -t ed25519 -C "raven-pilot"` if you don't have one |
| Sentry DSN (optional) | https://sentry.io → new project (Django) |
| SMTP credentials | Whatever provider you use for outgoing email |

---

## 1. Create the Spaces bucket (S3-compatible storage for attachments)

1. DO Console → **Spaces Object Storage** → **Create Spaces Bucket**.
2. Region: **NYC3** (or whichever is closest to your users).
3. Name: `mspackaging-raven-media` (must be globally unique).
4. CDN: leave **off** for now (you can enable later).
5. After creation: **Settings** → **Access Keys** → **Generate New Key**.
   Save the **access key** and **secret** — you cannot view the secret again.

---

## 2. Create the Droplet

1. **Droplets** → **Create Droplet**.
2. **Marketplace** → search for **Docker on Ubuntu 24.04**. Pick that image.
3. **Plan:** Basic / Regular SSD / **$12/mo (2 GB RAM, 1 vCPU)**.
4. **Datacenter:** same region as the Spaces bucket.
5. **VPC:** default is fine.
6. **Authentication:** **SSH keys** — paste your public key.
7. **Hostname:** `raven-pilot`.
8. **Backups:** **enabled** (+$1.20/mo, restores up to 4 weeks of snapshots).
9. **Create Droplet.** Wait ~60 seconds for it to come up.
10. Copy the public IPv4 address. This is your pilot URL until you add a domain.

---

## 3. SSH in and clone the repo

```bash
ssh root@<droplet-ip>

# Clone the repo
cd /opt
git clone https://github.com/seanmahoneyx/raven_saas.git raven
cd raven

# Allow Docker to act as the build runner (already installed via marketplace image)
docker --version
docker compose version
```

---

## 4. Fill in `.env`

```bash
cp .env.example .env
nano .env
```

Required values:

```dotenv
# Generate with: python3 -c "import secrets; print(secrets.token_urlsafe(50))"
SECRET_KEY=<generated 50+ char random string>

DEBUG=False

# The droplet's IP for now; add your domain later
ALLOWED_HOSTS=<droplet-ip>

# Strong password — match what you use in docker-compose
DB_PASSWORD=<strong random password>

# CORS / CSRF — same hostnames as ALLOWED_HOSTS, with scheme prefix
CORS_ALLOWED_ORIGINS=http://<droplet-ip>
CSRF_TRUSTED_ORIGINS=http://<droplet-ip>

# SMTP for email
DEFAULT_FROM_EMAIL=noreply@<your-domain-or-anything>
EMAIL_HOST=<your-smtp-host>
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER=<smtp-user>
EMAIL_HOST_PASSWORD=<smtp-password>

# Spaces (from Step 1)
USE_SPACES=True
AWS_ACCESS_KEY_ID=<spaces-access-key>
AWS_SECRET_ACCESS_KEY=<spaces-secret>
AWS_STORAGE_BUCKET_NAME=mspackaging-raven-media
AWS_S3_REGION_NAME=nyc3
AWS_S3_ENDPOINT_URL=https://nyc3.digitaloceanspaces.com
AWS_LOCATION=media
AWS_DEFAULT_ACL=private
AWS_QUERYSTRING_AUTH=True

# Sentry (optional — paste DSN from sentry.io project)
SENTRY_DSN=<dsn or leave blank>
SENTRY_ENVIRONMENT=pilot
```

Save and exit (`Ctrl+O`, `Enter`, `Ctrl+X` in nano).

---

## 5. Build and start the stack

```bash
docker compose build
docker compose up -d
docker compose ps   # all four services should be "running (healthy)" after ~60s
```

If any container is unhealthy, check logs:

```bash
docker compose logs web --tail=50
docker compose logs websocket --tail=50
docker compose logs nginx --tail=50
```

---

## 6. Initialize the database

```bash
# Apply all migrations (creates schema in the Postgres container)
docker compose exec web python manage.py migrate

# Bootstrap the default tenant + admin user + chart of accounts + GL defaults
docker compose exec web python manage.py seed_pilot

# Set the admin password (you'll be prompted)
docker compose exec web python manage.py changepassword admin
```

You should see the seed_pilot output confirm:
- Tenant `MS Packaging & Supply Distribution` created
- Auto-created TenantSettings and 10 TenantSequence rows (SO, PO, INV, BOL,
  CONTRACT, JE, EST, RFQ, FA, IR)
- Admin user `admin (seanmahoney621@gmail.com)` created
- Standard Chart of Accounts seeded (179 accounts)
- AccountingSettings defaults wired: AR (1110), AP (2010), Cash (1020),
  Inventory (1230), COGS (5000), Income (4000), GR/IR (2050)
- Onboarding pre-filled (address `40 Natcon Dr, Shirley, NY 11967`,
  phone `(631) 821-6567`, industry `distribution`, `onboarding_completed=True`)
- Default warehouse `WH-01 / Main Warehouse` created
- 6 default UoMs seeded: EA, CS, RL, PAL, BNDL, LB

Because `onboarding_completed=True` is set, the in-app onboarding wizard is
**bypassed for every user on this tenant** — testers go straight to the
dashboard after login. If you ever want to revisit the wizard (e.g. to add
more UoMs through the UI), set `onboarding_completed=False` on the tenant
from Django admin or the shell.

If you forget the GR/IR default and try to post a receipt-linked vendor bill
later, you'll get a `ValidationError` telling you to set it in Accounting
Settings — easy to recover from, but the seed handles it for you.

---

## 7. First login + smoke test

1. In a browser: `http://<droplet-ip>`
2. Log in as `admin` with the password you just set.
3. Confirm you land directly on the dashboard (no onboarding wizard —
   `seed_pilot` pre-completes it).
4. Go to **Admin → Data Import** and download a CSV template to verify
   the admin route loads.
5. Upload a small Customers CSV with `commit=false` (dry run) to verify
   parsing works.
6. **AP smoke (after imports in step 8):** Vendors → create a Vendor.
   Items → create an Item with an Asset account (any inventory account works).
   Invoices → Payable → **New Bill** → pick the vendor, add a line, Create →
   Post → Record Payment. If posting succeeds and the payment lands, the
   AP flow + GL accounts are wired correctly.
7. **Receipt → Bill smoke (optional):** create a confirmed PO with one line,
   click Receive on the PO detail page. Open **Item Receipts**, confirm a
   receipt row appeared. Open it and click **Create Bill from Receipt** →
   the new draft Bill should appear linked to the receipt; posting it
   should clear the GR/IR accrual (verify in Journal Entries: a posted JE
   debits 2050 GR/IR, credits 2010 A/P).

---

## 7a. Create pilot tester accounts

The `User` model has no tenant FK — `TenantMiddleware` resolves tenant from
subdomain/default per-request, so every account on this Django instance
automatically scopes to the seeded default tenant. Tester creation is
therefore just "make a user with a password":

**Option A — Django admin (recommended for one-off creates):**

1. Log in at `http://<droplet-ip>/admin/` as `admin`.
2. **Authentication and Authorization → Users → Add user**.
3. Username + password → Save.
4. On the next screen: leave `is_staff` and `is_superuser` **off** (unless
   you want them in /admin), set `is_active` = **on**, fill in name/email
   if useful, Save.
5. Hand the tester their username + password. They log in at
   `http://<droplet-ip>/` (not /admin) and land on the dashboard.

**Option B — Shell one-liner (fast for batch creates):**

```bash
docker compose exec web python manage.py shell -c "
from django.contrib.auth import get_user_model
U = get_user_model()
for username, pwd in [('alice', 'changeme1'), ('bob', 'changeme2')]:
    u, created = U.objects.get_or_create(username=username, defaults={'is_active': True})
    u.set_password(pwd); u.is_active = True; u.save()
    print(('created' if created else 'updated'), username)
"
```

Have testers change their password on first login (top-right user menu →
account settings, or `/admin/password_change/` if they're staff).

---

## 8. Import your data

Recommended order (foreign keys flow downward):

```
locations → warehouses → customers → vendors → items → inventory → gl-opening-balances
```

For each file:
1. Admin → Data Import → pick type.
2. Upload CSV with **dry run** enabled. Fix any validation errors.
3. Re-upload with **commit** enabled.

If you have items the existing 8 importers don't cover (contracts,
price lists, fixed assets), enter those manually via the UI for now.

---

## 9. Nightly off-site Postgres backup

The Spaces bucket from Step 1 is also a fine place to dump the DB.

```bash
# Install s3cmd
apt-get install -y s3cmd

# Configure (you'll be prompted for access key + secret)
s3cmd --configure
# Use Spaces endpoint: nyc3.digitaloceanspaces.com
# Use HTTPS: yes
# Test access at end — should succeed.

# Create the backup script
cat > /opt/raven/backup.sh <<'BACKUP'
#!/bin/bash
set -e
TS=$(date +%Y%m%d-%H%M%S)
cd /opt/raven
docker compose exec -T db pg_dump -U raven raven_db | gzip > /tmp/raven-${TS}.sql.gz
s3cmd put /tmp/raven-${TS}.sql.gz s3://mspackaging-raven-media/backups/
rm /tmp/raven-${TS}.sql.gz
BACKUP
chmod +x /opt/raven/backup.sh

# Test it once
/opt/raven/backup.sh

# Schedule it for 2am every day
( crontab -l 2>/dev/null; echo "0 2 * * * /opt/raven/backup.sh >> /var/log/raven-backup.log 2>&1" ) | crontab -
```

---

## 10. One-command updates

Going forward, push your changes to `main` on GitHub and on the droplet:

```bash
cd /opt/raven
git pull --ff-only
docker compose build
docker compose up -d
docker compose exec web python manage.py migrate
```

Optional convenience script:

```bash
cat > /opt/raven/deploy.sh <<'DEPLOY'
#!/bin/bash
set -e
cd /opt/raven
git pull --ff-only
docker compose build
docker compose up -d --no-deps web websocket nginx
docker compose exec -T web python manage.py migrate
docker compose exec -T web python manage.py collectstatic --noinput
echo "Deployed: $(git log -1 --format='%h %s')"
DEPLOY
chmod +x /opt/raven/deploy.sh
```

Now updates are: `ssh root@<ip> /opt/raven/deploy.sh`.

---

## 11. Adding a domain + HTTPS later

When you have a domain:

1. DNS → add an A record pointing your domain (e.g. `app.mspackaging.com`)
   at the droplet IP.
2. Easiest path: put **Cloudflare** in front (free plan handles HTTPS
   termination). Set Cloudflare SSL/TLS mode to "Flexible" initially, then
   move to "Full" after you've configured an origin cert.
3. Update `.env`:
   ```dotenv
   ALLOWED_HOSTS=app.mspackaging.com,<droplet-ip>
   CORS_ALLOWED_ORIGINS=https://app.mspackaging.com
   CSRF_TRUSTED_ORIGINS=https://app.mspackaging.com
   ```
4. `docker compose restart web websocket`
5. Alternative path (no Cloudflare): use Let's Encrypt via certbot on the
   nginx container. The nginx.conf has commented-out SSL blocks ready to
   uncomment.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| 403 immediately on every page after deploy | Forgot to run `seed_pilot` — the tenant middleware fails closed. Run it. |
| Login works but every page is "Not Found" | Frontend dist didn't rebuild. `docker compose build web nginx` and `up -d`. |
| Attachments uploaded but the link returns AccessDenied | `AWS_DEFAULT_ACL=private` + `AWS_QUERYSTRING_AUTH=True` is correct — the link must be a signed URL. If the app is using a raw URL, that's a bug to fix; for now, regenerate via the UI. |
| WebSocket dot in the UI stays grey | Daphne container unhealthy. `docker compose logs websocket`. Most often a Redis connection issue. |
| Slow page loads under concurrent use | `docker compose exec web nproc` — if gunicorn workers < (2 × cores + 1), edit `gunicorn.conf.py` to bump worker count and restart `web`. |
| Out of disk space | `docker system prune -a` to drop unused images. Long term: enlarge the droplet. |

---

## What's intentionally not in this runbook

- **HTTPS-on-day-one.** Pilot starts on `http://`. Add a domain + TLS in
  step 11 when you're ready to invite users outside your network.
- **Multi-droplet HA.** This is a single VM. Acceptable for a pilot of
  2–10 users; promote to managed Postgres + multiple web containers
  once the pilot proves out.
- **Auto-deploy from GitHub.** You can add a GitHub Actions workflow
  later that SSHes in and runs `/opt/raven/deploy.sh`. For a pilot, the
  one-command manual deploy is fine.
