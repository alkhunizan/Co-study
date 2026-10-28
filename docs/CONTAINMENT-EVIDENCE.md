# Containment evidence tools

These operator tools collect candidate evidence only. They have no approval,
deletion, credential-rotation, image-push, or cleanup mode. Reports are created
as new mode-`0600` JSON files under `data/evidence/` by default and are excluded
from Git and Docker build contexts.

## Supabase synthetic-record candidate audit

The audit window is compiled into the tool and cannot be overridden:

- Start: `2026-07-15T03:40:00.000Z` (inclusive)
- End: `2026-07-15T04:05:00.000Z` (inclusive)

Run it only from a trusted operator host with `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` loaded from the protected service environment:

```bash
npm run audit:supabase-synthetic -- --dry-run
# Optional new destination; an existing file is never overwritten:
npm run audit:supabase-synthetic -- --output /secure/evidence/supabase-candidates.json
```

The executable constructs a frozen select-only client and sends only paginated
PostgREST `GET` requests. It queries minimal allowlisted columns from
`profiles`, `focus_sessions`, `room_events`, and `deletion_tombstones`.
Passwords, Google subjects, and room nicknames are not selected. Profile email
addresses become a masked hint plus a SHA-256 fingerprint in the report.

Rows returned outside the locked window are excluded and counted as provider
anomalies. A report with candidates is not proof that the rows are synthetic
and is not authorization to delete them. Review it against deployment/test logs
and obtain separate explicit approval before any production action.

If any source cannot be read, the tool still preserves a report marked
`auditComplete: false`, records only the table, HTTP status, and safe provider
code, and exits nonzero. It never copies a provider response into evidence. An
incomplete report cannot support a zero-candidate conclusion or authorize any
action.

## Local container-image risk inventory

Inventory locally available Halastudy/Co-Study images without contacting a
registry:

```bash
npm run inventory:images -- --dry-run
# Inspect exact images already present locally:
npm run inventory:images -- --image ghcr.io/example/co-study@sha256:<digest>
# Broaden explicitly to every local image:
npm run inventory:images -- --all-local
```

The command allowlist contains only `docker image ls`, `docker image inspect`,
and `docker image history`. Image references are passed as arguments without a
shell. There is no build, registry login, pull, push, removal, prune, or
credential-rotation path.

Reports include local tags/digests, build time, size, platform, layer counts,
and risk findings from image configuration, labels, and history. Sensitive
values and history commands are never copied into the report; only indicator
names, lengths, and SHA-256 fingerprints are retained. A repository digest is
evidence that the local daemon associated the image with a registry digest, not
proof that the remote image still exists. This metadata-only tool cannot prove
that a historical layer did or did not contain a file; investigate high-risk
findings before deciding whether credentials need rotation.

## Legacy R2 user-object inventory

With the protected R2 S3 credentials and `R2_BUCKET` loaded, inventory only the
locked `users/` prefix:

```bash
npm run inventory:r2-users -- --dry-run
npm run inventory:r2-users -- --output /secure/evidence/r2-user-candidates.json
```

The runtime client is frozen and exposes only paginated object-metadata listing.
It cannot read object bodies, create buckets, upload, overwrite, or delete. The
prefix and bucket cannot be changed with CLI arguments. Known aggregate backup
keys (`users/users.<timestamp>.json`) remain visible; all other keys may contain
identifiers, so reports retain only a redacted hint and SHA-256 fingerprint.
ETags are fingerprinted as well.

This command inventories candidates; it does not authorize deletion and there
is deliberately no `--apply` mode. Any future production deletion must be a
separately reviewed and explicitly approved action outside this tool.
