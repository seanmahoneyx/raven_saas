#!/usr/bin/env bash
# Pull latest main and apply on the pilot droplet.
#
# Run from anywhere on the droplet:
#     /opt/raven/scripts/deploy.sh
#
# - Rebuilds the web image only when files baked into it actually changed
#   (apps/, shared/, theme/, frontend/, raven/, requirements.txt, Dockerfile).
#   Pure nginx.conf or docker-compose.yml changes skip the rebuild.
# - Always runs `docker compose up -d` so changed services get recreated
#   and the nginx resolver re-picks the new web IP automatically.
# - Smoke-checks /api/v1/health/ at the end so a 5xx is loud.

set -euo pipefail

# Find the repo root (scripts/ lives one level inside it)
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

log()  { printf "\n\033[1;36m→ %s\033[0m\n" "$*"; }
warn() { printf "\n\033[1;33m! %s\033[0m\n" "$*"; }
fail() { printf "\n\033[1;31m✗ %s\033[0m\n" "$*"; exit 1; }

log "Pulling latest from main..."
BEFORE="$(git rev-parse HEAD)"
git fetch origin main
git pull --ff-only origin main
AFTER="$(git rev-parse HEAD)"

if [ "$BEFORE" = "$AFTER" ]; then
    log "Already at $AFTER — nothing to deploy."
    docker compose ps
    exit 0
fi

log "New commits:"
git log --oneline "$BEFORE..$AFTER"

CHANGED="$(git diff --name-only "$BEFORE" "$AFTER")"
log "Files changed:"
printf '    %s\n' $CHANGED

# Anything that ends up baked into the web image (must mirror the COPY
# directives in Dockerfile — if a path is added there, add it here too).
if echo "$CHANGED" | grep -qE '^(apps/|users/|shared/|theme/|raven/|templates/|frontend/|manage\.py|gunicorn\.conf\.py|requirements\.txt|Dockerfile)'; then
    log "Backend/frontend changes detected — rebuilding web image..."
    docker compose build web
else
    log "Only infra/config changed — skipping image rebuild."
fi

log "docker compose up -d..."
docker compose up -d

log "Waiting 10s for services to settle..."
sleep 10

log "Status:"
docker compose ps

log "Health check:"
HTTP_CODE="$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 10 http://localhost/api/v1/health/ || true)"
if [ "$HTTP_CODE" = "200" ]; then
    printf '    /api/v1/health/ → HTTP 200 ✓\n'
else
    warn "/api/v1/health/ returned HTTP ${HTTP_CODE:-(no response)} — investigate:"
    printf '    docker compose logs web --tail=50\n'
    printf '    docker compose logs nginx --tail=50\n'
    exit 1
fi

log "Deploy complete: $BEFORE → $AFTER"
