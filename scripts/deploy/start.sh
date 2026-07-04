#!/usr/bin/env bash
# Start Halastudy under PM2 with the env from /var/lib/halastudy/.env.
# The app reads process.env directly (no dotenv), so we source the file before
# pm2 start; PM2 then captures those vars, and ecosystem.config.js layers on
# NODE_ENV/PORT/TRUST_PROXY. Re-run to reload after an env or code change.
set -euo pipefail

APP_DIR="/opt/halastudy"
ENV_FILE="/var/lib/halastudy/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
    echo "Missing ${ENV_FILE} — create it from ${APP_DIR}/.env.example first."; exit 1
fi

# Load the env (export every var) then hand off to PM2.
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

cd "${APP_DIR}"
if pm2 describe co-study >/dev/null 2>&1; then
    pm2 restart co-study --update-env
else
    pm2 start ecosystem.config.js
fi
pm2 save
# Make PM2 resurrect on reboot (prints a command to run once as root if needed).
pm2 startup systemd -u "$USER" --hp "$HOME" >/dev/null 2>&1 || true

echo "Halastudy started. Check: pm2 status && pm2 logs co-study --lines 20"
