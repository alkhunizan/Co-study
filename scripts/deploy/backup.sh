#!/usr/bin/env bash
# Nightly encrypted Halastudy backup. This wrapper is shared by systemd and
# cron so both paths enforce the same service-user and env-file boundary.
set -euo pipefail

SERVICE_USER="halastudy"
APP_DIR="/opt/halastudy"
STATE_DIR="/var/lib/halastudy"
ENV_FILE="/var/lib/halastudy/.env"

if [[ "$(id -un)" != "${SERVICE_USER}" ]]; then
    echo "Backup must run as ${SERVICE_USER}."
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

# Environment files cannot choose the executable search path or runtime mode.
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export NODE_ENV=production
cd "${APP_DIR}"

mode="nightly"
if [[ $# -gt 1 ]]; then
    echo "Usage: backup.sh [--with-r2|--check-r2|--pin-pre-cutover|--upload-pinned-pre-cutover]"
    exit 1
fi
if [[ $# -eq 1 ]]; then
    case "$1" in
        --with-r2) mode="with-r2" ;;
        --check-r2) mode="check-r2" ;;
        --pin-pre-cutover) mode="pin-pre-cutover" ;;
        --upload-pinned-pre-cutover) mode="upload-pinned-pre-cutover" ;;
        *)
            echo "Usage: backup.sh [--with-r2|--check-r2|--pin-pre-cutover|--upload-pinned-pre-cutover]"
            exit 1
            ;;
    esac
fi

backup_r2_enabled="${BACKUP_R2_ENABLED:-false}"
case "${backup_r2_enabled}" in
    true|false) ;;
    *) echo "BACKUP_R2_ENABLED must be exactly true or false."; exit 1 ;;
esac

require_r2_config() {
    local name
    for name in R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET; do
        if [[ -z "${!name:-}" ]]; then
            echo "${name} is required when R2 backup upload is enabled."
            exit 1
        fi
    done
}

if [[ "${mode}" == "check-r2" ]]; then
    require_r2_config
    exec /usr/bin/node scripts/backup-r2.js --check
fi
if [[ "${mode}" == "pin-pre-cutover" ]]; then
    exec /usr/bin/node scripts/backup-state.js --pin-pre-cutover
fi
if [[ "${mode}" == "upload-pinned-pre-cutover" ]]; then
    if [[ "${backup_r2_enabled}" != "true" ]]; then
        echo "Pinned R2 upload requires BACKUP_R2_ENABLED=true."
        exit 1
    fi
    require_r2_config
    exec /usr/bin/node scripts/backup-r2.js --upload-pinned-pre-cutover
fi

with_r2=false
if [[ "${backup_r2_enabled}" == "true" ]]; then
    require_r2_config
    with_r2=true
fi
if [[ "${mode}" == "with-r2" && "${with_r2}" != "true" ]]; then
    echo "R2 upload requires BACKUP_R2_ENABLED=true."
    exit 1
fi

/usr/bin/node scripts/backup-state.js
if [[ "${with_r2}" == "true" ]]; then
    exec /usr/bin/node scripts/backup-r2.js --apply-retention
fi
