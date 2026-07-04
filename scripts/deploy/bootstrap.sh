#!/usr/bin/env bash
# Halastudy one-shot server bootstrap for a fresh Ubuntu box (AWS Lightsail
# Bahrain / me-south-1 recommended). Idempotent — safe to re-run.
#
# Does everything that needs no secrets and no live DNS:
#   - Node 22, git, nginx, certbot
#   - clone/pull the repo to /opt/halastudy, npm ci --omit=dev
#   - state dirs at /var/lib/halastudy (rooms/users/backups) outside the repo
#   - install the halastudy Nginx site (HTTP; certbot adds TLS later)
#
# Then it prints the remaining steps (env file, certbot, start) — those need
# your secrets and DNS pointing at this box, so they stay explicit.
#
# Usage:  sudo bash scripts/deploy/bootstrap.sh [domain]
set -euo pipefail

DOMAIN="${1:-halastudy.com}"
REPO_URL="${REPO_URL:-https://github.com/alkhunizan/Co-study.git}"
APP_DIR="/opt/halastudy"
STATE_DIR="/var/lib/halastudy"
RUN_USER="${SUDO_USER:-$USER}"

if [[ $EUID -ne 0 ]]; then echo "Run with sudo."; exit 1; fi
echo "== Halastudy bootstrap for ${DOMAIN} (user ${RUN_USER}) =="

# --- Node 22 + packages ---
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
    echo "-- installing Node 22"
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi
apt-get install -y git nginx certbot python3-certbot-nginx ufw

# --- code ---
if [[ -d "${APP_DIR}/.git" ]]; then
    echo "-- updating repo"
    git -C "${APP_DIR}" fetch --all --quiet
    git -C "${APP_DIR}" checkout main --quiet
    git -C "${APP_DIR}" pull --ff-only --quiet
else
    echo "-- cloning repo"
    git clone --branch main "${REPO_URL}" "${APP_DIR}"
fi
chown -R "${RUN_USER}:${RUN_USER}" "${APP_DIR}"
sudo -u "${RUN_USER}" bash -lc "cd ${APP_DIR} && npm ci --omit=dev"

# --- state dirs outside the repo (survive re-clone / git clean) ---
mkdir -p "${STATE_DIR}/backups"
chown -R "${RUN_USER}:${RUN_USER}" "${STATE_DIR}"

# --- nginx site (HTTP only; certbot injects TLS) ---
echo "-- installing Nginx site"
sed "s/__DOMAIN__/${DOMAIN}/g" "${APP_DIR}/scripts/deploy/nginx-halastudy.conf" \
    > /etc/nginx/sites-available/halastudy
ln -sf /etc/nginx/sites-available/halastudy /etc/nginx/sites-enabled/halastudy
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# --- firewall ---
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 'Nginx Full' >/dev/null 2>&1 || true
yes | ufw enable >/dev/null 2>&1 || true

# --- PM2 ---
sudo -u "${RUN_USER}" bash -lc "npm ls -g pm2 >/dev/null 2>&1 || npm install -g pm2" || npm install -g pm2

cat <<NEXT

== Bootstrap done. Remaining steps (need your secrets + DNS) ==

1. Point DNS: create an A record for ${DOMAIN} (and www) → this box's public IP.
   Confirm it resolves:  dig +short ${DOMAIN}

2. Create the env file ${STATE_DIR}/.env  — start from ${APP_DIR}/.env.example.
   Minimum for a mesh beta:
       NODE_ENV=production
       ALLOWED_ORIGINS=https://${DOMAIN}
       ROOM_STATE_FILE=${STATE_DIR}/rooms.json
       USER_STATE_FILE=${STATE_DIR}/users.json
       ROOM_STATE_BACKUP_DIR=${STATE_DIR}/backups
       BACKUP_INTERVAL_MINUTES=60
       SESSION_SECRET=<npm run secret:gen>
       ADMIN_PATH=/ops-<random>       ADMIN_PASSWORD_HASH=<npm run admin:hash -- "pw">
       VIDEO_PROVIDER=mesh
       ICE_SERVERS_JSON=<npm run cloudflare:turn>    # TURN — needed for Saudi cellular
       # R2 off-site backups (optional): R2_* from .env.example

3. TLS certificate (DNS must resolve first):
       sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --redirect -m you@${DOMAIN} --agree-tos -n

4. Start under PM2:
       bash ${APP_DIR}/scripts/deploy/start.sh

5. Verify:
       npm --prefix ${APP_DIR} run verify:deploy -- https://${DOMAIN}
NEXT
