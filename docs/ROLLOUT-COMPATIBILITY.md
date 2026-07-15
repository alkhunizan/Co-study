# Additive Rollout, Compatibility, and Rollback Runbook

This runbook is the production order of operations for the room/auth/video
remediation. PM2/Nginx remains the production topology and exactly one Node
writer may run.

## Compatibility contract

Keep these readers/adapters for at least 14 days after the production cutover:

- `authProvider` remains persisted and is consulted only when the additive
  `passwordEnabled` field is absent. Authentication decisions otherwise use
  `passwordEnabled`, `passwordHash`, and `googleSub`.
- Room schema v1 remains readable without startup mutation. The offline room
  migration is the only path that assigns inferred ownership and writes v2.
- RealtimeKit token requests may still include `clientSessionId` and the
  legacy `role: "student"`. Heartbeat/leave may use the legacy body described
  below when `videoSessionId` is absent.

The historical production shapes are visible at pre-remediation commit
`0e3d477` (originally introduced at `44684c4`):

```json
// POST /api/rooms/:roomId/video-token
{ "displayName": "Student", "clientSessionId": "caller-id", "role": "student" }

// POST /api/rooms/:roomId/video-heartbeat
// POST /api/rooms/:roomId/video-leave
{ "displayName": "Student", "clientSessionId": "caller-id" }
```

The old clients did not send `X-Halastudy-Membership`; that omission is not
retained because it was the authorization vulnerability. Every token,
heartbeat, and leave request now requires the server-issued membership header.
For a legacy heartbeat/leave body, the server shape-checks caller fields but
selects the session only by the signed membership's room, socket, and identity.
`clientSessionId`, `clientId`, and `displayName` never authorize, select, evict,
or replace a participant.

## Telemetry and the removal gate

`GET /api/metrics` exposes `compatibilityTelemetry` with per-signal counts and
last-use timestamps:

| Signal | Meaning |
|---|---|
| `auth_provider_fallback` | A user row lacked `passwordEnabled` and required the legacy provider field. |
| `room_schema_v1_read` | Startup loaded a schema-v1 room. |
| `video_token_client_session_id` | An authorized token body still included the old caller session field. |
| `video_token_student_role` | An authorized token request used the legacy student role name. |
| `video_heartbeat_legacy_shape` | An authorized heartbeat included legacy fields; without `videoSessionId` it used the membership-bound adapter. |
| `video_leave_legacy_shape` | An authorized leave included legacy fields; without `videoSessionId` it used the membership-bound adapter. |

Metrics counters are in-memory and reset on every process restart. They are a
live diagnostic only and cannot alone prove a 14-day zero-use window. Every
increment also emits a structured, identifier-free
`compatibility_path_used` log with `signal` and `count`. Ship those logs to the
retained production log/metrics backend and alert on any occurrence.

Remove a compatibility path only after all of the following are true:

1. Fourteen consecutive 24-hour periods after cutover contain no matching
   `compatibility_path_used` log across every process generation.
2. Scraped per-process counters remain zero between every observed restart.
3. The room migration dry-run reports no schema-v1 rooms and Supabase reports
   no profiles that still require `auth_provider` fallback.
4. The removal deploy has its own contract tests and an independently approved
   rollback point. Remove authorization-independent fields only; never restore
   caller-ID authorization.

Any signal resets the relevant path's 14-day clock.

## Additive rollout sequence

1. Run the complete quality gate without production credentials:

   ```bash
   npm run test:ci:quality
   npm run test:ci:infra
   ```

2. Apply the additive Supabase migrations in timestamp order. Do not drop the
   legacy `auth_provider` column:

   ```text
   20260715000000_secure_baseline.sql
   20260715010000_account_resurrection_focus_idempotency.sql
   ```

   Run `npm run supabase:migrations:check` and the staging migration dry-run.

3. Deploy the dual-read build with `VIDEO_JOIN_DISABLED=true`. Keep PM2 at one
   instance and do not start a second writer during the rollout.

4. With the protected production environment loaded, run the metadata-only
   room plan:

   ```bash
   npm run migration:rooms
   ```

   Review ownership counts, fingerprinted blocking issues, expiry changes, and
   board-overflow counts. Ambiguous ownership remains null/admin-managed.

5. Create the encrypted pre-cutover backup and prove its dry-run restore:

   ```bash
   npm run backup:state
   npm run restore:state -- /absolute/path/to/pre-cutover.hsbackup
   ```

   Record the authenticated artifact path/checksum and the room migration plan.

6. Stop the single writer, apply the room migration, and retain the reported
   mode-`0600` pre-migration room backup:

   ```bash
   sudo -u halastudy -H env PM2_HOME=/var/lib/halastudy/.pm2 pm2 stop co-study
   npm run migration:rooms -- --apply --writer-stopped
   ```

7. Start the dual-read build with video joins still disabled. Wait for complete
   hydration and readiness before any smoke test:

   ```bash
   sudo -u halastudy -H env HOME=/var/lib/halastudy \
     PM2_HOME=/var/lib/halastudy/.pm2 bash /opt/halastudy/scripts/deploy/start.sh
   curl -fsS http://127.0.0.1:3000/api/ready
   ```

8. Run the live designated-staging checks for Google sign-in/linking, Supabase
   persistence, Socket.IO, RealtimeKit presets/token/webhook health, static
   assets, HTTPS/HSTS, build version, and last successful backup. Never use
   production credentials in automated tests.

9. Enable video joins through the admin kill switch only after every readiness
   and smoke check passes. Record the cutover timestamp; it starts both the
   24-hour observation and 14-day compatibility windows.

## First 24 hours

Retain dashboards and structured logs for the full 24 hours. Alert on:

- persistence 503s, startup hydration retries, readiness failures, and final
  flush failures;
- OAuth outcome/error classes, link-required outcomes, replay rejection, and
  deletion grants;
- webhook verification failures, lag, UUID deduplication, missed/retried
  transitions, pending/active/ending counts, and cleanup tombstones;
- provider reconciliation failures, video per-IP/global/room capacity, and
  cost alerts at 70/85/100 percent;
- compatibility signals, bounded-map pressure, process restarts, backup age,
  and the last successful verified backup.

At hours 1, 4, 12, and 24, capture `/api/ready`, `/api/metrics`, PM2 status,
provider health, backup verification, and the aggregated compatibility-log
query. A restart starts new in-memory counters but does not reset the durable
log-based 14-day evidence window.

## Rollback sequence

1. Disable new video joins immediately through the admin kill switch.
2. Record current readiness, persistence/provider errors, compatibility logs,
   and the current room-file checksum. Do not mutate Supabase migrations.
3. Dry-run the authenticated pre-cutover artifact and verify schema, checksum,
   tombstone filtering, and restore order:

   ```bash
   npm run restore:state -- /absolute/path/to/pre-cutover.hsbackup
   ```

4. Stop the single PM2 writer. Deploy the previous known-good **dual-read**
   build; never roll back to a build that authorizes with caller IDs.
5. If code rollback alone is sufficient, keep the current additive database
   columns and room state. If state rollback is explicitly approved, apply the
   verified artifact only while the writer is stopped:

   ```bash
   npm run restore:state -- /absolute/path/to/pre-cutover.hsbackup \
     --apply --writer-stopped
   ```

   Embedded artifact tombstones and current 30-day deletion tombstones must
   both filter deleted accounts so rollback cannot resurrect them. The current
   row wins when both sources contain the same user. Restore writes protective
   tombstones before profiles, events, and rooms.

6. Restart with video joins disabled, wait for `/api/ready`, run
   `npm run verify:deploy -- https://your-domain.example`, and repeat the live
   smoke suite. Re-enable video only after approval.
7. Preserve the failed build, migration plan, checksummed room backup, logs,
   and provider evidence for the incident review. A rollback does not remove
   additive Supabase columns or shorten the compatibility window.
