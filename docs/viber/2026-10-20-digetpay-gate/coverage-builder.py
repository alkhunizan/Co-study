"""Static report generation only: reads source/evidence; executes no app/tests."""
from pathlib import Path
import re
from collections import Counter

base = Path("docs/viber/2026-10-20-digetpay-gate")
routes = []
for line in (base / "evidence/route-registrations.txt").read_text().splitlines():
    match = re.search(r"^(.*?):(\d+) (?:app|router)\.(\w+)\('([^']+)'", line)
    if not match:
        continue
    file, lineno, method, route = match.groups()
    if file == "co-study-server.js":
        if not route.startswith("/api/"):
            continue
        group = "server"
    elif "/admin/" in file:
        if route == "/":
            continue
        route = "<ADMIN_PATH>" + route
        group = "admin"
    elif "/platform/" in file:
        route = "/api/platform" + route
        group = "platform"
    elif "google-routes" in file:
        group = "google"
    else:
        route = "/api" + route
        group = "account"
    routes.append((method.upper(), route, f"{file}:{lineno}", group))

# Explicitly reviewed callsites/assertions. Not filename similarity.
evidence = {}
def add(method, route, kind, note):
    evidence[(method, route)] = (kind, note)

for route, line, note in [
    ("/api/health",103,"health and readiness report healthy HTTP app"),
    ("/api/ready",104,"health and readiness report healthy HTTP app"),
    ("/api/runtime-config",188,"default ICE servers/runtime config"),
    ("/api/rooms/:roomId",1723,"protected GET safe preview; no private state"),
]:
    add("GET",route,"R",f"server.integration.test.js:{line} — {note}")
add("GET","/api/metrics","R","admin.integration.test.js:415 — errors/metrics/API 404")
add("GET","/api/announcement","R","admin.integration.test.js:293 — broadcast reaches sockets; clear stops it")
for suffix,line in [("video-token",511),("video-heartbeat",975),("video-leave",985)]:
    add("POST","/api/rooms/:roomId/"+suffix,"R",f"server.integration.test.js:{line} — joined video lifecycle; provider stub")

for method,route,line,note in [
    ("POST","/auth/signup",31,"signup cookie/profile; invalid input and duplicate tests"),
    ("POST","/auth/login",111,"login correctness/no enumeration"),
    ("POST","/auth/logout",167,"logout clears cookie; replay becomes guest"),
    ("GET","/auth/me",174,"guest after logout"),
    ("PATCH","/me/profile",184,"profile type/bounds and unauthenticated guard"),
    ("POST","/me/focus-session",220,"focus accumulation/invalid minutes"),
    ("POST","/me/stats/import",261,"max-per-day/idempotent import"),
    ("GET","/me/stats",245,"focus totals returned"),
    ("GET","/me/rooms",392,"created/joined room history"),
    ("DELETE","/me",314,"reauth, durable removal, session killed"),
]:
    add(method,"/api"+route,"R",f"auth.integration.test.js:{line} — {note}")
for method,route,line,note in [
    ("POST","/auth/recovery/request",28,"known/unknown response parity"),
    ("POST","/auth/recovery/complete",45,"single-use concurrent reset"),
    ("POST","/me/email-verification",93,"verification preserves password/session"),
]:
    add(method,"/api"+route,"R",f"recovery.integration.test.js:{line} — {note}; local mail only")
add("GET","/api/auth/recovery/config","I","recovery.smoke.spec.js:17 — real page shows recovery form; config fetched by public/js/recovery.js:45")
add("GET","/auth/google","R","google-security.integration.test.js:41 — state/PKCE/linking/reauth; fake Google")
add("GET","/auth/google/callback","R","google-security.integration.test.js:45 — state/PKCE/linking/reauth; fake Google")

platform = "/api/platform"
for method,route,line,note in [
    ("GET","/me",23,"free benefits and revoked account 401"),
    ("POST","/billing/checkout",27,"simulator checkout 200; DigetPay configured success HTTP unverified"),
    ("POST","/billing/checkout/:id/complete",29,"simulator approved; DigetPay method rejects at service layer"),
    ("POST","/cohorts",31,"VIP creates circle"),
    ("POST","/cohorts/accept",35,"invite accepted"),
    ("POST","/cohorts/:id/invitations",34,"owner gets invite"),
    ("GET","/cohorts/:id/members",33,"other account 404; browser positive member list"),
    ("POST","/cohorts/:id/sessions",46,"owned room schedule; circle-lifecycle:55 retry after failure"),
    ("GET","/cohorts/:id/sessions/:sessionId/attendance",58,"on-time attendance"),
    ("GET","/rooms",43,"owned room present"),
    ("PATCH","/rooms/:id",45,"foreign rename 404; owner success unverified"),
    ("POST","/focus/start",61,"start 200"),
    ("POST","/focus/:id/:action",63,"foreign complete 404, own complete returns zero XP"),
]:
    add(method,platform+route,"R",f"platform-api.integration.test.js:{line} — {note}")
add("GET",platform+"/catalog","R","evidence/targeted-probes.json — catalog 200, checkout unavailable")
add("POST",platform+"/billing/digetpay/webhook","B","digetpay.smoke.spec.js:104 — unconfigured HTTP webhook 503; configured notify tested as service only")
add("GET",platform+"/billing/latest","M","digetpay.smoke.spec.js:44 intercepts app endpoint; no authenticated handler success evidence")
add("POST",platform+"/billing/checkout/:id/verify","M","digetpay.smoke.spec.js:45 intercepts app endpoint; service lifecycle tests; no authenticated handler success evidence")
for method,route,line,note in [
    ("POST","/billing/cancellation",55,"cancel and restore renewal simulator"),
    ("PATCH","/cohorts/:id/members/:userId",75,"assign supervisor observed"),
    ("GET","/cohorts/:id/sessions",94,"scheduled session shown"),
    ("GET","/progress",108,"completed focus history"),
    ("POST","/security/mfa/enroll",111,"secret displayed after enroll"),
    ("POST","/security/mfa/verify",116,"recovery codes displayed after activate"),
    ("POST","/staff/bootstrap",119,"staff nav appears"),
    ("GET","/staff",122,"Super admin role rendered"),
    ("POST","/staff/roles",138,"last-super-admin removal denied, not grant success"),
    ("GET","/staff/operations",123,"empty then raised alerts shown"),
    ("POST","/staff/video",135,"toggle observed"),
]:
    add(method,platform+route,"R",f"platform.smoke.spec.js:{line} — {note}; real local server")
for route,line in [("/staff/overview",454),("/staff/rooms",467),("/staff/cases",491),("/staff/subscriptions",514),("/staff/audit",519)]:
    add("GET",platform+route,"I",f"platform.smoke.spec.js:121 renders staff; public/js/platform.js:{line} request, no endpoint-specific response assertion")
add("POST",platform+"/cohorts/:id/archive","R","resilience.smoke.spec.js:134–136 — exact archive target and disappearance asserted; earlier held GETs continued/unrouted")

admin="<ADMIN_PATH>/api"
for method,route,line,note in [
    ("POST","/login",81,"wrong password, lockout and valid cookie"),
    ("GET","/overview",95,"overview fields asserted"),
    ("GET","/rooms/:roomId",210,"inspect participant count"),
    ("POST","/rooms/:roomId/close",181,"close disconnects/deletes room"),
    ("POST","/rooms/:roomId/kick",218,"kick reduces participants"),
    ("GET","/reports",368,"report listing/restart"),
    ("POST","/rooms/:roomId/reports/:reportId/resolve",383,"resolve persists"),
    ("POST","/video-kill-switch",136,"video disabled then enabled"),
    ("POST","/users/:userId/ban",239,"ban kills session"),
    ("POST","/users/:userId/unban",253,"unban restores signin"),
    ("POST","/broadcast",275,"publish reaches sockets"),
    ("DELETE","/broadcast",296,"clear announcement"),
    ("POST","/backup",324,"snapshot files asserted"),
    ("GET","/errors",410,"redacted warnings"),
]:
    add(method,admin+route,"R",f"admin.integration.test.js:{line} — {note}")
add("GET",admin+"/rooms","R","admin.smoke.spec.js:83 — real console room row shown")

# Added current-run real HTTP receipts, with only the external provider stubbed.
add("POST",platform+"/billing/checkout","R","http-payment-probe.cjs:20 — configured real HTTP 200; fixed price, invalid input, duplicate order reuse; fake external provider")
add("POST",platform+"/billing/digetpay/webhook","R","http-payment-probe.cjs:54 — 20 anonymous transaction hints all accepted HTTP 200; no entitlement claim")
add("GET",platform+"/billing/latest","R","http-payment-probe.cjs:37 — owner order matches, other account returns null")
add("POST",platform+"/billing/checkout/:id/verify","R","http-payment-probe.cjs:26–35 — other account 404; owner completed twice, owner VIP/other free; fake external provider")
add("GET",platform+"/progress/export","R","http-payment-probe.cjs:41–45 — owner VIP 200 CSV header; free account 403")
add("GET","/api/auth/recovery/config","R","http-payment-probe.cjs:46 — real HTTP returns exact disabled config; local enabled flow separately covered")

header = """# Endpoint coverage and independent refutation

This matrix is an evidence map, not a fresh test run by this reviewer. Existing test sources and the main-agent targeted, HTTP-payment, and socket probe outputs were read. A test name does not prove its latest execution passed; use the main RUN.md logs for suite outcomes. New actual receipts are `evidence/http-payment-probes.json` and `evidence/socket-probes.json`; the external payment provider alone is fake in the HTTP probe, not the application handlers.

## Independent refutation

**V4-01 remains P2, sandbox availability.** The 20 distinct transaction hints really produce 20 durable rows and 10 fake provider queries in one drain. The original queue reproduction used direct service calls; the follow-up HTTP probe now confirms 20 anonymous transaction hints are all accepted by the real route, below its 120/min per-IP guard. No per-order/global cap exists. An owner can learn their own UUID through checkout, so UUID secrecy does not remove reachability. Session mode's one-row positive control materially narrows the finding. Do not claim actual charges, production theft, 20 retry executions, or measured provider monetary cost: none were demonstrated. Production mode blocks the adapter.

**V4-02 remains P2, sandbox reconciliation availability.** A/B expiry and C creation use the actual checkout function and legal time progression, not manually corrupted order state. First delayed approval A succeeds, establishing positive control; B then collides with the one-open-order index and its whole transaction rolls back, leaving B unbound/expired and C pending. The fixture does not prove DigetPay permits payment after 48 hours, but that is unnecessary: an earlier approval with delayed/missed reconciliation reaches the same state. The worker excludes expired orders after local expiry; manual verification/notifications can still reach reconciliation. This is a lost review/retry path, not a demonstrated second entitlement or financial theft. Provider-specific delayed status behavior still needs merchant acceptance.

## Independent review of the two fixture corrections

Reviewed the exact current diff for `tests/integration/circle-lifecycle.integration.test.js:11` and `tests/integration/presence.integration.test.js:9`. Each changes only its createPlatform environment object, adding `NODE_ENV: 'test'` and `BILLING_PROVIDER: 'simulator'`. No assertion, test body, skip, expected status, or production source is changed.

The initial log `evidence/test-integration.txt:193–205` and `:435–447` shows both tests failed at their setup checkout with CHECKOUT_UNCONFIGURED, through digetpay-billing.js, before reaching their circle/presence assertions. `services/platform/index.js:15–28` now defaults to DigetPay when the passed env omits NODE_ENV; these tests pass their own explicit env object rather than inheriting the test runner environment. They intentionally purchase simulated VIP as setup for unrelated scope/presence tests. Declaring the simulator is the correct fixture repair; it does not weaken payment security checks or bypass the behavior these tests assert. `evidence/V2-01-after.txt` records both exact named tests passing, 2/2, no skips. Full-suite rerun was still in progress at review time and is not inferred from the focused result.

## Classification

- R = named real local HTTP/socket/browser scenario with a specific request or directly observed endpoint effect. It may be negative-only, expressly stated. Payment simulator and provider fixtures are identified.
- B = real HTTP boundary probe only. It does not cover authorized business behavior.
- I = real browser flow implies a request from inspected client code, without an endpoint-specific assertion; excluded from strict substantive coverage.
- M = app endpoint intercepted/mocked in the browser, or service-only evidence; not authenticated HTTP success coverage.
- U = no named route-specific runtime evidence found.
- Source trace F = route, enforcing service/guard and displayed failure traced in trace.md; P = only route/upstream boundary or parts traced. F does not mean all branches covered.
- Gate A = main targeted-probes.json recorded anonymous 401 for the exact platform registration. This is a current local boundary receipt, independent of named test classification.

Test references below are relative to tests/integration unless `.smoke.spec.js`, which is under tests/smoke. File:line refers to the request/assertion or enclosing named scenario; the accompanying phrase identifies the scenario. Dynamic `:action` is one registered endpoint; testing complete does not cover every action.

"""
rows = []
counts=Counter()
gate_count=0
for method,route,source,group in routes:
    kind,note=evidence.get((method,route),("U","No exact route-specific assertion found."))
    gate=group=="platform" and route not in [platform+"/catalog",platform+"/billing/digetpay/webhook"]
    gate_count+=gate
    counts[kind]+=1
    trace="F" if group in ["account","google","platform"] else "P"
    if kind=="U" and gate:
        kind="B"
        counts["U"]-=1
        counts["B"]+=1
        note="Targeted probe records anonymous AUTH_REQUIRED; authorized behavior unverified."
    rows.append(f"| {method} `{route}` | {source} | {trace} | {kind} | {'A' if gate else '—'} | {note} |")
assert len(routes)==89, len(routes)

socket_names = re.findall(r"onEvent\('([^']+)'",Path("co-study-server.js").read_text())
socket_cases={
    "create-room":("R","server.integration.test.js:239 + platform-api:38 — valid/invalid/capacity/private-room scenarios"),
    "join-room":("R","server.integration.test.js:305/314 — wrong vs correct protected password; platform-api:53 private membership"),
    "send-message":("R","server.integration.test.js:263/1180/1249 — message persistence/rate/bounds"),
    "board-set-goal":("R","server.integration.test.js:269/1194 — goal persistence/rate"),
    "board-add-task":("R","server.integration.test.js:274; socket-boundary:56 — task positive control"),
    "board-toggle-task":("R","app.smoke.spec.js:208 — shared-board completed checkbox sync"),
    "board-delete-task":("R","app.smoke.spec.js:257 — shared-board deletion observed by peer"),
    "board-reorder-tasks":("R","app.smoke.spec.js:245 — drag reorder observed by peer"),
    "camera-status":("R","socket-probe.cjs:20–39 / evidence/socket-probes.json — joined peer exact payload, outsider receives zero"),
    "rtc-offer":("R","socket-probe.cjs:20–39 / evidence/socket-probes.json — exact sender/payload relay, outsider target receives zero"),
    "rtc-answer":("R","socket-probe.cjs:20–39 / evidence/socket-probes.json — exact sender/payload relay, outsider target receives zero"),
    "rtc-ice":("R","socket-probe.cjs:20–39 / evidence/socket-probes.json — exact sender/payload relay, outsider target receives zero"),
    "user-status":("R","server.integration.test.js:1555/1580 — sanitized goal/status broadcast"),
    "report-user":("R","server.integration.test.js:1625–1662 — target validity/rate/privacy/persistence")
}
socket_rows=[]
for name in socket_names:
    kind,note=socket_cases[name]
    socket_rows.append(f"| `{name}` | P | {kind} | {note}; malformed boundary included for every command. |")
assert len(socket_names)==14
substantive=counts["R"]
summary=f"""## Totals

HTTP/identity denominator: **89 registrations**. Classifications: **{substantive} R**, **{counts['B']} B**, **{counts['I']} I**, **{counts['M']} M**, **{counts['U']} U**. Current targeted anonymous receipt: **{gate_count}/89**, all protected platform registrations. Strict named substantive HTTP evidence: **{substantive}/89 ({substantive/89:.1%})**; this includes negative-only assertions as labeled and should not be described as full positive-path coverage.

Socket denominator: **14 commands**: **14 R, 0 B**. All 14 have a named malformed-input boundary test and an explicit substantive case; the four signaling/camera gaps were closed by the actual socket receipt. Combined strict substantive mapped surface evidence: **{substantive+14}/103 ({(substantive+14)/103:.1%})**. This combines named tests with recorded current probes; it is not a claim that every branch or provider integration has passed.

The largest remaining positive-path gaps are staff mutations, circle leave/session cancellation, and legacy admin logout/dashboard/users/video sessions. The configured DigetPay application HTTP path is now exercised with a fake external provider; actual merchant/provider behavior remains unverified.

## HTTP matrix

| Method and endpoint | Registration | Source trace | Test class | Gate | Named evidence / limitation |
|---|---|---|---|---|---|
"""
out=header+summary+"\n".join(rows)+"""

## Socket matrix

| Event | Source trace | Test class | Named evidence / limitation |
|---|---|---|---|
"""+"\n".join(socket_rows)+"\n"
(base/"coverage.md").write_text(out,encoding="utf-8")
print(dict(counts))
print(f"HTTP {len(routes)}; sockets {len(socket_names)}; gate {gate_count}")
