(() => {
    const global = /** @type {any} */ (window);
    let current = null;
    let receivedAt = performance.now();
    let queue = Promise.resolve();
    let enabled = false;
    let synchronized = true;
    let pendingCompletion = null;
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('halastudy-focus') : null;
    function publish(value, track = false) {
        const previous = current;
        current = value;
        enabled = true;
        synchronized = true;
        if (track && value && value.id !== previous?.id && value.state === 'active') global.HalaInsights?.record('focus', { action: 'start', surface: location.pathname === '/app' ? 'workspace' : 'room', credit: 'none' }, `start:${value.id}`);
        if (track && value?.state === 'completed' && previous?.state !== 'completed') global.HalaInsights?.record('focus', { action: 'complete', surface: location.pathname === '/app' ? 'workspace' : 'room', credit: global.HalaInsights.credit(Number(value.credited_ms)) }, `complete:${value.id}`);
        receivedAt = performance.now();
        window.dispatchEvent(new CustomEvent('halafocuschange', { detail: current }));
        if (track) channel?.postMessage('changed');
        return value;
    }
    function run(operation) {
        queue = queue.catch(() => {}).then(operation);
        return queue;
    }
    async function readCurrent() {
        const summary = await global.HalaCore.requestJson('GET', '/api/platform/progress');
        const completed = pendingCompletion && summary.sessions.find((session) => session.id === pendingCompletion && session.state === 'completed');
        if (completed) { pendingCompletion = null; publish(completed, true); }
        else publish(summary.current);
        return summary;
    }
    function failed(error) {
        synchronized = false;
        window.dispatchEvent(new CustomEvent('halafocuserror', { detail: error.code || 'SERVICE_UNAVAILABLE' }));
    }
    async function action(name, expectedSessionId = null) {
        return run(async () => {
            let attemptedSessionId = null;
            try {
                if (name === 'complete' && pendingCompletion) {
                    attemptedSessionId = pendingCompletion;
                    const completed = await global.HalaCore.postJson(`/api/platform/focus/${encodeURIComponent(pendingCompletion)}/complete`, {});
                    pendingCompletion = null;
                    return publish(completed, true);
                }
                if (name === 'resume') {
                    // Always consult the server: another tab may have finished it.
                    const started = await global.HalaCore.postJson('/api/platform/focus/start', {});
                    // An acknowledged new session supersedes the older completion retry.
                    if (pendingCompletion && started.id !== pendingCompletion) pendingCompletion = null;
                    publish(started, true);
                    if (current.state === 'active') return current;
                } else if (!current) await readCurrent();
                if (!current || !['active', 'paused'].includes(current.state)) return current;
                // A retried pause belongs to the session the user originally paused.
                if (expectedSessionId && current.id !== expectedSessionId) return current;
                if (name === 'complete') pendingCompletion = current.id;
                attemptedSessionId = current.id;
                const result = await global.HalaCore.postJson(`/api/platform/focus/${encodeURIComponent(current.id)}/${name}`, {});
                if (name === 'complete') pendingCompletion = null;
                return publish(result, true);
            } catch (error) {
                // Preserve the request target, even when a preceding queued Start created it.
                if (attemptedSessionId) error.focusSessionId = attemptedSessionId;
                if (['SESSION_EXPIRED', 'SESSION_CLOSED', 'SESSION_NOT_FOUND', 'AUTH_REQUIRED'].includes(error.code)) {
                    if (name === 'complete' || error.code === 'AUTH_REQUIRED') pendingCompletion = null;
                    publish(null);
                    if (error.code !== 'AUTH_REQUIRED') await readCurrent().catch(() => {});
                }
                failed(error);
                throw error;
            }
        });
    }
    setInterval(() => {
        if (!enabled) return;
        if (current?.state === 'active') void action('heartbeat').catch(() => {});
        else if (!document.hidden) void run(readCurrent).catch(failed);
    }, 15000);
    const reconcile = () => run(readCurrent);
    channel?.addEventListener('message', () => { if (enabled) void reconcile().catch(failed); });
    window.addEventListener('focus', () => { if (enabled) void reconcile().catch(failed); });
    document.addEventListener('visibilitychange', () => { if (enabled && !document.hidden) void reconcile().catch(failed); });
    global.HalaFocus = {
        start: () => action('resume'), pause: (sessionId) => action('pause', sessionId), complete: () => action('complete'),
        restore: publish, reconcile, hasPendingCompletion: () => !!pendingCompletion, current: () => current,
        // Smooth visual clock only. The server alone persists time and awards XP.
        displaySeconds: () => Math.floor(Math.min(240 * 60000, Number(current?.credited_ms || 0)
            + (synchronized && current?.state === 'active' ? Math.min(15000, Math.max(0, performance.now() - receivedAt)) : 0)) / 1000)
    };
})();
