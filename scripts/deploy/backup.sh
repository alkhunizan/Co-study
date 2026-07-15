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

with_r2=false
check_r2=false
if [[ $# -gt 0 ]]; then
    if [[ $# -ne 1 || ( "$1" != "--with-r2" && "$1" != "--check-r2" ) ]]; then
        echo "Usage: backup.sh [--with-r2|--check-r2]"
        exit 1
    fi
    if [[ "$1" == "--with-r2" ]]; then
        with_r2=true
    else
        check_r2=true
    fi
fi

if [[ "${check_r2}" == "true" ]]; then
    exec /usr/bin/node scripts/backup-r2.js --check
fi
/usr/bin/node scripts/backup-state.js
if [[ "${with_r2}" == "true" ]]; then
    exec /usr/bin/node scripts/backup-r2.js --apply-retention
fi
