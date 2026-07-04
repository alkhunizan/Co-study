# Halastudy — Launch Runbook

A linear, day-of checklist to take Halastudy from `LOCAL-TEST-GO` to a live
private beta. Everything the code can do is done; this covers the ops steps
that need a real box, real credentials, and real devices.

`DEPLOYMENT.md` is the detailed reference (Nginx, PM2, TLS). This file is the
ordered path — do the steps top to bottom.

---

## 0. Before you touch a server (local, 10 min)

- [ ] `npm run test:ci` is green on `main`.
- [ ] Generate secrets you'll need on the box:
  - `npm run secret:gen` → copy the `SESSION_SECRET=…` line.
  - `npm run admin:hash -- "<a-strong-admin-password>"` → copy `ADMIN_PASSWORD_HASH=…`.
  - Pick an unguessable `ADMIN_PATH`, e.g. `/ops-$(openssl rand -hex 4)` → something like `/ops-7f3k9qwe2`.
- [ ] Decide the domain (e.g. `halastudy.com`) and confirm you control its DNS.

## 1. Provision the VM (~20 min)

- [ ] Create a **Gulf-region** Linux VM. Recommended: AWS Lightsail **Bahrain (me-south-1)**, 1GB/1vCPU (~$12/mo). Region matters — latency to Saudi users is the whole point.
- [ ] Open firewall ports 80, 443, and 22 (SSH). See `DEPLOYMENT.md §7`.
- [ ] Point the domain's A record at the VM's static IP.

> **Optional but recommended:** put Cloudflare in front of the VM (DNS, edge TLS,
> asset caching, DDoS shield). Full setup — including the **critical Nginx real-IP
> restoration** so per-IP rate limiting keeps working behind the proxy — is in
> **`docs/CLOUDFLARE.md §1`**. Do it after step 2's Nginx is up.

## 2. Deploy the app (~20 min, follow DEPLOYMENT.md §1–§6)

- [ ] Install Node 22, clone the repo, `npm ci --omit=dev`.
- [ ] Create the state dir **outside** the repo: `sudo mkdir -p /var/lib/halastudy && sudo chown $USER /var/lib/halastudy`.
- [ ] Write `/var/lib/halastudy/.env` (or use `ecosystem.config.js`). Start from `.env.example` and set, at minimum:

```bash
NODE_ENV=production
PORT=3000
TRUST_PROXY=1
ALLOWED_ORIGINS=https://halastudy.com          # your exact origin
ROOM_STATE_FILE=/var/lib/halastudy/rooms.json
USER_STATE_FILE=/var/lib/halastudy/users.json
ROOM_STATE_BACKUP_DIR=/var/lib/halastudy/backups
BACKUP_INTERVAL_MINUTES=60
SESSION_SECRET=<from npm run secret:gen>        # REQUIRED — startup fails without it
ADMIN_PATH=<your secret slug>                   # both admin vars or neither
ADMIN_PASSWORD_HASH=<from npm run admin:hash>
# TURN — see step 3
ICE_SERVERS_JSON=<your TURN JSON>
# RealtimeKit video — server-only secrets
VIDEO_PROVIDER=realtimekit
CLOUDFLARE_ACCOUNT_ID=<...>
CLOUDFLARE_REALTIMEKIT_APP_ID=<...>
CLOUDFLARE_REALTIMEKIT_API_TOKEN=<...>
VIDEO_DEFAULT_PRESET_NAME=halastudy_student
```

- [ ] Start under PM2, **single instance** (persistence is single-process by design): `pm2 start ecosystem.config.js`.
- [ ] Configure Nginx as the TLS terminator + reverse proxy (`DEPLOYMENT.md §5`) and issue the cert with certbot (`§6`).

## 3. Wire managed TURN (~15 min) — do NOT skip

STUN-only fails across the CGNAT'd mobile networks common in the Gulf, so camera
connections would silently fail for real users. Cloudflare Realtime TURN is the
recommended relay — see **`docs/CLOUDFLARE.md §2`** for the full setup, then:

- [ ] TURN key created, `CLOUDFLARE_TURN_*` in `.env`.
- [ ] `npm run cloudflare:turn` → paste the printed `ICE_SERVERS_JSON=…` into `.env`.
- [ ] Restart the app so `/api/runtime-config` serves the new ICE servers.

## 4. Verify the live box (~5 min)

- [ ] `npm run verify:deploy -- https://halastudy.com`
  - Confirms `/api/health`, `/api/ready` (all stores loaded), and `/api/metrics`.
- [ ] `npm run cloudflare:doctor` — verifies RealtimeKit creds + preset without spending.
- [ ] Open `https://halastudy.com` — landing renders, no console errors.
- [ ] Open `https://halastudy.com$ADMIN_PATH` — admin login card appears; sign in; the overview tiles populate. Confirm a random path (`/ops-wrong`) 404s.

## 5. Real-device QA (~30 min) — the step that actually de-risks launch

Two phones on **two different cellular carriers** (STC + Mobily/Zain), not Wi-Fi:

- [ ] Both create/join a room; cameras connect within a few seconds.
- [ ] Mic stays off by default; toggling camera works both ways.
- [ ] Sign up on one device → focus a short Pomodoro → streak persists after reload.
- [ ] Scheduled-room creation is blocked as a guest, works signed in.
- [ ] From the admin console, broadcast a banner → it appears in the open room; force-close the room → the student is bounced.

## 6. Go / No-Go

Ship to your first ~5 real Saudi students only when: verify:deploy is green,
two-carrier camera QA passed, and the admin console works end-to-end. Everything
else (Supabase migration, admin 2FA, email verification) is a post-signal
problem — don't gate the beta on it.

## 7. First-week ops

- [ ] Point an uptime monitor at `/api/metrics` (or `/api/health`).
- [ ] `data/backups/` fills hourly (rooms + users) — spot-check after day 1.
- [ ] Off-site backups to Cloudflare R2 (survives VM loss): set `R2_*` in `.env`, `npm run backup:r2 -- --check`, then cron `npm run backup:r2`. See `docs/CLOUDFLARE.md §3`.
- [ ] Keep the admin video kill-switch in mind: if RealtimeKit cost spikes, flip it from the console (Video tab) to stop new joins instantly without a redeploy.
- [ ] `npm run cloudflare:cost-check` to watch participant-minutes vs the $288/mo guardrail.

---

_Blocked items are yours (VM, domain, TURN account, physical devices). Once a box
exists and `.env` is set, `verify:deploy` + the QA checklist are the whole gate._
