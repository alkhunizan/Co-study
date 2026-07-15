# Encrypted Backup and Restore

Halastudy creates one authenticated, client-side encrypted artifact each night. Encryption happens in the Node process before bytes are written locally or copied to R2. Raw room, profile, focus, and room-event data must never be uploaded as backup objects.

## Artifact contract

Each `.hsbackup` file is a JSON envelope containing:

- format and artifact version identifiers;
- a random 96-bit IV;
- an AES-256-GCM authentication tag;
- encrypted payload bytes.

The encrypted payload contains exactly one manifest and the readable datasets collected during that run. The manifest records schema version `1`, UTC creation time, row count and SHA-256 checksum for each dataset, and the names of configured sources that could not be read. Supported datasets are `profiles`, `focus_sessions`, `room_events`, and `rooms`.

An empty array is a readable source. If no source is readable, the command fails and creates no artifact. A partial artifact is marked in its encrypted manifest and the CLI emits a warning naming the unavailable sources.

Artifacts are written by same-directory atomic rename with mode `0600`. Retention keeps one successful artifact for each of the latest seven UTC days. A second successful run on the same day replaces that day's older artifact only after the new file exists.

## Configure the key

Generate exactly 32 random bytes as canonical base64:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Put the result in `/var/lib/halastudy/.env`:

```dotenv
BACKUP_ENCRYPTION_KEY=<generated-base64-value>
ROOM_STATE_FILE=/var/lib/halastudy/rooms.json
ROOM_STATE_BACKUP_DIR=/var/lib/halastudy/backups
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

Protect the file and directory:

```bash
sudo chown halastudy:halastudy /var/lib/halastudy /var/lib/halastudy/.env
sudo chmod 700 /var/lib/halastudy
sudo chmod 600 /var/lib/halastudy/.env
```

Do not commit, log, or pass the encryption key on a command line. Losing it makes all retained artifacts unrecoverable. Store a separately protected recovery copy using the operator's secret-management system.

## Nightly scheduling

Systemd is the production scheduler. The unit runs as `halastudy`, sets `UMask=0077`, and invokes the wrapper that accepts only the service-owned mode-`0400`/`0600` environment file.

```bash
sudo install -m 0644 /opt/halastudy/scripts/deploy/halastudy-backup.service \
  /etc/systemd/system/halastudy-backup.service
sudo install -m 0644 /opt/halastudy/scripts/deploy/halastudy-backup.timer \
  /etc/systemd/system/halastudy-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now halastudy-backup.timer
sudo systemctl list-timers halastudy-backup.timer
```

Test one run without waiting for the timer:

```bash
sudo systemctl start halastudy-backup.service
sudo systemctl status halastudy-backup.service
sudo journalctl -u halastudy-backup.service -n 50 --no-pager
sudo -u halastudy find /var/lib/halastudy/backups -maxdepth 1 -name '*.hsbackup' -type f -print
```

For hosts that use cron instead, install `scripts/deploy/halastudy-backup.cron` in `/etc/cron.d/halastudy-backup`. Do not enable cron and the systemd timer together. Both paths invoke the same protected wrapper.

A manual backup uses the same boundary:

```bash
sudo -u halastudy -H /opt/halastudy/scripts/deploy/backup.sh
```

`npm run backup:state` is the underlying CLI. `npm run backup:rooms` remains a compatibility alias but creates the same multi-source encrypted artifact.

## Dry-run restore

Restore always validates the envelope authentication tag, supported schema version, dataset shapes, row counts, and every manifest checksum before planning any write. It reads current Supabase deletion tombstones and removes affected profiles, focus rows, room events, and owned rooms from the plan.

The default is a dry run:

```bash
sudo -u halastudy -H /opt/halastudy/scripts/deploy/restore.sh \
  /var/lib/halastudy/backups/halastudy-YYYY-MM-DDTHHMMSSZ-xxxx.hsbackup
```

Review the printed source counts and tombstone-filtered counts. A dry run never writes Supabase or the room-state file.

## Apply restore

Only one application writer is supported. Stop PM2 and prove the process is gone before applying:

```bash
sudo -u halastudy -H env PM2_HOME=/var/lib/halastudy/.pm2 pm2 stop co-study
sudo -u halastudy -H env PM2_HOME=/var/lib/halastudy/.pm2 pm2 pid co-study
```

The second command must not report a running PID. Then apply with both explicit gates:

```bash
sudo -u halastudy -H /opt/halastudy/scripts/deploy/restore.sh \
  /var/lib/halastudy/backups/halastudy-YYYY-MM-DDTHHMMSSZ-xxxx.hsbackup \
  --apply --writer-stopped
```

If `RESTORE_WRITER_LOCK_FILE` is configured and that path exists, apply fails even with `--writer-stopped`. This can integrate an external maintenance lock with the CLI.

Restore order is fixed:

1. Supabase profiles;
2. Supabase focus sessions and room events;
3. the atomic room-state replacement.

A failed phase exits nonzero and prevents later phases from running. Restart and verify only after the apply command succeeds:

```bash
sudo -u halastudy -H env HOME=/var/lib/halastudy \
  PM2_HOME=/var/lib/halastudy/.pm2 \
  bash /opt/halastudy/scripts/deploy/start.sh
npm --prefix /opt/halastudy run verify:deploy -- https://your-domain.example
```

## Optional R2 copy

`npm run backup:r2` authenticates the newest local `.hsbackup` file before upload and copies only those encrypted bytes under the `encrypted/` prefix. It no longer uploads `rooms.json` or `users.json`. The service-owned manual path is `backup.sh --with-r2`, which creates the local artifact first and loads R2 credentials from the same protected env file; `backup.sh --check-r2` performs the credential round-trip. These commands do not delete stored backup objects.

Never use an automated test or local development shell with production R2 or Supabase credentials. Provider tests must inject fakes or use designated staging projects.
