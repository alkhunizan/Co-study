# Cloudflare in front of Halastudy

Three roles, all keeping the Node app on the Gulf VM behind Nginx:

1. **DNS + proxy/CDN** — Cloudflare fronts `halastudy.com`: edge TLS, static-asset
   caching, DDoS protection.
2. **RealtimeKit** — provider-authoritative production video, configured through
   `scripts/cloudflare/` and verified by the signed webhook flow.
3. **R2** — optional storage for already-encrypted backup artifacts.

---

## 1. DNS + proxy/CDN

### 1.1 Add the site
1. Add `halastudy.com` in the Cloudflare dashboard; it gives you two nameservers.
2. Set those nameservers at your registrar. Wait for activation.

### 1.2 DNS records (proxied = orange cloud)
| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `halastudy.com` (`@`) | `<VM public IP>` | Proxied |
| CNAME | `www` | `halastudy.com` | Proxied |

### 1.3 TLS: Full (strict)
Nginx on the VM already terminates TLS with a Let's Encrypt cert (`DEPLOYMENT.md §6`).
In Cloudflare → SSL/TLS → set the mode to **Full (strict)** so Cloudflare↔origin
is encrypted and validated. (Alternatively, install a Cloudflare **Origin
Certificate** on the VM and keep certbot as a fallback.) Turn on **Always Use HTTPS**.

### 1.4 Caching — cache assets, NEVER cache app traffic
Halastudy is a live app: `/api/*` is dynamic, `/socket.io/*` is a WebSocket, and
the admin path must never be cached. Only the static asset mounts are cacheable.

Create a **Cache Rule** (Caching → Cache Rules):
- **Eligible for cache** when URI path starts with any of:
  `/images/`, `/videos/`, `/js/`, `/design-system/`, `/audio/`, or the file is
  `/favicon.svg` / `/manifest.webmanifest`. Set Edge TTL ~1 day (the app already
  sends matching `Cache-Control` on these mounts).
- **Bypass cache** (a higher-priority rule) when the path starts with `/api/`,
  `/socket.io/`, or your `ADMIN_PATH`. Also bypass when the `Cookie` header
  contains `coStudyAuth` (signed-in responses must never be shared).

Leave the HTML pages (`/`, `/open.html`, `/study`, `/account.html`) **uncached**
or "respect origin" — they're tiny and the signed-in/guest topbar swap happens
client-side via `/api/auth/me`, so a cached HTML page is fine either way, but
default to not caching to avoid stale copy after a deploy.

WebSockets (`/socket.io/`) pass through Cloudflare's proxy automatically — no
extra setting needed, just don't cache them.

### 1.5 CRITICAL — restore the real client IP at Nginx
This is the one that will silently break things if skipped. The app rate-limits
per client IP and the login lockout is keyed `ip:email`. With Cloudflare proxying,
every request arrives from a **Cloudflare** IP, so without this fix all users
share one rate-limit bucket — one person hitting a limit locks everyone, and the
login lockout becomes trivially abusable or useless.

Cloudflare sends the true client IP in the `CF-Connecting-IP` header. Configure
Nginx (with the `ngx_http_realip_module`) to trust Cloudflare's ranges and rewrite
the client IP, then pass a clean `X-Forwarded-For` to the app. In the `server`
block that proxies to `localhost:3000`:

```nginx
# Cloudflare edge IP ranges — refresh from https://www.cloudflare.com/ips/
# (list both IPv4 and IPv6 set_real_ip_from entries).
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
# … all Cloudflare ranges …
real_ip_header CF-Connecting-IP;

location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;          # WebSocket
    proxy_set_header Connection "upgrade";           # WebSocket
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $remote_addr;   # now the real client IP
    proxy_set_header X-Real-IP $remote_addr;
}
```

The app already runs with `TRUST_PROXY=1`, which trusts exactly one hop (Nginx).
Because Nginx replaces `$remote_addr` with the real client IP above and forwards
it, `req.ip` in the app resolves to the actual visitor — so rate limiting and the
login lockout work correctly. **Verify after cutover:** two devices on different
networks should get independent rate-limit budgets (create rooms rapidly from one;
the other stays unaffected).

`ALLOWED_ORIGINS=https://halastudy.com` and the origin guard are unaffected —
Cloudflare preserves the `Host`, so same-origin checks still pass.

### 1.6 Lock the origin to Cloudflare (optional, recommended)
After cutover, restrict the VM firewall so ports 80/443 accept only Cloudflare's
IP ranges. That stops anyone from bypassing Cloudflare by hitting the VM's raw IP
(which would also bypass the real-IP restoration and the WAF).

---

## 2. TURN is local-development-only

Production uses Cloudflare RealtimeKit and rejects `VIDEO_PROVIDER=mesh`; do not
put `ICE_SERVERS_JSON` or static TURN credentials in the production environment.
Production startup also rejects `ENABLE_DEV_MESH=true`. An explicit local mesh
test must set both `VIDEO_PROVIDER=mesh` and `ENABLE_DEV_MESH=true`; only signed-in
account sockets may relay camera/RTC signals. Request short-lived TURN credentials,
keep them in a developer-only env file, and rotate them before expiry. Never copy
those credentials into PM2, systemd, a container image, or a committed file.

Verify production with `npm run cloudflare:doctor`, signed webhook checks,
`npm run verify:deploy -- https://halastudy.com`, and a real two-device,
two-carrier camera test (`LAUNCH.md §5`).

---

## 3. R2 — off-site state backups

Local backups die with the VM. R2 can keep seven daily off-box copies of the
client-side encrypted `.hsbackup` artifact. The uploader refuses to select raw
room or user JSON files.

1. In the dashboard → **R2 → Manage API Tokens**, create an S3-compatible token.
   It gives an **Access Key ID**, **Secret Access Key**, and an account endpoint
   `https://<account-id>.r2.cloudflarestorage.com`.
2. Add to `.env` (see `.env.example` → Cloudflare R2):
   ```bash
   R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
   R2_ACCESS_KEY_ID=<...>
   R2_SECRET_ACCESS_KEY=<...>
   R2_BUCKET=halastudy-backups
   BACKUP_R2_ENABLED=true
   ```
3. Verify the credentials (creates the bucket if missing, PUT/GET/DELETE round-trip):
   ```bash
   sudo -u halastudy -H /opt/halastudy/scripts/deploy/backup.sh --check-r2
   ```
4. Create and validate the encrypted local artifact, then upload it on demand:
   ```bash
   sudo -u halastudy -H /opt/halastudy/scripts/deploy/backup.sh --with-r2
   # → encrypted/halastudy-<UTC timestamp>-<id>.hsbackup
   ```

The canonical nightly scheduler is `halastudy-backup.timer`; see
[`BACKUP-RESTORE.md`](BACKUP-RESTORE.md). Do not put secrets directly in a cron
line, and do not upload raw state files. With `BACKUP_R2_ENABLED` absent or
`false`, the scheduler intentionally creates only the protected local artifact.
When it is exactly `true`, missing R2 configuration or a failed upload fails the
nightly job. The explicitly scoped automated
retention pass keeps seven daily encrypted artifacts and can delete only
validated backup keys under the fixed `encrypted/` prefix. Use
`backup-r2.js --retention-dry-run` to inspect candidates without mutation.

Pre-cutover rollback pins use the separate fixed `pinned/pre-cutover/` prefix
and are excluded from automated retention. Create and authenticate the local
pin first, then upload it without accepting a caller-selected key:

```bash
sudo -u halastudy -H /opt/halastudy/scripts/deploy/backup.sh --pin-pre-cutover
sudo -u halastudy -H /opt/halastudy/scripts/deploy/backup.sh --upload-pinned-pre-cutover
```

The uploader signs requests with AWS SigV4 using only `node:crypto`
(`scripts/cloudflare/r2-client.js`) — no aws-sdk, consistent with the app's
zero-runtime-dependency rule. The S3 data operations use the Access Key pair; the
`cfat_` Bearer token (if you saved it as `R2_API_TOKEN`) is only for REST bucket
management and isn't needed for uploads.

To collect deletion-review evidence for legacy `users/` objects without reading
their bodies or changing R2, run `npm run inventory:r2-users -- --dry-run`.
The inventory has no deletion/apply mode; see
[`CONTAINMENT-EVIDENCE.md`](./CONTAINMENT-EVIDENCE.md).

## What I can automate once the Cloudflare connector is authorized
There is currently no Cloudflare MCP connector attached to this session, so the
steps above are manual (dashboard + one `.env` paste). If you add the **Cloudflare**
connector in claude.ai → Settings → Connectors, a future session can create the DNS
records, set the cache rules, and manage RealtimeKit/R2 configuration
instead of by hand.
