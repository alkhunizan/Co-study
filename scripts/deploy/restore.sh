#!/usr/bin/env bash
# Offline encrypted restore wrapper. It loads the same protected service env as
# the nightly backup without exposing secrets through command-line arguments.
set -euo pipefail

SERVICE_USER="halastudy"
APP_DIR="/opt/halastudy"
STATE_DIR="/var/lib/halastudy"
ENV_FILE="/var/lib/halastudy/.env"

if [[ "$(id -un)" != "${SERVICE_USER}" ]]; then
    echo "Restore must run as ${SERVICE_USER}."
    exit 1
fi

umask 077

if [[ ! -f "${ENV_FILE}" || -L "${ENV_FILE}" ]]; then
    echo "Missing regular environment file: ${ENV_FILE}."
    exit 1
fi
if [[ "$(stat -c '%U' "${STATE_DIR}")" != "${SERVICE_USER}" ]]; then
    echo "${STATE_DIR} must be owned by ${SERVICE_USER}."
    exit 1
fi
if [[ "$(stat -c '%a' "${STATE_DIR}")" != "700" ]]; then
    echo "${STATE_DIR} must have mode 700."
    exit 1
fi
if [[ "$(stat -c '%U' "${ENV_FILE}")" != "${SERVICE_USER}" ]]; then
    echo "${ENV_FILE} must be owned by ${SERVICE_USER}."
    exit 1
fi
case "$(stat -c '%a' "${ENV_FILE}")" in
    400|600) ;;
    *) echo "${ENV_FILE} must have mode 400 or 600."; exit 1 ;;
esac

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export NODE_ENV=production

apply_requested=false
for argument in "$@"; do
    if [[ "${argument}" == "--apply" ]]; then
        apply_requested=true
        break
    fi
done
if [[ "${apply_requested}" == "true" ]]; then
    if ! command -v pm2 >/dev/null 2>&1; then
        echo "Cannot verify the single writer is stopped because pm2 is unavailable."
        exit 1
    fi
    if ! writer_pid="$(PM2_HOME="${STATE_DIR}/.pm2" pm2 pid co-study 2>/dev/null)"; then
        echo "Cannot verify the co-study PM2 process state."
        exit 1
    fi
    if [[ "${writer_pid}" =~ [1-9][0-9]* ]]; then
        echo "Refusing restore: co-study PM2 writer is still running (PID ${writer_pid})."
        exit 1
    fi
fi

cd "${APP_DIR}"
exec /usr/bin/node scripts/restore-state.js "$@"
