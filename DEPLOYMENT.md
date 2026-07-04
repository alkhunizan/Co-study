# Co-Study Deployment Guide

This guide assumes the hardened launch setup:
- `server.js` runs the app on local HTTP
- Nginx terminates public TLS and proxies to `http://127.0.0.1:3000`
- `server-https.js` is kept only for local secure-context testing
- PM2 runs a single application instance

## 1. Prepare the Server

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx
sudo npm install -g pm2
```

## 2. Clone and Install

```bash
cd /var/www
sudo git clone https://github.com/alkhunizan/Co-study.git
cd Co-study
sudo npm ci
```

## 3. Configure the App Environment

Production should use the HTTP entrypoint behind Nginx TLS.

See [`.env.example`](.env.example) for every variable the app reads, with
production-shaped values and inline notes. The critical production settings:

- **`ROOM_STATE_FILE` / `ROOM_STATE_BACKUP_DIR`** — point these OUTSIDE the repo
  directory (e.g. `/var/lib/halastudy/`). The defaults are repo-relative, so a
  future `git clean` or re-clone during a deploy would destroy live room state.
- **`ALLOWED_ORIGINS`** — set the exact public origin explicitly; do not rely on
  the empty-list fallback.
- **`ICE_SERVERS_JSON`** — set a TURN relay. STUN-only (the default) fails across
  the CGNAT'd mobile networks common in the Gulf.
- **RealtimeKit env** — set `VIDEO_PROVIDER=realtimekit`,
  `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_REALTIMEKIT_APP_ID`, and
  `CLOUDFLARE_REALTIMEKIT_API_TOKEN`. These are server-only secrets.
- **Video caps** — keep `MAX_GLOBAL_VIDEO_PARTICIPANTS=20` and
  `MAX_ROOM_VIDEO_PARTICIPANTS=20` for launch cost control.
- **`SESSION_SECRET`** — REQUIRED in production (min 32 chars); startup fails
  without it. HMAC key for user/admin auth cookies. Rotating it signs everyone
  out. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
- **`USER_STATE_FILE`** — point it outside the repo like the room state
  (e.g. `/var/lib/halastudy/users.json`).
- **`BACKUP_INTERVAL_MINUTES` / `BACKUP_RETENTION_COUNT`** — automated
  rooms+users backups into `ROOM_STATE_BACKUP_DIR` (e.g. `60` / `48` keeps two
  days of hourly snapshots).

### Hidden admin portal

The ops console exists only when BOTH vars are set; otherwise every admin URL
404s exactly like any unknown path:

```bash
npm run admin:hash -- "your-strong-admin-password"   # prints ADMIN_PASSWORD_HASH=...
export ADMIN_PATH='/ops-<random-slug>'               # 8-64 chars, keep it unguessable
export ADMIN_PASSWORD_HASH='<salt:hex from above>'
```

Then open `https://your-domain.com$ADMIN_PATH`. The console covers: live
overview, room inspect/force-close/kick, the runtime video kill-switch, user
search + ban/unban, the site-wide broadcast banner, backup-now, and the
recent-errors view. The admin session cookie is Path-scoped to `ADMIN_PATH`
and expires after 12 hours. If the path ever leaks (proxy logs, browser
history), rotate `ADMIN_PATH` — the password remains the real gate.

`ecosystem.config.js` already targets:
- `PORT=3000`
- `TRUST_PROXY=1`
- one PM2 instance

If you want explicit shell exports instead:

```bash
export PORT=3000
export TRUST_PROXY=1
export ROOM_STATE_FILE='/var/lib/halastudy/rooms.json'
export ROOM_STATE_BACKUP_DIR='/var/lib/halastudy/backups'
export ALLOWED_ORIGINS='https://your-domain.com'
export MESH_PARTICIPANT_LIMIT=4
export VIDEO_PROVIDER=realtimekit
export VIDEO_JOIN_DISABLED=false
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

Optional TURN config:

```bash
export ICE_SERVERS_JSON='[
  { "urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { "urls": "turn:turn.example.com:3478", "username": "turn-user", "credential": "turn-password" }
]'
```

If you set `SFU_BASE_URL`, it must be an absolute `http(s)` URL.

RealtimeKit behavior in production:
- The backend creates/reuses one RealtimeKit meeting per Halastudy room.
- The browser receives only the participant `authToken`, never Cloudflare account/app/API credentials.
- New video token issuance is blocked when the global active video count reaches 20 or the room active video count reaches 20.
- Expired idle provider meetings are recycled after `MAX_ROOM_DURATION_MINUTES`; active expired meetings reject new video tokens.
- Set `VIDEO_JOIN_DISABLED=true` as a kill switch if provider errors or costs spike.
- Recording, screenshare, and provider chat stay disabled for launch.
- `VIDEO_PROVIDER=mesh` is an emergency fallback to the legacy P2P path; `sfu` rooms remain available only when `SFU_BASE_URL` is configured.

Launch budget math:

```text
20 users x 4 hours/day x 60 minutes x 30 days = 144,000 participant-minutes/month
144,000 x $0.002 = $288/month
```

This estimate depends on the hard 20-user global cap and keeping recording,
screenshare, transcription, and AI extras off.

## 4. Start the App with PM2

```bash
sudo pm2 start ecosystem.config.js
sudo pm2 save
sudo pm2 startup
pm2 status
```

Keep the app on a single PM2 instance. Room persistence uses one JSON state file and is not intended for clustered or multi-writer deployments in this v1 setup.

## 5. Configure Nginx

Create `/etc/nginx/sites-available/co-study`:

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

    access_log /var/log/nginx/co-study-access.log;
    error_log /var/log/nginx/co-study-error.log;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
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
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
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
cd /var/www/Co-study
npm run verify:deploy -- https://your-domain.com
```

`/api/ready` should return `200` with all checks set to `true`.

Manual media spot-check before launch:
- create a RealtimeKit room and confirm video works with 2 participants
- confirm participants 1-20 can join and the 21st participant is rejected
- verify camera defaults on, microphone defaults off, recording is unavailable, and screenshare is disabled unless explicitly enabled
- if `VIDEO_PROVIDER=mesh` is used as a fallback, confirm the legacy 4-person mesh cap still blocks the 5th participant
- verify a password-protected room before requesting a RealtimeKit token
- verify reconnect behavior after a participant drops and rejoins

## Backup and Restore

Manual backup:

```bash
cd /var/www/Co-study
npm run backup:rooms
```

Manual restore:

```bash
pm2 stop co-study
npm run restore:rooms -- /absolute/path/to/backup.json
pm2 start co-study
npm run verify:deploy -- https://your-domain.com
```

Restore is an offline operator action. Do not overwrite the room-state file while the app is running.

## Maintenance

```bash
pm2 status
pm2 logs co-study
pm2 restart co-study
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/ready
```

## Updating the App

```bash
cd /var/www/Co-study
sudo git pull
sudo npm ci
npm run audit:prod
npm run test:integration
pm2 restart co-study
npm run verify:deploy -- https://your-domain.com
pm2 status
```

## Release Checklist

Ship boring, predictable releases. On the dev machine, before deploying:

1. `npm run test:ci` is green (all 7 gates) and `VERSION` / `CHANGELOG.md` are bumped.
2. `git tag vX.Y.Z.W` on the release commit; `git push --tags`.

On the server, deploy the tag:

```bash
cd /var/www/Co-study
git fetch --tags
git checkout vX.Y.Z.W          # deploy an immutable tag, not a moving branch
npm ci --omit=dev
pm2 reload co-study            # zero-config restart; note instances:1 = a brief socket drop
npm run verify:deploy -- https://your-domain.com
pm2 status
```

If `verify:deploy` fails, roll back immediately:

```bash
git checkout vPREVIOUS.TAG
npm ci --omit=dev
pm2 reload co-study
npm run verify:deploy -- https://your-domain.com
```

## Notes

- `TRUST_PROXY=1` is required behind Nginx so secure cookies and client IP handling work correctly.
- If `ALLOWED_ORIGINS` is set, include the exact public origin such as `https://your-domain.com`.
- TURN credentials are delivered to the browser at runtime because WebRTC requires the client to receive them.
- If room history matters, keep backups of `ROOM_STATE_FILE`.
- The hardened rate limits are intentionally lightweight and in-memory. They protect a single app instance, not a distributed deployment.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `verify:deploy` fails on readiness | Check PM2 logs and `curl http://127.0.0.1:3000/api/ready` for the failing check. |
| `502 Bad Gateway` | Confirm PM2 is running `server.js` and Nginx proxies to `http://127.0.0.1:3000`. |
| Users get blocked too quickly | Review app logs for `RATE_LIMITED` responses and confirm normal traffic is not bursty. |
| Some users cannot connect video | Add a TURN server through `ICE_SERVERS_JSON`. |
| Secure cookies are missing | Confirm `TRUST_PROXY=1` and `X-Forwarded-Proto` are reaching the app through Nginx. |
