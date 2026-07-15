(function attachVideoClient(global) {
    const HEARTBEAT_INTERVAL_MS = 45000;

    function buildApiUrl(apiBaseUrl, path) {
        const base = apiBaseUrl ? apiBaseUrl.replace(/\/$/, '') : '';
        return `${base}${path}`;
    }

    async function postJson(url, body, options = {}) {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            credentials: 'include',
            body: JSON.stringify(body),
            keepalive: !!options.keepalive
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.ok === false) {
            /** @type {Error & { code?: string, payload?: any }} */
            const error = new Error(payload.errorCode || payload.error || `HTTP_${response.status}`);
            error.code = payload.errorCode || payload.error || `HTTP_${response.status}`;
            error.payload = payload;
            throw error;
        }
        return payload;
    }

    function supersededJoinError() {
        /** @type {Error & { code?: string }} */
        const error = new Error('Video join was superseded by a newer lifecycle request.');
        error.code = 'VIDEO_JOIN_SUPERSEDED';
        return error;
    }

    function createVideoClient(options = {}) {
        let apiBaseUrl = options.apiBaseUrl || '';
        let lifecycleGeneration = 0;
        let operationQueue = Promise.resolve();
        const state = {
            joined: null,
            heartbeatTimer: null,
            session: null
        };

        function enqueue(operation) {
            const result = operationQueue.then(operation, operation);
            operationQueue = result.catch(() => {});
            return result;
        }

        function stopHeartbeat() {
            if (state.heartbeatTimer === null) return;
            clearInterval(state.heartbeatTimer);
            state.heartbeatTimer = null;
        }

        async function heartbeat() {
            const session = state.session;
            if (!session?.roomId || !session.clientSessionId) return;
            try {
                await postJson(
                    buildApiUrl(apiBaseUrl, `/api/rooms/${encodeURIComponent(session.roomId)}/video-heartbeat`),
                    {
                        clientSessionId: session.clientSessionId,
                        displayName: session.displayName
                    }
                );
            } catch (_error) {}
        }

        function startHeartbeat() {
            stopHeartbeat();
            state.heartbeatTimer = setInterval(() => {
                void heartbeat();
            }, HEARTBEAT_INTERVAL_MS);
        }

        async function disposeSession(session, joined, options = {}) {
            const cleanup = [];
            if (session?.roomId && session.clientSessionId) {
                cleanup.push(
                    postJson(
                        buildApiUrl(apiBaseUrl, `/api/rooms/${encodeURIComponent(session.roomId)}/video-leave`),
                        {
                            clientSessionId: session.clientSessionId,
                            displayName: session.displayName
                        },
                        { keepalive: !!options.keepalive }
                    )
                );
            }
            if (joined && typeof joined.leave === 'function') {
                try {
                    cleanup.push(joined.leave());
                } catch (_error) {}
            }
            await Promise.allSettled(cleanup);
        }

        async function disposeActiveSession(options = {}) {
            stopHeartbeat();
            const session = state.session;
            const joined = state.joined;
            state.session = null;
            state.joined = null;
            if (!session && !joined) return;
            await disposeSession(session, joined, options);
        }

        function leave(options = {}) {
            lifecycleGeneration += 1;
            return enqueue(() => disposeActiveSession(options));
        }

        function joinRealtimeKitRoom(options = {}) {
            const joinGeneration = ++lifecycleGeneration;
            return enqueue(async () => {
                if (joinGeneration !== lifecycleGeneration) throw supersededJoinError();

                await disposeActiveSession();
                if (joinGeneration !== lifecycleGeneration) throw supersededJoinError();

                const session = {
                    generation: joinGeneration,
                    roomId: options.roomId || '',
                    displayName: options.displayName || '',
                    clientSessionId: options.clientSessionId || ''
                };
                let joined = null;

                try {
                    const tokenPayload = await postJson(
                        buildApiUrl(apiBaseUrl, `/api/rooms/${encodeURIComponent(session.roomId)}/video-token`),
                        {
                            displayName: session.displayName,
                            clientSessionId: session.clientSessionId,
                            role: options.role || 'student'
                        }
                    );
                    if (joinGeneration !== lifecycleGeneration) throw supersededJoinError();

                    const realtimeKitClient = (/** @type {any} */ (global)).HalastudyRealtimeKitClient;
                    const joinMethod = options.headless ? realtimeKitClient?.joinHeadless : realtimeKitClient?.join;
                    if (typeof joinMethod !== 'function') {
                        /** @type {Error & { code?: string }} */
                        const error = new Error('RealtimeKit client is unavailable.');
                        error.code = 'VIDEO_PROVIDER_UNAVAILABLE';
                        throw error;
                    }

                    joined = await joinMethod.call(realtimeKitClient, {
                        authToken: tokenPayload.authToken,
                        meetingElement: options.meetingElement,
                        policy: tokenPayload.policy || {}
                    });
                    if (joinGeneration !== lifecycleGeneration) throw supersededJoinError();

                    state.session = session;
                    state.joined = joined;
                    startHeartbeat();
                    return {
                        ...tokenPayload,
                        meeting: joined?.meeting || null
                    };
                } catch (error) {
                    if (state.session && state.session.generation === joinGeneration) {
                        stopHeartbeat();
                        state.session = null;
                        state.joined = null;
                    }
                    await disposeSession(session, joined);
                    throw error;
                }
            });
        }

        return {
            joinRealtimeKitRoom,
            leave,
            heartbeat,
            setApiBaseUrl(nextApiBaseUrl = '') {
                apiBaseUrl = nextApiBaseUrl || '';
            }
        };
    }

    (/** @type {any} */ (global)).HalastudyVideoClient = {
        createVideoClient
    };
})(window);
