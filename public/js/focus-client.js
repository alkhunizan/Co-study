(() => {
    const global = /** @type {any} */ (window);
    let current = null;
    let receivedAt = Date.now();
    let queue = Promise.resolve();
    function publish(value, track = false) {
        const previous = current;
        current = value;
        if (track && value && value.id !== previous?.id && value.state === 'active') global.HalaInsights?.record('focus', { action: 'start', surface: location.pathname === '/app' ? 'workspace' : 'room', credit: 'none' }, `start:${value.id}`);
        if (track && value?.state === 'completed' && previous?.state !== 'completed') global.HalaInsights?.record('focus', { action: 'complete', surface: location.pathname === '/app' ? 'workspace' : 'room', credit: global.HalaInsights.credit(Number(value.credited_ms)) }, `complete:${value.id}`);
        receivedAt = Date.now();
        window.dispatchEvent(new CustomEvent('halafocuschange', { detail: current }));
        return value;
    }
    function run(operation) {
        queue = queue.catch(() => {}).then(operation);
        return queue;
    }
    async function action(name) {
        return run(async () => {
            if (!current || !['active', 'paused'].includes(current.state)) {
                if (name !== 'resume') return current;
                publish(await global.HalaCore.postJson('/api/platform/focus/start', {}), true);
            }
            if (name === 'resume' && current.state === 'active') return current;
            try {
                return publish(await global.HalaCore.postJson(`/api/platform/focus/${encodeURIComponent(current.id)}/${name}`, {}), true);
            } catch (error) {
                if (['SESSION_EXPIRED', 'SESSION_CLOSED', 'SESSION_NOT_FOUND', 'AUTH_REQUIRED'].includes(error.code)) publish(null);
                throw error;
            }
        });
    }
    setInterval(() => {
        if (current?.state === 'active') {
            void action('heartbeat').catch((error) => {
                window.dispatchEvent(new CustomEvent('halafocuserror', { detail: error.code || 'SERVICE_UNAVAILABLE' }));
            });
        }
    }, 15000);
    global.HalaFocus = {
        start: () => action('resume'), pause: () => action('pause'), complete: () => action('complete'),
        restore: publish, current: () => current,
        // Smooth visual clock only. The server alone persists time and awards XP.
        displaySeconds: () => Math.floor(Math.min(240 * 60000, Number(current?.credited_ms || 0)
            + (current?.state === 'active' ? Math.min(15000, Math.max(0, Date.now() - receivedAt)) : 0)) / 1000)
    };
})();
