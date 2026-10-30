# Halastudy — Launch Runbook

A checklist for an explicitly authorized private-beta cutover. The
[readiness plan](docs/superpowers/plans/2026-10-18-site-wide-readiness-plan.md)
still has open work. Local tests do not establish production readiness.

`DEPLOYMENT.md` is the detailed reference (Nginx, PM2, TLS). This file is the
operator checklist. The authoritative migration and rollback order is
[Rollout compatibility](docs/ROLLOUT-COMPATIBILITY.md); complete its offline
steps before starting the candidate. This document does not authorize deployment.

---

## 0. Before you touch a server (local, 10 min)

- [ ] Node 22 quality, Linux/Docker infrastructure, and all four browser projects
  pass for the exact reviewed candidate, with no production credentials in tests.
- [ ] Record source SHA, lockfile checksum, gate results, and the immutable
  release artifact. The current branch has uncommitted repairs; `e9412fd` alone
  omits them. `VERSION=1.2.0.0` and npm `1.2.0` describe the existing baseline,
  not deployed source identity. Assign the next version only at release review.
- [ ] Obtain authorization for the prepared production deployment and migrations.
- [ ] Generate secrets you'll need on the box:
  - `npm run secret:gen` → store both distinct `SESSION_SECRET` and `ADMIN_SESSION_SECRET` values securely.
  - Generate an independent 32-byte base64 backup key and retain a protected recovery copy.
  - `npm run admin:hash -- "<a-strong-admin-password>"` → copy `ADMIN_PASSWORD_HASH=…`.
  - Pick an unguessable `ADMIN_PATH`, e.g. `/ops-$(openssl rand -hex 4)` → something like `/ops-7f3k9qwe2`.
- [ ] Decide the domain (e.g. `halastudy.com`) and confirm you control its DNS.

## 1. Provision the VM (~20 min)

- [ ] Confirm the intended Linux host, capacity, domain and Saudi network latency.
- [ ] Open firewall ports 80, 443, and 22 (SSH). See `DEPLOYMENT.md §7`.
- [ ] Point the domain's A record at the VM's static IP.

> **Optional but recommended:** put Cloudflare in front of the VM (DNS, edge TLS,
> asset caching, DDoS shield). Full setup — including the **critical Nginx real-IP
> restoration** so per-IP rate limiting keeps working behind the proxy — is in
> **`docs/CLOUDFLARE.md §1`**. Do it after step 2's Nginx is up.

## 2. Provision the host and install the reviewed candidate

For fresh-host provisioning only, after authorization:

```bash
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/alkhunizan/Co-study.git /tmp/halastudy-bootstrap
sudo bash /tmp/halastudy-bootstrap/scripts/deploy/bootstrap.sh halastudy.com
```

That installs Node 22 + Nginx + certbot, clones the app to `/opt/halastudy`,
creates the state dirs at `/var/lib/halastudy`, installs the Nginx site, and
opens the firewall. It clones/updates GitHub main, not the reviewed candidate.
Before installation/start, select and verify the approved source revision at
`/opt/halastudy`; stop an existing writer before replacing source/dependencies.
Do not rerun bootstrap as a release updater or follow its abbreviated printed
env/start checklist without the complete deployment requirements and rollout.

<details><summary>Manual long-form (DEPLOYMENT.md §1–§6)</summary>

- [ ] Install Node 22, clone the repo, `npm ci --omit=dev`.
- [ ] Create the `halastudy` service user and owner-only state directory (the bootstrap script does this automatically).
- [ ] Write `/var/lib/halastudy/.env` using plain assignments without inline
  comments or shell expressions. PM2 config sets topology, not secrets.
  Start from `.env.example`; the annotated values below are a reference:

```bash
NODE_ENV=production
PORT=3000
HOST=127.0.0.1
TRUST_PROXY=1
ALLOWED_ORIGINS=https://halastudy.com          # your exact origin
ROOM_STATE_FILE=/var/lib/halastudy/rooms.json
ROOM_STATE_BACKUP_DIR=/var/lib/halastudy/backups
BACKUP_INTERVAL_MINUTES=0
BACKUP_ENCRYPTION_KEY=<32 random bytes as base64>
SESSION_SECRET=<from npm run secret:gen>        # REQUIRED — startup fails without it
ADMIN_SESSION_SECRET=<second generated value>  # REQUIRED and distinct
ADMIN_PATH=<your secret slug>                   # both admin vars or neither
ADMIN_PASSWORD_HASH=<from npm run admin:hash>
SUPABASE_URL=https://<project>.supabase.co      # REQUIRED in production
SUPABASE_SERVICE_ROLE_KEY=<server-only key>     # REQUIRED in production
# RealtimeKit video — server-only secrets
VIDEO_PROVIDER=realtimekit
VIDEO_JOIN_DISABLED=true
CLOUDFLARE_ACCOUNT_ID=<...>
CLOUDFLARE_REALTIMEKIT_APP_ID=<...>
CLOUDFLARE_REALTIMEKIT_API_TOKEN=<...>
VIDEO_DEFAULT_PRESET_NAME=halastudy_student
```

- [ ] Set `.env` owner/mode to `halastudy:halastudy`/`600` and state directory
  mode `700`. Start via `start.sh` only after the offline rollout below.
- [ ] Configure Nginx as the TLS terminator + reverse proxy (`DEPLOYMENT.md §5`) and issue the cert with certbot (`§6`).

</details>

- [ ] Rehearse all three SQL migrations on disposable PostgreSQL and designated
  staging, then apply the separately approved production migrations in order:
  `20260715000000_secure_baseline.sql`,
  `20260715010000_account_resurrection_focus_idempotency.sql`,
  `20260715020000_room_event_idempotency.sql`.
- [ ] Stop the writer and confirm no running PM2 PID before code replacement.
  Run the room plan with the protected environment, pin a complete encrypted
  backup, verify checksum/dry-run, then apply the guarded offline room migration.
  Preserve runtime video sidecars and the pre-migration room backup.

## 3. Provision managed RealtimeKit (~15 min) — do NOT skip

Production video is provider-authoritative and never downgrades to mesh. Run
the setup and doctor commands described in the **RealtimeKit launch notes in
`README.md`**, then:

- [ ] Student and viewer presets exist with the locked effective permissions.
- [ ] Register `/api/webhooks/realtimekit` for `meeting.participantJoined`,
  `meeting.participantLeft`, and `meeting.ended`; setup does not register it.
  Prove forged-signature rejection and real signed-event delivery/retry handling.
- [ ] `npm run cloudflare:doctor` passes before video joins are enabled.

## 4. Verify the live box (~5 min)

- [ ] Start the single writer with joins disabled; wait for full readiness.
- [ ] Run service-owned `backup.sh` to create a fresh complete daily artifact.
- [ ] Run `verify:deploy` as the service user with `--env-file`:

```bash
sudo -u halastudy -H npm --prefix /opt/halastudy run verify:deploy -- \
  https://halastudy.com --env-file /var/lib/halastudy/.env
```

- [ ] Record the backend source SHA separately; the verifier compares only
  package version. Check Google sign-in/linking and real Supabase persistence.
- [ ] `npm run cloudflare:doctor` — verifies RealtimeKit creds + preset without spending.
- [ ] Open `https://halastudy.com` — landing renders, no console errors.
- [ ] Open `https://halastudy.com$ADMIN_PATH` — admin login card appears; sign in; the overview tiles populate. Confirm a random path (`/ops-wrong`) 404s.

## 5. Real-device QA (~30 min) — the step that actually de-risks launch

Two phones on **two different cellular carriers** (STC + Mobily/Zain), not Wi-Fi:

Enable video for these controlled checks only after operational readiness.
Include iPhone Safari, Android Chrome, weak Wi-Fi, and a 60-minute session.

- [ ] Both create/join a room; cameras connect within a few seconds.
- [ ] Mic stays off by default; toggling camera works both ways.
- [ ] Sign up on one device → focus a short Pomodoro → streak persists after reload.
- [ ] Scheduled-room creation is blocked as a guest, works signed in.
- [ ] From the admin console, broadcast a banner → it appears in the open room; force-close the room → the student is bounced.

## 6. Go / No-Go

Invite the first five students only after the readiness plan's acceptance
criteria, provider/device checks, and recovery evidence pass, with explicit
release and invitation authorization. The admin video switch is in-memory;
persist the approved `VIDEO_JOIN_DISABLED` value in `.env` for restart
consistency. Record cutover time and follow the rollout's hour 1/4/12/24 checks
and 14-day compatibility window. Failures use its reviewed rollback sequence.

## 7. First-week ops

- [ ] Point an uptime monitor at `/api/metrics` (or `/api/health`).
- [ ] `/var/lib/halastudy/backups/` contains an authenticated `.hsbackup` artifact after the nightly timer; prove its dry-run restore after day 1.
- [ ] Enable exactly one backup scheduler. Optional R2 needs
  `BACKUP_R2_ENABLED=true` and all four `R2_*` settings; prove a complete upload.
  See [Backup and restore](docs/BACKUP-RESTORE.md). A pin remains subject to the
  30-day safe-restore limit; video sidecars and secrets need separate recovery.
- [ ] Keep the admin video kill-switch in mind: if RealtimeKit cost spikes, flip it from the console (Video tab) to stop new joins instantly without a redeploy.
- [ ] `npm run cloudflare:cost-check` to watch participant-minutes vs the $288/mo guardrail.

---

_Keep unresolved release gates in the readiness plan and release packet. Passing
`verify:deploy` alone does not close them._
