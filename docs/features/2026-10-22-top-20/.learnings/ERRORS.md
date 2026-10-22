# Execution corrections

- PowerShell -File does not preserve comma-separated array arguments. Use -Command with a literal array, and ExecutionPolicy Bypass only for the child process. No machine policy changed.
- Dynamic DOM input.value is not input.defaultValue. Set both, including option.defaultSelected, before form.reset. Real browser review revealed cleared numeric defaults.
- Lost-response retries need stable normalized child identifiers as well as a stable request key. The first browser test proved random checklist IDs changed the retry digest; checklist position IDs now stay stable.
- Browser matrix fixtures must set an initial language only when none exists. An unconditional init script overrode each tested preference; the assertion on actual html lang correctly caught the fixture mistake.
- This network checkout requires command-scoped Git safe.directory, UTF-8 file reads, explicit paths and Node 22. Keep reports/artifacts inside this task folder.

- Preview restart on Windows: inspect the owned loopback process and parent command, then wait on its actual Process handle. A stale CIM process snapshot immediately after Stop-Process is not definitive. Start the replacement only after the stop tool exit code succeeds; otherwise a stale PGlite lease causes an unready server. Remove only the verified stopped task-runtime lease, never a live/unknown one. Readiness and rendered-source checks are separate from a listening HTTP port.

- Windows PowerShell redirected native logs are UTF-16LE in this runner; detect BOM before parsing them in Python. JSON written by Node or Set-Content -Encoding utf8 remains UTF-8.
- Axe's Playwright builder needs an explicit browser.newContext(), not browser.newPage()'s owned implicit context. Review helper now uses explicit context and finally closes the browser on failures; failed helper process tree was identified and stopped without touching user browsers or previews.
