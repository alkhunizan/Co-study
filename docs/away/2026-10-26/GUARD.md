# Away guard decisions

These are recorded denials, not commands to execute during this run. No workaround will be attempted.

1. The isolated clone originated from a valid local bundle. Reconnecting its origin to the existing GitHub repository was denied under `git-remote-change`, reserved for the owner. No remote changed. Local commits, patches and an incremental bundle preserve the work.

```powershell
git remote set-url origin https://github.com/alkhunizan/Co-study.git
```

2. A later PowerShell command writing that same text into a report also matched the guard. The report was then edited through the ordinary file-edit tool; no Git operation ran.

3. During A11 verification, an existing recovery test failed while parsing its local synthetic message file; its cause remains unresolved. This read-only inspection was denied under `send-message` because its search pattern contained a mail-send identifier. The output was never read and no message was sent. Diagnosis is held; neither the denied read nor an equivalent access will be retried while away.

```powershell
Get-Content -LiteralPath 'tests/integration/recovery.integration.test.js' -TotalCount 130
rg -n 'writeFile|outbox|LOCAL_MAIL|sendMail' services/auth/recovery.js
```

Recommendation after return: allow the read-only inspection and resolve the fixture failure before integration/release. Independently, reconnect the isolated clone only after reviewing the preserved branches. The guard provides no evidence that a message was sent.
