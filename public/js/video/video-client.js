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

    function createVideoClient(options = {}) {
        let apiBaseUrl = options.apiBaseUrl || '';
        const state = {
            joined: null,
            heartbeatTimer: null,
            roomId: '',
            displayName: '',
            clientSessionId: ''
        };

        async function heartbeat() {
            if (!state.roomId || !state.clientSessionId) return;
            try {
                await postJson(
                    buildApiUrl(apiBaseUrl, `/api/rooms/${encodeURIComponent(state.roomId)}/video-heartbeat`),
                    {
                        clientSessionId: state.clientSessionId,
                        displayName: state.displayName
                    }
                );
            } catch (_error) {}
        }

        function startHeartbeat() {
            stopHeartbeat();
            state.heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
        }

        function stopHeartbeat() {
            if (!state.heartbeatTimer) return;
            clearInterval(state.heartbeatTimer);
            state.heartbeatTimer = null;
        }

        async function leave(options = {}) {
            stopHeartbeat();
            const payload = {
                clientSessionId: state.clientSessionId,
                displayName: state.displayName
            };
            if (state.roomId && state.clientSessionId) {
                try {
                    await postJson(
                        buildApiUrl(apiBaseUrl, `/api/rooms/${encodeURIComponent(state.roomId)}/video-leave`),
                        payload,
                        { keepalive: !!options.keepalive }
                    );
                } catch (_error) {}
            }
            if (state.joined && typeof state.joined.leave === 'function') {
                try {
                    await state.joined.leave();
                } catch (_error) {}
            }
            state.joined = null;
        }

        async function joinRealtimeKitRoom(options = {}) {
            await leave();
            state.roomId = options.roomId || '';
            state.displayName = options.displayName || '';
            state.clientSessionId = options.clientSessionId || '';

            const tokenPayload = await postJson(
                buildApiUrl(apiBaseUrl, `/api/rooms/${encodeURIComponent(state.roomId)}/video-token`),
                {
                    displayName: state.displayName,
                    clientSessionId: state.clientSessionId,
                    role: 'student'
                }
            );

            try {
                const meetingElement = options.meetingElement;
                state.joined = await (/** @type {any} */ (global)).HalastudyRealtimeKitClient.join({
                    authToken: tokenPayload.authToken,
                    meetingElement,
                    policy: tokenPayload.policy || {}
                });
                startHeartbeat();
                return tokenPayload;
            } catch (error) {
                await leave();
                throw error;
            }
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
