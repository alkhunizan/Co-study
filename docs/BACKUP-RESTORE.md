# Encrypted Backup and Restore

Halastudy creates one authenticated, client-side encrypted artifact each night. Encryption happens in the Node process before bytes are written locally or copied to R2. Raw room, profile, deletion-tombstone, focus, and room-event data must never be uploaded as backup objects.

## Artifact contract

Each `.hsbackup` file is a JSON envelope containing:

- format and artifact version identifiers;
- a random 96-bit IV;
- an AES-256-GCM authentication tag;
- encrypted payload bytes.

The encrypted payload contains exactly one manifest and the readable datasets collected during that run. The manifest records schema version `2`, UTC creation time, row count and SHA-256 checksum for each dataset, and the names of configured sources that could not be read. Supported datasets are `profiles`, `deletion_tombstones`, `focus_completion_claims`, `focus_sessions`, `room_events`, and `rooms`.

An empty array is a readable source. If no source is readable, the command fails and creates no artifact. A partial artifact is marked in its encrypted manifest and the CLI emits a warning naming the unavailable sources. Deletion tombstones are a critical source: when Supabase is configured, failure to read them fails the whole backup so an unsafe database artifact cannot displace a complete daily snapshot.

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

Restore always validates the envelope authentication tag, supported schema version, dataset shapes, row counts, and every manifest checksum before planning any write. Every artifact tombstone remains authoritative for that artifact even after its 30-day live-database expiry. Restore unions that evidence with current, unexpired Supabase tombstones and removes affected profiles, focus rows, room events, and owned rooms from the plan. If both sources contain the same user, the current Supabase row wins and is the row preserved during apply.

Schema-v1 artifacts remain readable during the migration window, but a v1 database or owned-room artifact 30 days old or older fails closed because it cannot contain embedded deletion evidence. Retained v2 artifacts do not have that limitation.

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

1. current, unexpired protective Supabase deletion tombstones from the artifact/current union;
2. Supabase profiles;
3. Supabase focus claims, focus sessions, and room events;
4. the atomic room-state replacement.

Expired artifact tombstones still filter the artifact, but are not written back into the live 30-day tombstone table.

A failed phase exits nonzero and prevents later phases from running. Restart and verify only after the apply command succeeds:

```bash
sudo -u halastudy -H env HOME=/var/lib/halastudy \
  PM2_HOME=/var/lib/halastudy/.pm2 \
  bash /opt/halastudy/scripts/deploy/start.sh
npm --prefix /opt/halastudy run verify:deploy -- https://your-domain.example
```

## Optional R2 copy

`npm run backup:r2` authenticates the newest local `.hsbackup` file before upload and copies only those encrypted bytes under the fixed `encrypted/` prefix. It then retains one successful artifact for each of the latest seven UTC days. Automated retention can list and delete only keys matching `encrypted/halastudy-YYYY-MM-DDTHHMMSSZ-*.hsbackup`; unrelated encrypted objects, legacy `users/` objects, and every other prefix are outside its mutation boundary.

The package command and the service-owned `backup.sh --with-r2` path both pass the explicit `--apply-retention` scope. Direct script execution without one recognized mode fails. Preview the exact candidate set without uploading or deleting anything with:

```bash
sudo -u halastudy -H /usr/bin/node /opt/halastudy/scripts/backup-r2.js --retention-dry-run
```

`backup.sh --check-r2` performs the isolated credential round-trip. It creates and removes only its timestamped `healthcheck/` marker.

Never use an automated test or local development shell with production R2 or Supabase credentials. Provider tests must inject fakes or use designated staging projects.
