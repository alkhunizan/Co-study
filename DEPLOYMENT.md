# Co-Study Deployment Guide

This is a prepared operator procedure, not authorization to deploy. Follow
[the additive rollout](docs/ROLLOUT-COMPATIBILITY.md) for ordering. The current
readiness candidate contains uncommitted repairs; `e9412fd` alone omits them.
Select an approved immutable candidate and record its full source SHA, lockfile
checksum and gate results before installation. A generic clone of GitHub main
does not identify this candidate.

Before deploying the October 2026 platform changes, follow the [platform migration and restore guide](docs/implementation/2026-10-20-platform/OPERATIONS.md). Recover live data, dry-run migration against a copy, and verify a canonical database backup. Old JSON files stop updating after SQL import; switching back to them is not a rollback. Payment simulation is unavailable in production. These changes have not been deployed by this implementation task.

This guide assumes the hardened launch setup:
- `server.js` runs the app on local HTTP
- Nginx terminates public TLS and proxies to `http://127.0.0.1:3000`
- `server-https.js` is kept only for local secure-context testing
- PM2 runs one application instance as the dedicated `halastudy` service user

## 1. Prepare the Server

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx
sudo npm install -g pm2
```

## 2. Clone and Install

```bash
sudo useradd --system --user-group --home-dir /var/lib/halastudy \
  --no-create-home --shell /bin/bash halastudy
sudo install -d -m 0700 -o halastudy -g halastudy \
  /var/lib/halastudy /var/lib/halastudy/backups /var/lib/halastudy/.pm2
sudo git clone https://github.com/alkhunizan/Co-study.git /opt/halastudy
sudo chown -R halastudy:halastudy /opt/halastudy
```

Before installing dependencies, place the separately approved source revision
at `/opt/halastudy` and verify its SHA. Then run `npm ci --omit=dev` there as
`halastudy`. Stop any existing writer before replacing code or dependencies.
The optional `scripts/deploy/bootstrap.sh` provisions the host but clones or
updates GitHub `main`; it is not a candidate release updater. Its printed
minimum environment is incomplete; use the requirements below.

## 3. Configure the App Environment

Production should use the HTTP entrypoint behind Nginx TLS.

See [`.env.example`](.env.example) for every variable the app reads, with
production-shaped values and inline notes. The critical production settings:

Create `/var/lib/halastudy/.env` as a service-owned mode-`0400`/`0600` file
inside the mode-`0700` state directory. Use plain `KEY=value` entries with no
shell expressions or inline comments; quote shell metacharacters. `start.sh`
sources this file, whereas `verify:deploy --env-file` uses a restricted parser.
The Node entrypoints do not automatically load `.env`. Include
`NODE_ENV=production` for operator commands as well as application startup.

- **`ROOM_STATE_FILE` / `ROOM_STATE_BACKUP_DIR`** — point these OUTSIDE the repo
  directory (e.g. `/var/lib/halastudy/`). The defaults are repo-relative, so a
  future `git clean` or re-clone during a deploy would destroy live room state.
- **`ALLOWED_ORIGINS`** — set the exact public origin explicitly; do not rely on
  the empty-list fallback.
- **Supabase env** — set both `SUPABASE_URL` and
  `SUPABASE_SERVICE_ROLE_KEY`. Production startup rejects missing or partial
  configuration; the local users file is development/test-only.
- **RealtimeKit env** — set `VIDEO_PROVIDER=realtimekit`,
  `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_REALTIMEKIT_APP_ID`, and
  `CLOUDFLARE_REALTIMEKIT_API_TOKEN`. These are server-only secrets.
- **Video caps** — keep `MAX_GLOBAL_VIDEO_PARTICIPANTS=20` and
  `MAX_ROOM_VIDEO_PARTICIPANTS=20` for launch cost control. Startup rejects
  values above the hard ceiling.
- **`SESSION_SECRET`** — REQUIRED in production and must encode exactly 32
  random bytes (the 64-hex output of `npm run secret:gen` is canonical);
  startup fails without it. `ADMIN_SESSION_SECRET` has the same requirement,
  must decode to different bytes, and must be generated independently.
  Generate both with `npm run secret:gen`; rotating either invalidates its
  corresponding cookies.
- **`USER_STATE_FILE`** — development/test fallback only; production accounts
  are Supabase-backed.
- **Runtime sidecars** — retain `${ROOM_STATE_FILE}.video-sessions.json` and
  `${ROOM_STATE_FILE}.realtimekit-webhooks.json` across code deployments and
  rollbacks. They are outside the six-dataset encrypted backup contract.
- **Google sign-in** — requires `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and
  an authorized callback matching `GOOGLE_REDIRECT_URI` (or the first allowed
  origin plus `/auth/google/callback`). Verify real sign-in/linking in staging.
- **`BACKUP_ENCRYPTION_KEY`** — exactly 32 random bytes encoded as canonical
  base64. The external service-user timer writes one AES-256-GCM artifact per
  UTC day and retains seven days. Keep `BACKUP_INTERVAL_MINUTES=0` in
  production so the legacy plaintext diagnostic scheduler stays disabled.

### Hidden admin portal

The ops console exists only when BOTH vars are set; otherwise every admin URL
404s exactly like any unknown path:

```bash
npm run admin:hash -- "your-strong-admin-password"   # prints ADMIN_PASSWORD_HASH=...
export ADMIN_PATH='/ops-<random-slug>'               # 8-64 chars, keep it unguessable
export ADMIN_PASSWORD_HASH='<salt:hex from above>'
```

Then open `https://your-domain.com$ADMIN_PATH`. The console uses the Ops
workspace layout (sidebar sections with `#overview`, `#rooms`, `#users`,
`#reports`, `#system` deep links; Arabic/English and light/dark toggles
remembered per browser) and covers: live overview, room
inspect/force-close/kick, user search + ban/unban, reports, and under System
the runtime video kill-switch, the site-wide broadcast banner, backup-now and
the recent-errors view. The admin session cookie is Path-scoped to `ADMIN_PATH`
and expires after 12 hours. If the path ever leaks (proxy logs, browser
history), rotate `ADMIN_PATH` — the password remains the real gate.

Every admin sign-in, sign-out, failed sign-in and console action (close, kick,
ban/unban, report resolve, video switch, broadcast set/clear, backup) is
appended to an audit log at `<ROOM_STATE_FILE>.admin-audit.jsonl`, one JSON
object per line with the action, target, optional reason, request IP and
time. Close, kick, ban and unban are refused (`REASON_REQUIRED`) unless the
request carries a reason of at least 3 characters; the console asks for one
in its confirmation dialog. The log sits next to the room state file, so it lives outside the repo
whenever `ROOM_STATE_FILE` does. At 5 MB it rotates to `.admin-audit.jsonl.1`,
replacing the previous older generation; copy that file off the host if you
need a longer history. The console reads the newest 1,000 entries from
`$ADMIN_PATH/api/audit`.

`ecosystem.config.js` already targets:
- `PORT=3000`
- `HOST=127.0.0.1`
- `TRUST_PROXY=1`
- one PM2 instance
- a 20-second graceful-shutdown window

If you want explicit shell exports instead:

```bash
export PORT=3000
export HOST=127.0.0.1
export TRUST_PROXY=1
export ROOM_STATE_FILE='/var/lib/halastudy/rooms.json'
export ROOM_STATE_BACKUP_DIR='/var/lib/halastudy/backups'
export BACKUP_INTERVAL_MINUTES=0
export BACKUP_ENCRYPTION_KEY='<32 random bytes as base64>'
export ALLOWED_ORIGINS='https://your-domain.com'
export SUPABASE_URL='https://your-project.supabase.co'
export SUPABASE_SERVICE_ROLE_KEY='<server-only service role key>'
export VIDEO_PROVIDER=realtimekit
export VIDEO_JOIN_DISABLED=true
export MAX_GLOBAL_VIDEO_PARTICIPANTS=20
export MAX_ROOM_VIDEO_PARTICIPANTS=20
export MAX_ROOM_DURATION_MINUTES=180
export VIDEO_RECORDING_ENABLED=false
export VIDEO_SCREENSHARE_ENABLED=false
export VIDEO_CHAT_ENABLED=false
export VIDEO_DEFAULT_PRESET_NAME=halastudy_student
export CLOUDFLARE_ACCOUNT_ID='replace_me'
export CLOUDFLARE_REALTIMEKIT_APP_ID='replace_me'
export CLOUDFLARE_REALTIMEKIT_API_TOKEN='replace_me'
```

Do not configure `ICE_SERVERS_JSON`, TURN credentials, `ENABLE_DEV_MESH`, or
`VIDEO_PROVIDER=mesh` in production; startup rejects them. Local mesh requires
`NODE_ENV=development`, `VIDEO_PROVIDER=mesh`, and `ENABLE_DEV_MESH=true`, and
the signaling server accepts only authenticated account sockets. If a local
mesh test needs TURN, use short-lived credentials and rotate them before expiry.

RealtimeKit behavior in production:
- The backend creates/reuses one RealtimeKit meeting per Halastudy room.
- The browser receives only the participant `authToken`, never Cloudflare account/app/API credentials.
- New video token issuance is blocked when the global active video count reaches 20 or the room active video count reaches 20.
- Expired idle provider meetings are recycled after `MAX_ROOM_DURATION_MINUTES`; active expired meetings reject new video tokens.
- Set `VIDEO_JOIN_DISABLED=true` as a kill switch if provider errors or costs spike.
- Recording, screenshare, and provider chat stay disabled; startup rejects
  attempts to enable them.
- Production rejects `VIDEO_PROVIDER=mesh`; provider outages fail closed for
  new video joins, and persisted legacy mesh rooms cannot relay RTC signaling.

Launch budget math:

```text
20 users x 4 hours/day x 60 minutes x 30 days = 144,000 participant-minutes/month
144,000 x $0.002 = $288/month
```

This estimate depends on the hard 20-user global cap and keeping recording,
screenshare, transcription, and AI extras off.

Provision distinct student/viewer presets with the reviewed
`npm run cloudflare:setup` command only when provider writes are authorized;
`npm run cloudflare:doctor` checks effective permissions. Setup does not register
the webhook subscription. Configure the provider to deliver
`meeting.participantJoined`, `meeting.participantLeft`, and `meeting.ended` to
`https://your-domain.com/api/webhooks/realtimekit`. Preserve the raw JSON body
and `rtk-signature` / `rtk-uuid` headers. The server verifies RSA-SHA256 and
deduplicates UUIDs for 24 hours, accepting only after durable state writes.
A missing verification key returns 503; an invalid signature returns 401 once
initialized. Verify real signed-event delivery separately from forged-signature
rejection. Browser heartbeat/leave calls do not establish authoritative occupancy.

## 4. Start the App with PM2

Run only after the rollout's offline steps: all three additive SQL migrations,
the stopped-writer room plan, a complete pinned backup with verified dry-run,
and the guarded room migration. Keep video joins disabled during cutover.

```bash
sudo chown halastudy:halastudy /var/lib/halastudy/.env
sudo chmod 600 /var/lib/halastudy/.env
sudo -u halastudy -H env HOME=/var/lib/halastudy \
  PM2_HOME=/var/lib/halastudy/.pm2 \
  bash /opt/halastudy/scripts/deploy/start.sh
sudo -u halastudy -H env PM2_HOME=/var/lib/halastudy/.pm2 pm2 status
```

The bootstrap script installs the systemd resurrection unit for this same
service user. Never start a second root-owned PM2 daemon. Keep the app on one
instance: room persistence is not a clustered or multi-writer store.

`start.sh` checks service identity and env ownership/mode, applies umask `077`,
and restarts or starts one PM2 process with updated environment. Startup awaits
room, user, video-session and webhook-journal hydration, drains durable work,
and reconciles provider meetings before listening. Hydration retries are bounded;
failure exits startup. Wait for readiness, not merely PM2 status. Preserve the
20-second graceful shutdown window for persistence drains.

## 5. Configure Nginx

Use `scripts/deploy/nginx-halastudy.conf` as the canonical template, replacing
`__DOMAIN__` with the approved domain. It starts HTTP-only so Certbot can issue
TLS after DNS resolves. Run `nginx -t` before reloading. The expanded TLS example
below applies only after certificates exist. If using Cloudflare, configure
real-IP restoration per [the proxy guide](docs/CLOUDFLARE.md).

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name your-domain.com;

    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    access_log /var/log/nginx/co-study-access.log;
    error_log /var/log/nginx/co-study-error.log;

    location = /api/ready {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 5s;
        proxy_read_timeout 5s;
        access_log off;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Enable the site:

```bash
sudo ln -s /etc/nginx/sites-available/co-study /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

## 6. Issue the Public Certificate

```bash
sudo certbot --nginx -d your-domain.com
```

Certbot will update the public Nginx certificate paths and set up renewal.

## 7. Open Firewall Ports

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

## Health and Verification

The app exposes:
- `GET /api/health`
- `GET /api/ready`

Post-deploy check:

```bash
sudo -u halastudy -H /opt/halastudy/scripts/deploy/backup.sh
sudo -u halastudy -H npm --prefix /opt/halastudy run verify:deploy -- \
  https://your-domain.com --env-file /var/lib/halastudy/.env
```

`/api/ready` should return `200` with all checks set to `true`.

`verify:deploy` checks package version, readiness, metrics, runtime configuration,
provider presets, forged-webhook rejection, Socket.IO polling, static manifest,
HTTPS/HSTS, and a fresh complete schema-v2 daily backup. It does not verify the
deployed Git SHA, Google sign-in, real event delivery, or physical camera behavior.
Record the server source SHA separately and complete [LAUNCH.md](LAUNCH.md).

## Room v2 Migration

Legacy room state remains readable at startup and is never rewritten merely by
booting the service. Before the v2 rollout, inspect the metadata-only plan while
the service is running:

```bash
sudo -u halastudy -H env NODE_ENV=production /usr/bin/node \
  --env-file=/var/lib/halastudy/.env /opt/halastudy/scripts/migrate-rooms.js
```

In production, the planner reads only `id,my_rooms` from paginated Supabase
profiles and fails closed if either Supabase credential is missing. Review any
ambiguous ownership (it remains unassigned and admin-managed), resolve every
blocking schedule issue, then stop the single writer and apply with both guards:

```bash
sudo -u halastudy -H env PM2_HOME=/var/lib/halastudy/.pm2 pm2 stop co-study
sudo -u halastudy -H env PM2_HOME=/var/lib/halastudy/.pm2 pm2 pid co-study
sudo -u halastudy -H env NODE_ENV=production /usr/bin/node \
  --env-file=/var/lib/halastudy/.env /opt/halastudy/scripts/migrate-rooms.js \
  --apply --writer-stopped
sudo -u halastudy -H env HOME=/var/lib/halastudy \
  PM2_HOME=/var/lib/halastudy/.pm2 bash /opt/halastudy/scripts/deploy/start.sh
curl -fsS http://127.0.0.1:3000/api/ready
```

Apply first writes a new mode-`0600`, checksummed pre-migration backup without
overwriting an existing backup, then atomically replaces the same room file.
Keep the reported backup path through the rollout observation window.

Manual media spot-check before launch:
- create a RealtimeKit room and confirm video works with 2 participants
- confirm participants 1-20 can join and the 21st participant is rejected
- verify camera defaults on, microphone defaults off, recording and screenshare are unavailable
- verify a password-protected room before requesting a RealtimeKit token
- verify reconnect behavior after a participant drops and rejoins

## Backup and Restore

The canonical production backup is the service-owned nightly timer, not the
in-process diagnostic snapshotter. Configure and enable it after the protected
environment file exists:

```bash
sudo chown halastudy:halastudy /var/lib/halastudy/.env
sudo chmod 600 /var/lib/halastudy/.env
sudo systemctl enable --now halastudy-backup.timer
sudo systemctl start halastudy-backup.service
sudo systemctl status halastudy-backup.service
```

Each `.hsbackup` artifact is AES-256-GCM authenticated before restore, contains
one encrypted schema/checksum manifest, and covers `profiles`,
`deletion_tombstones`, `focus_completion_claims`, `focus_sessions`, `room_events`,
and `rooms`. Seven UTC-daily snapshots are retained. Partial local artifacts
are diagnostic only; pins, R2 and deploy verification require all six sources
and zero failures. Runtime video sidecars and deployment secrets need separate
protected recovery planning. Zero readable sources creates no artifact.

Restore defaults to validation and dry-run. Applying requires the app's single
writer to be stopped plus both explicit flags:

```bash
sudo -u halastudy -H env PM2_HOME=/var/lib/halastudy/.pm2 pm2 stop co-study
sudo -u halastudy -H /opt/halastudy/scripts/deploy/restore.sh \
  /var/lib/halastudy/backups/halastudy-YYYY-MM-DDTHHMMSSZ-id.hsbackup
sudo -u halastudy -H /opt/halastudy/scripts/deploy/restore.sh \
  /var/lib/halastudy/backups/halastudy-YYYY-MM-DDTHHMMSSZ-id.hsbackup \
  --apply --writer-stopped
sudo -u halastudy -H env HOME=/var/lib/halastudy \
  PM2_HOME=/var/lib/halastudy/.pm2 bash /opt/halastudy/scripts/deploy/start.sh
sudo -u halastudy -H /opt/halastudy/scripts/deploy/backup.sh
sudo -u halastudy -H npm --prefix /opt/halastudy run verify:deploy -- \
  https://your-domain.com --env-file /var/lib/halastudy/.env
```

Current unexpired and all embedded deletion tombstones filter the restore plan;
current rows win conflicts. Apply order is active protective tombstones,
profiles, focus claims/sessions, room events, then the atomic room replacement.
Future-dated or at-least-30-day-old user-bearing artifacts fail closed, including
pins. Apply is phased, not transactional; keep the writer stopped on failure.
The service restore wrapper checks PM2 state in addition to both CLI flags. See
[Encrypted Backup and Restore](docs/BACKUP-RESTORE.md) for artifact details,
cron alternative, key recovery, R2 behavior, and failure handling.

The exact additive cutover, 24-hour observation, 14-day compatibility telemetry,
and rollback order are in
[Rollout Compatibility](docs/ROLLOUT-COMPATIBILITY.md).

## Maintenance

```bash
sudo -u halastudy -H env PM2_HOME=/var/lib/halastudy/.pm2 pm2 status
sudo -u halastudy -H env PM2_HOME=/var/lib/halastudy/.pm2 pm2 logs co-study
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/ready
```

## Updating the App

Use an approved immutable source revision and the additive rollout procedure.
Stop the writer before replacing source/dependencies; restart via `start.sh`
with the protected environment. Do not use a moving-branch pull or PM2 rolling
reload as the release procedure.

## Release Checklist

Use Node 22 with no production credentials:

```bash
npm ci
NODE_ENV=test npm run test:ci:quality
NODE_ENV=test npm run test:ci:infra
NODE_ENV=test npm run test:smoke
```

Infrastructure validation needs Linux, Docker, tar and ShellCheck (or its Docker
fallback). It applies all three SQL migrations twice to disposable PostgreSQL,
checks security/idempotency/deletion assertions, scans container layers and the
final filesystem, and validates Nginx. Use LF shell scripts as in a Linux Git
checkout; directly copied Windows CRLF scripts fail ShellCheck. Browser smoke
covers Chromium/WebKit on desktop/mobile. GitHub Actions runs these three jobs.

`VERSION=1.2.0.0` uses the existing four-part display convention; manifest/lock
version `1.2.0` uses npm semver. This reconciliation assigns no new release.
Finalize release notes, version and immutable artifact after all readiness
gates, including real-provider/device and recovery checks, pass. Publication
and production cutover remain separately authorized actions.

If verification fails, disable new video joins and follow the
[rollback sequence](docs/ROLLOUT-COMPATIBILITY.md#rollback-sequence). Use a
known-good dual-read build that retains authorization fixes. Prefer code-only
rollback with current additive state; state restore needs separate approval,
a safe artifact, and a stopped writer. Preserve current sidecars and incident
evidence. Do not roll back blindly to a generic previous tag.

## Notes

- `TRUST_PROXY=1` is required behind Nginx so secure cookies and client IP handling work correctly.
- If `ALLOWED_ORIGINS` is set, include the exact public origin such as `https://your-domain.com`.
- Production media is RealtimeKit-managed; never place static TURN credentials
  in the production environment.
- Treat `BACKUP_ENCRYPTION_KEY` as a recovery-critical secret and regularly
  prove a dry-run restore from the newest artifact.
- The hardened rate limits are intentionally lightweight and in-memory. They protect a single app instance, not a distributed deployment.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `verify:deploy` fails on readiness | Check PM2 logs and `curl http://127.0.0.1:3000/api/ready` for the failing check. |
| `502 Bad Gateway` | Confirm PM2 is running `server.js` and Nginx proxies to `http://127.0.0.1:3000`. |
| Users get blocked too quickly | Review app logs for `RATE_LIMITED` responses and confirm normal traffic is not bursty. |
| Some users cannot connect video | Check RealtimeKit preset/webhook health, provider reconciliation, and the video kill switch; do not downgrade production to mesh. |
| Secure cookies are missing | Confirm `TRUST_PROXY=1` and `X-Forwarded-Proto` are reaching the app through Nginx. |
