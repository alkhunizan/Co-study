# Gate tooling errors — 2026-10-21

These are local run notes, not a cross-project memory update.

- Guessed helper filenames did not exist; locate files with `rg --files` before reading them. One Node executable path was mistyped; use the recorded Node 22 path.
- Global `VIDEO_PROVIDER=mesh` in the audit harness invalidated default-provider tests. Remove that override; fixtures choose their own provider. Preserve failing output and rerun unchanged assertions.
- Serialized room-state writes debounce. Wait for the local helper to flush before reading a fixture. Public room snapshot shape is `.body.board`, not `.body.room.board`.
- Initial blur proposal left the camera button disabled because its label was updated before `cameraStarting` cleared. Update it in finally. Native DOMException names may be readonly; wrap the error with a cause instead of mutating it.
- UI failure probes must wait for teardown, not merely the early label change. Do not weaken stream-state assertions.
- Raw fake-camera termination exposed a real late-startup resurrection race. Instrumented stop stacks and deterministic ended-source reproduction identified it; source identity/liveness is checked after awaiting processing. The fake-device termination trigger itself remains unknown.
- Early separately launched test Chromium did not inherit suite network containment. Its possible CDN traffic was unmeasured; do not claim total production-cap compliance. Final checks install explicit non-loopback routing/DNS containment for all launched test browsers.
- Windows NODE_OPTIONS consumes backslash escapes. Normalize preload paths to forward slashes and quote them. PowerShell UNC `(Get-Location).Path` may have a provider prefix; use the known literal UNC path for child-process arguments.
- Python Windows text defaults are not UTF-8. Pass `encoding='utf-8'` for manifests and Arabic source. The failed snapshot check was corrected; final manifest confirms all 285 candidate files match.

No memory registry, global review log, skill instruction or provider configuration was modified.
