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
SERVICE_USER="halastudy"
PM2_HOME="${STATE_DIR}/.pm2"

if [[ $EUID -ne 0 ]]; then echo "Run with sudo."; exit 1; fi
echo "== Halastudy bootstrap for ${DOMAIN} (service user ${SERVICE_USER}) =="

# --- Node 22 + packages ---
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
    echo "-- installing Node 22"
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi
apt-get install -y git nginx certbot python3-certbot-nginx ufw

# --- dedicated service identity ---
if ! id -u "${SERVICE_USER}" >/dev/null 2>&1; then
    useradd --system --user-group --home-dir "${STATE_DIR}" --no-create-home --shell /bin/bash "${SERVICE_USER}"
fi
install -d -m 0700 -o "${SERVICE_USER}" -g "${SERVICE_USER}" "${STATE_DIR}" "${STATE_DIR}/backups" "${PM2_HOME}"

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
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${APP_DIR}"
sudo -u "${SERVICE_USER}" env HOME="${STATE_DIR}" bash -lc "cd ${APP_DIR} && npm ci --omit=dev"

# --- state dirs outside the repo (survive re-clone / git clean) ---
chown -R "${SERVICE_USER}:${SERVICE_USER}" "${STATE_DIR}"

# --- nginx site (HTTP only; certbot injects TLS) ---
echo "-- installing Nginx site"
sed "s/__DOMAIN__/${DOMAIN}/g" "${APP_DIR}/scripts/deploy/nginx-halastudy.conf" \
    > /etc/nginx/sites-available/halastudy
ln -sf /etc/nginx/sites-available/halastudy /etc/nginx/sites-enabled/halastudy
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# --- firewall ---
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status verbose

# --- PM2 ---
if ! command -v pm2 >/dev/null 2>&1; then
    npm install -g pm2
fi
PM2_HOME="${PM2_HOME}" pm2 startup systemd -u "${SERVICE_USER}" --hp "${STATE_DIR}"

# --- encrypted nightly backup timer (enabled after the env file exists) ---
echo "-- installing encrypted backup timer"
install -m 0644 "${APP_DIR}/scripts/deploy/halastudy-backup.service" /etc/systemd/system/halastudy-backup.service
install -m 0644 "${APP_DIR}/scripts/deploy/halastudy-backup.timer" /etc/systemd/system/halastudy-backup.timer
systemctl daemon-reload

cat <<NEXT

== Bootstrap done. Remaining steps (need your secrets + DNS) ==

1. Point DNS: create an A record for ${DOMAIN} (and www) → this box's public IP.
   Confirm it resolves:  dig +short ${DOMAIN}

2. Create the env file ${STATE_DIR}/.env  — start from ${APP_DIR}/.env.example.
   Minimum production environment:
       NODE_ENV=production
       HOST=127.0.0.1
       TRUST_PROXY=1
       ALLOWED_ORIGINS=https://${DOMAIN}
       ROOM_STATE_FILE=${STATE_DIR}/rooms.json
       USER_STATE_FILE=${STATE_DIR}/users.json
       ROOM_STATE_BACKUP_DIR=${STATE_DIR}/backups
       BACKUP_INTERVAL_MINUTES=0
       BACKUP_ENCRYPTION_KEY=<32 random bytes as base64; see .env.example>
       SESSION_SECRET=<first value from npm run secret:gen>
       ADMIN_SESSION_SECRET=<second value from npm run secret:gen>
       ADMIN_PATH=/ops-<random>       ADMIN_PASSWORD_HASH=<npm run admin:hash -- "pw">
       VIDEO_PROVIDER=realtimekit
       # ENABLE_DEV_MESH and ICE_SERVERS_JSON are rejected in production.
       # R2 off-site backups (optional): R2_* from .env.example

3. TLS certificate (DNS must resolve first):
       sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN} --redirect -m you@${DOMAIN} --agree-tos -n

4. Start under PM2 and enable the nightly encrypted backup timer:
       sudo chown ${SERVICE_USER}:${SERVICE_USER} ${STATE_DIR}/.env
       sudo chmod 600 ${STATE_DIR}/.env
       sudo -u ${SERVICE_USER} -H env HOME=${STATE_DIR} PM2_HOME=${PM2_HOME} bash ${APP_DIR}/scripts/deploy/start.sh
       sudo systemctl enable --now halastudy-backup.timer

5. Verify:
       npm --prefix ${APP_DIR} run verify:deploy -- https://${DOMAIN}
       sudo systemctl list-timers halastudy-backup.timer
NEXT
