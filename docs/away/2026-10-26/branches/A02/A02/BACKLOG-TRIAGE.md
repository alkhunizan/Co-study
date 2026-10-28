# A-02 read-only focus backlog triage

The primary agent requested a read-only pass over remaining focus-client/room-focus error paths against F06/F07/F09 after freezing the existing fix. No application or test source was changed by this triage.

One eligible pre-existing defect was reproduced with the actual focus client in a deterministic local VM. This is client behavior against an in-memory model of the existing idempotent start/complete API, not yet a real-browser/end-to-end result.

1. Start session S1.
2. Complete S1; the server commits the completion, but its response is lost.
3. Deliberately Start again, creating session S2.
4. Finish S2.

Observed: `pendingCompletion` still identifies S1 after the second Start. The next Finish POST targets S1, returns S1's completed result and leaves S2 active on the server. The client reports S1 completed. The successful-response control finishes S2 normally. The same defect occurs on baseline `c4d6c50` and frozen A02 source; it is not introduced by the retry fix.

This affects the F09 expectation that Stop/Finish follows the correct session and the F06 distinction between acknowledged completed time and an active session. F07 task binding belongs to the workspace caller; no new linkage claim or proposed mutation was made here.

Runnable evidence, from the A02 worktree with Node 22:

```powershell
node docs/away/2026-10-26/evidence/a02-pending-completion-triage.cjs
```

The adjacent log records both baseline/frozen results, the positive controls, exact request paths and resulting states. The harness makes no network calls and reads application source without changing it. Heartbeats are disabled to make this rapid ordering deterministic; a real-browser test should reproduce the sequence before the next background reconciliation.

Proposed next qualification: reproduce with a real loopback server and a lost response after commit, using the room's Start and Finish controls. Independently assert that two intended sessions complete and no current active session remains. Keep the existing lost-response Retry positive control. No fix is proposed until that qualification and the primary agent's backlog decision.
