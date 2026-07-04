# Cloudflare in front of Halastudy

Two roles, both keeping the Node app on the Gulf VM behind Nginx:

1. **DNS + proxy/CDN** — Cloudflare fronts `halastudy.com`: edge TLS, static-asset
   caching, DDoS protection.
2. **TURN** — Cloudflare Realtime TURN fills `ICE_SERVERS_JSON` so camera calls
   survive Saudi cellular CGNAT.

RealtimeKit (video rooms) is already wired separately via `scripts/cloudflare/`.

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

## 2. Cloudflare TURN (for `ICE_SERVERS_JSON`)

STUN-only fails across CGNAT'd Saudi mobile networks, so a TURN relay is
mandatory (`LAUNCH.md §3`). Cloudflare Realtime includes a TURN service.

1. In the dashboard → **Realtime → TURN**, create a TURN key. Note the **key ID**
   and create an **API token** with the Realtime TURN edit permission.
2. Add to the VM's `.env`:
   ```bash
   CLOUDFLARE_TURN_KEY_ID=<key id>
   CLOUDFLARE_TURN_API_TOKEN=<api token>
   # optional, default 24h:
   CLOUDFLARE_TURN_TTL_SECONDS=86400
   ```
3. Generate credentials and copy the printed line into `.env`:
   ```bash
   npm run cloudflare:turn
   # → ICE_SERVERS_JSON=[{"urls":["stun:stun.cloudflare.com:3478"]},{"urls":[…],"username":"…","credential":"…"}]
   ```
4. Restart the app so `/api/runtime-config` serves the new ICE servers to browsers.

**TTL note for the beta:** Cloudflare TURN credentials are time-limited. `ICE_SERVERS_JSON`
is read once at boot, so a room that outlives the TTL could lose relay on a
reconnect. For the private beta a long TTL (24h+) plus a nightly regenerate +
restart is fine. If TURN reconnect issues show up at scale, the follow-up is to
make the app mint short-lived TURN credentials per session server-side (the
`turn-credentials.js` helper already speaks the API) rather than serving a static
blob — a small, well-scoped change, not needed for launch.

Verify with `npm run verify:deploy -- https://halastudy.com` and a real two-device,
two-carrier camera test (`LAUNCH.md §5`).

---

## What I can automate once the Cloudflare connector is authorized
There is currently no Cloudflare MCP connector attached to this session, so the
steps above are manual (dashboard + one `.env` paste). If you add the **Cloudflare**
connector in claude.ai → Settings → Connectors, a future session can create the DNS
records, set the cache rules, and rotate the TURN credentials programmatically
instead of by hand.
