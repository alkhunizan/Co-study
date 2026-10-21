(function attachVideoClient(global) {
    const HEARTBEAT_INTERVAL_MS = 45000;

    function buildApiUrl(apiBaseUrl, path) {
        const base = apiBaseUrl ? apiBaseUrl.replace(/\/$/, '') : '';
        return `${base}${path}`;
    }

    async function postJson(url, body, options = {}) {
        const controller = new AbortController();
        const deadline = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body),
                keepalive: !!options.keepalive,
                signal: controller.signal
            });
            const payload = await response.json();
            if (!response.ok || payload.ok === false) {
                /** @type {Error & { code?: string, payload?: any, status?: number }} */
                const error = new Error(payload.errorCode || payload.error || `HTTP_${response.status}`);
                error.code = payload.errorCode || payload.error || `HTTP_${response.status}`;
                error.payload = payload;
                error.status = response.status;
                throw error;
            }
            return payload;
        } finally {
            clearTimeout(deadline);
        }
    }

    function createVideoClient(options = {}) {
        let apiBaseUrl = options.apiBaseUrl || '';
        let active = null;
        let generation = 0;
        let queue = Promise.resolve();
        const canceled = () => Object.assign(new Error('Video join canceled'), { code: 'VIDEO_JOIN_CANCELED' });
        const schedule = (operation) => {
            const result = queue.then(operation, operation);
            queue = result.catch(() => {});
            return result;
        };
        const call = (session, action, extra = {}) => postJson(
            buildApiUrl(apiBaseUrl, `/api/rooms/${encodeURIComponent(session.roomId)}/video-${action}`),
            { clientSessionId: session.clientSessionId, displayName: session.displayName, role: session.role }, extra);
        function stopHeartbeat(session) {
            if (session?.timer) clearInterval(session.timer);
            if (session) session.timer = null;
        }
        async function bounded(operation, onLate = null) {
            let timer;
            let expired = false;
            const pending = Promise.resolve(operation);
            pending.then(value => { if (expired && onLate) void onLate(value); }, () => {});
            try {
                return await Promise.race([pending, new Promise((_resolve, reject) => {
                    timer = setTimeout(() => { expired = true; reject(new Error('Video operation timed out')); }, 15000);
                })]);
            } finally { clearTimeout(timer); }
        }
        async function releaseJoined(joined) {
            if (joined?.leave) await bounded(joined.leave()).catch(() => {});
        }
        function notifyLeave(session, extra = {}) {
            if (session && !session.notification) session.notification = call(session, 'leave', extra).catch(() => {});
            return session?.notification;
        }
        async function dispose(session, extra = {}) {
            if (!session || session.disposed) return;
            session.disposed = true;
            stopHeartbeat(session);
            if (active === session) active = null;
            // Start keepalive immediately, before waiting on SDK teardown.
            const notification = notifyLeave(session, extra);
            await releaseJoined(session.joined);
            await notification;
        }
        function leave(extra = {}) {
            generation += 1;
            stopHeartbeat(active);
            notifyLeave(active, extra);
            return schedule(() => dispose(active, extra));
        }
        async function heartbeat() {
            const session = active;
            if (!session?.joined || session.beating || session.disposed) return;
            session.beating = true;
            try {
                await call(session, 'heartbeat');
                session.failures = 0;
            } catch (error) {
                session.failures += 1;
                if (active === session && session.generation === generation
                    && ([401, 403, 404, 410].includes(error.status) || session.failures >= 3)) {
                    await leave();
                    options.onEnded?.(error);
                }
            } finally { session.beating = false; }
        }
        function joinRoom(joinOptions, headless) {
            const requested = ++generation;
            stopHeartbeat(active);
            return schedule(async () => {
                await dispose(active);
                if (requested !== generation) throw canceled();
                const session = { ...joinOptions, role: joinOptions.role || 'student', joined: null,
                    timer: null, disposed: false, beating: false, failures: 0, generation: requested };
                active = session;
                try {
                    const payload = await call(session, 'token');
                    if (requested !== generation) throw canceled();
                    if (!payload.authToken) throw new Error('Video token missing');
                    const sdk = (/** @type {any} */ (global)).HalastudyRealtimeKitClient;
                    const joining = sdk[headless ? 'joinHeadless' : 'join']({ authToken: payload.authToken,
                        meetingElement: joinOptions.meetingElement, policy: payload.policy || {} });
                    session.joined = await bounded(joining, releaseJoined);
                    if (requested !== generation) throw canceled();
                    session.timer = setInterval(() => { void heartbeat(); }, HEARTBEAT_INTERVAL_MS);
                    return { ...payload, ...session.joined };
                } catch (error) {
                    await dispose(session);
                    throw error;
                }
            });
        }
        return {
            joinRealtimeKitRoom: (joinOptions = {}) => joinRoom(joinOptions, false),
            joinHeadlessRoom: (joinOptions = {}) => joinRoom(joinOptions, true),
            leave,
            heartbeat,
            setApiBaseUrl(nextApiBaseUrl = '') { apiBaseUrl = nextApiBaseUrl || ''; }
        };
    }

    (/** @type {any} */ (global)).HalastudyVideoClient = {
        createVideoClient
    };
})(window);
