#!/usr/bin/env bash
# Start Halastudy under PM2 with the env from /var/lib/halastudy/.env.
# Run this script as the dedicated halastudy account. The app reads process.env
# directly, so this is the single production env-file loader.
set -euo pipefail

SERVICE_USER="halastudy"
APP_DIR="/opt/halastudy"
ENV_FILE="/var/lib/halastudy/.env"
export HOME="/var/lib/halastudy"
export PM2_HOME="/var/lib/halastudy/.pm2"

if [[ "$(id -un)" != "${SERVICE_USER}" ]]; then
    echo "Run as ${SERVICE_USER}: sudo -u ${SERVICE_USER} -H bash ${APP_DIR}/scripts/deploy/start.sh"
    exit 1
fi

# State snapshots, logs, and files created by Node must default to owner-only.
umask 077

if [[ ! -f "${ENV_FILE}" ]]; then
    echo "Missing ${ENV_FILE} — create it from ${APP_DIR}/.env.example first."; exit 1
fi
if [[ "$(stat -c '%U' "${ENV_FILE}")" != "${SERVICE_USER}" ]]; then
    echo "${ENV_FILE} must be owned by ${SERVICE_USER}."; exit 1
fi
case "$(stat -c '%a' "${ENV_FILE}")" in
    400|600) ;;
    *) echo "${ENV_FILE} must have mode 400 or 600."; exit 1 ;;
esac

# Load the env (export every var) then hand off to PM2.
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

# These are topology invariants, not operator-tunable secrets.
export HOME="/var/lib/halastudy"
export PM2_HOME="/var/lib/halastudy/.pm2"
export NODE_ENV=production
export PORT=3000
export HOST=127.0.0.1
export TRUST_PROXY=1

cd "${APP_DIR}"
if pm2 describe co-study >/dev/null 2>&1; then
    pm2 restart co-study --update-env
else
    pm2 start ecosystem.config.js
fi
pm2 save --force

echo "Halastudy started. Check: pm2 status && pm2 logs co-study --lines 20"
