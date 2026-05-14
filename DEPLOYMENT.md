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

`ecosystem.config.js` already targets:
- `PORT=3000`
- `TRUST_PROXY=1`
- one PM2 instance

If you want explicit shell exports instead:

```bash
export PORT=3000
export TRUST_PROXY=1
export ROOM_STATE_FILE='/var/www/Co-study/data/rooms.json'
export ROOM_STATE_BACKUP_DIR='/var/www/Co-study/data/backups'
export ALLOWED_ORIGINS='https://your-domain.com'
export MESH_PARTICIPANT_LIMIT=4
```

Optional TURN config:

```bash
export ICE_SERVERS_JSON='[
  { "urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { "urls": "turn:turn.example.com:3478", "username": "turn-user", "credential": "turn-password" }
]'
```

If you set `SFU_BASE_URL`, it must be an absolute `http(s)` URL.

Managed media behavior in production:
- `mesh` is the default room mode and respects `MESH_PARTICIPANT_LIMIT`
- `sfu` rooms are available only when `SFU_BASE_URL` is configured
- Rooms do not migrate between `mesh` and `sfu` after creation
- AI focus monitoring stays available in mesh rooms only

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
- create a mesh room and confirm video works with 2 participants
- confirm the 5th participant is blocked from a full mesh room
- create an SFU room and confirm the embedded media session loads
- verify a password-protected room in both mesh and SFU modes
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
