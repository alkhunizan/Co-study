# Platform operations

This implementation is local and has not been deployed. The public offer is free access plus exactly one paid tier: VIP, USD 4.99/month. Development checkout is a simulator; production cannot activate it. No provider, real charge, renewal, refund, invoice or webhook integration has been configured.

## Local review

Run `npm run platform:preview`, then open `http://127.0.0.1:3470/app`. This launcher binds only to loopback, uses its own persistent database under `data/platform-preview`, disables external account/payment providers, and uses mesh video for local testing. It does not read production `.env` credentials.

Create an account in the normal interface. `/plans` offers successful, declined and canceled test checkout. `/supervisor` opens study circles; `/app#progress` shows validated sessions and rewards. To review staff tools, enable authenticator verification on `/app#security`, save the recovery codes, then bootstrap the first owner using `operatorPassword` from `data/platform-preview/local-credentials.json`. This local file is excluded from Git. Never reuse its credentials for deployment.

VIP currently adds a year of session history, CSV export and up to three private circles with twelve members each. Free accounts retain study rooms, timers, points/achievements, thirty days of session history and participation in invited circles. All members earn points by the same rule. VIP does not confer staff or supervisor roles.

The dashboard shows the latest 100 sessions within the eligible history window; a CSV export includes up to 10,000 completed sessions from that window. Expiry preserves existing circle records and attendance access but blocks creating circles, invitations, new supervisor assignments and new circle schedules. Removing members, leaving, archiving and canceling a future session remain available for safe cleanup.

## Storage and migration

- The platform uses schema `halastudy` in PostgreSQL, with an embedded PGlite database for local development. Account and room payloads are a compatibility boundary around the existing application, not a fully normalized rewrite.
- With no legacy Supabase configuration, accounts and rooms import once from JSON into SQL. Imports have persistent markers. The SQL stores write changed records with optimistic revisions. Old JSON is retained but is no longer updated.
- **Do not switch `PLATFORM_ENABLED=false` after migration as a rollback.** That would read stale JSON and could revive deleted accounts. Restore a verified snapshot to a separate empty database and validate it before switching the app's database location.
- Existing Supabase profile storage remains a compatibility mode. The platform snapshot does not replace its independent account backup. A live Supabase migration and live schema parity have not been executed.
- For managed PostgreSQL, explicitly set `PLATFORM_DATABASE_URL`. Stop the app and run `npm run platform:migrate`. Normal startup checks the schema and does not migrate a remote database automatically. No remote PostgreSQL instance was modified during this work.
- The app still maintains live account/room caches and sockets in one runtime. Run **one instance**, as in the existing PM2 config. PostgreSQL advisory locks or an embedded-database lock refuse a competing runtime. This is not horizontal scaling.
- Embedded locks intentionally fail closed after an unclean shutdown. Before removing `.halastudy-runtime.lock`, inspect its host/PID, verify that runtime is no longer alive and that nobody else is using that directory. Never clear a lock on an unknown or active host. Prefer managed PostgreSQL for a production deployment.
- Keep `SESSION_SECRET` stable and outside source control. It signs account cookies and derives encryption for authenticator secrets. Restoring the database without the same secret makes existing MFA secrets unreadable.

## Backups and restore

The scheduled backup and named super-admin backup action flush account/room writes, then snapshot the platform database in one repeatable-read transaction. Concurrent backup requests share the in-progress operation. Snapshots contain sensitive account hashes and encrypted MFA material; store them with restricted permissions.

Offline commands, with explicit dedicated paths:

```powershell
npm run platform:backup -- --directory "<database directory>" --file "<backup folder>\platform.json"
npm run platform:restore -- --directory "<NEW empty database directory>" --file "<backup folder>\platform.json"
```

The app must be stopped for the offline CLI. Restore validates the checksum and table set, refuses a nonempty database, restores transactionally, increments account token epochs and does not restore staff sessions. A checksum detects accidental corruption; it is not a signature against someone who controls the backup.

For off-site backup, supply a fresh canonical platform snapshot:

```powershell
npm run backup:r2 -- --platform-file "<backup folder>\platform.json"
```

This uploads externally only when an operator runs it with R2 credentials. It was not run during this task. In platform mode the old command cannot silently upload obsolete JSON as the current backup. Legacy Supabase mode requires its own verified profile backup.

## Roles and revocation

| Scope | Access |
|---|---|
| Guest | Public study rooms; no private account progress or circle data |
| Member | Own profile, progress, membership and assigned circles |
| Room owner | Rename their own room; attach it to an eligible circle |
| Circle owner | Invite/remove members, assign supervisors, schedule/cancel future sessions, archive their circle |
| Circle supervisor | Schedule in eligible assigned rooms; see attendance in assigned circles only |
| Moderator | Reports and account moderation, with MFA |
| Support | Operational overview and room presence, with MFA |
| Billing operator | Subscription inspection, with MFA |
| Admin | Operational controls and staff roster, with MFA; cannot grant roles |
| Super admin | Staff grants, audits, backups and all operating tools, with MFA |

Staff verification expires after fifteen minutes, is bound to the account cookie and uses replay-resistant authenticator codes or single-use recovery codes. Grant/revoke invalidates the target's existing staff session. The last super admin cannot be removed or deleted. After named-owner bootstrap, the old shared-admin login/API is closed.

Logout invalidates outstanding account cookies and disconnects sockets. Bans, account deletion and membership removal revoke relevant access. Socket account identity and circle access are rechecked per event. Archived circle rooms stay private; archiving closes their active room instances.

Deleting a circle owner archives their circles and invalidates invitations in the deletion transaction; successful deletion also closes the active circle rooms. Shared history remains private. Quiet connected members receive attendance refreshes once per minute, including those who joined before the attendance window.

Profile, legacy focus-history and import updates acknowledge success only after storage commits. Failed writes return an unavailable error and attempt a corrective rollback. Monitor `account_rollback_persist_failed`, `socket_handler_failed`, and `attendance_sweep_failed` rather than treating a rejected request as a saved change.

Managed PostgreSQL uses a 10-second connection deadline, 5-second lock deadline, 15-second statement deadline and 20-second query deadline. Migration statements allow 120 seconds (125-second client deadline); idle transactions expire after 30 seconds. Failed rollback connections are discarded and uncertain commits are not automatically retried. Driver fault tests pass; actual deployment PostgreSQL timeout behavior still needs verification.

Repeated bootstrap preserves an existing Nginx/Certbot site and writes `halastudy.candidate` for review. The bootstrap template emits HSTS only on HTTPS. Validate Nginx and the real HTTPS response after applying the reviewed configuration.

## Deployment work still requiring real configuration

Choose the payment provider before implementing real checkout/webhook reconciliation, renewal/cancellation/refund terms and receipts. Do not convert simulator records into live subscriptions.

Recover live database/content state before deployment, dry-run migration against a copy, verify backups and restore, and exercise managed PostgreSQL with the deployment credentials. Confirm the hosting region, retention schedule and privacy/legal statements against actual operations. The policy edits describe the implemented technical behavior; they are not a legal compliance certification.

Organization tables and an outbox are reserved schema foundations, not finished organization billing or job-worker features. Password recovery/email verification require a transactional mail/identity integration. Live Google callback settings and live video-provider health still require deployment-environment verification. None of these integrations was falsely simulated as production-ready.

## Primary implementation references

- [PGlite documentation](https://pglite.dev/docs/)
- [node-postgres transactions](https://node-postgres.com/features/transactions)
- [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)
- [OWASP MFA guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
- [Cloudflare RealtimeKit](https://developers.cloudflare.com/realtime/realtimekit/)
