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
