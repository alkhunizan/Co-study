(function attachVideoClient(global) {
    const HEARTBEAT_INTERVAL_MS = 45000;
    const MEMBERSHIP_HEADER = 'X-Halastudy-Membership';
    const MAX_MEMBERSHIP_TOKEN_LENGTH = 4096;
    const MAX_VIDEO_SESSION_ID_LENGTH = 256;
    const FATAL_SESSION_ERROR_CODES = new Set([
        'ROOM_MEMBERSHIP_REQUIRED',
        'ROOM_NOT_FOUND',
        'VIDEO_REQUEST_INVALID',
        'VIDEO_SESSION_FORBIDDEN',
        'VIDEO_SESSION_NOT_FOUND',
        'HTTP_401',
        'HTTP_403',
        'HTTP_404'
    ]);

    function buildApiUrl(apiBaseUrl, path) {
        const base = apiBaseUrl ? apiBaseUrl.replace(/\/$/, '') : '';
        return `${base}${path}`;
    }

    async function postJson(url, body, options = {}) {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...(options.headers || {})
            },
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

    function createVideoError(code, message) {
        /** @type {Error & { code?: string }} */
        const error = new Error(message);
        error.code = code;
        return error;
    }

    function supersededJoinError() {
        return createVideoError(
            'VIDEO_JOIN_SUPERSEDED',
            'Video join was superseded by a newer lifecycle request.'
        );
    }

    function normalizeOpaqueValue(value, maxLength) {
        if (typeof value !== 'string') return '';
        const normalized = value.trim();
        if (!normalized || normalized.length > maxLength || /[\r\n]/.test(normalized)) return '';
        return normalized;
    }

    function membershipHeaders(membershipToken) {
        return { [MEMBERSHIP_HEADER]: membershipToken };
    }

    function isFatalSessionError(error) {
        const code = error && typeof error.code === 'string' ? error.code : '';
        return FATAL_SESSION_ERROR_CODES.has(code);
    }

    function createVideoClient(options = {}) {
        let apiBaseUrl = options.apiBaseUrl || '';
        let lifecycleGeneration = 0;
        let operationQueue = Promise.resolve();
        const trackedGenerations = new Set();
        const teardownOptionsByGeneration = new Map();
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

        function mergeTeardownOptions(existing = {}, requested = {}) {
            return {
                ...existing,
                ...requested,
                keepalive: !!(existing.keepalive || requested.keepalive),
                notifyServer: existing.notifyServer === false || requested.notifyServer === false
                    ? false
                    : requested.notifyServer ?? existing.notifyServer
            };
        }

        function releaseGeneration(generation) {
            if (!Number.isInteger(generation)) return;
            trackedGenerations.delete(generation);
            teardownOptionsByGeneration.delete(generation);
        }

        function requestTeardownForTrackedGenerations(throughGeneration, options) {
            for (const generation of trackedGenerations) {
                if (generation > throughGeneration) continue;
                teardownOptionsByGeneration.set(
                    generation,
                    mergeTeardownOptions(teardownOptionsByGeneration.get(generation), options)
                );
            }
        }

        function stopHeartbeat() {
            if (state.heartbeatTimer === null) return;
            clearInterval(state.heartbeatTimer);
            state.heartbeatTimer = null;
        }

        async function heartbeat() {
            const session = state.session;
            if (!session?.roomId || !session.membershipToken || !session.videoSessionId) return;
            try {
                await postJson(
                    buildApiUrl(apiBaseUrl, `/api/rooms/${encodeURIComponent(session.roomId)}/video-heartbeat`),
                    { videoSessionId: session.videoSessionId },
                    { headers: membershipHeaders(session.membershipToken) }
                );
            } catch (error) {
                if (!isFatalSessionError(error)) return;
                await enqueue(async () => {
                    if (state.session !== session) return;
                    await disposeActiveSession({ notifyServer: false });
                });
            }
        }

        function startHeartbeat() {
            stopHeartbeat();
            state.heartbeatTimer = setInterval(() => {
                void heartbeat();
            }, HEARTBEAT_INTERVAL_MS);
        }

        async function disposeSession(session, joined, options = {}) {
            const generation = session?.generation;
            const effectiveOptions = mergeTeardownOptions(
                options,
                teardownOptionsByGeneration.get(generation)
            );
            try {
                const cleanup = [];
                if (effectiveOptions.notifyServer !== false
                    && session?.roomId
                    && session.membershipToken
                    && session.videoSessionId
                    && !session.serverLeaveStarted) {
                    session.serverLeaveStarted = true;
                    cleanup.push(
                        postJson(
                            buildApiUrl(apiBaseUrl, `/api/rooms/${encodeURIComponent(session.roomId)}/video-leave`),
                            { videoSessionId: session.videoSessionId },
                            {
                                headers: membershipHeaders(session.membershipToken),
                                keepalive: !!effectiveOptions.keepalive
                            }
                        )
                    );
                }
                if (joined && typeof joined.leave === 'function') {
                    try {
                        cleanup.push(joined.leave());
                    } catch (_error) {}
                }
                await Promise.allSettled(cleanup);
            } finally {
                releaseGeneration(generation);
            }
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
            const teardownOptions = {
                ...options,
                keepalive: options.keepalive !== false
            };
            const supersededThroughGeneration = lifecycleGeneration;
            lifecycleGeneration += 1;
            requestTeardownForTrackedGenerations(supersededThroughGeneration, teardownOptions);
            if (state.session || state.joined) {
                const immediateDisposal = disposeActiveSession(teardownOptions);
                return enqueue(() => immediateDisposal);
            }
            return enqueue(() => disposeActiveSession(teardownOptions));
        }

        function joinRealtimeKitRoom(options = {}) {
            const joinGeneration = ++lifecycleGeneration;
            trackedGenerations.add(joinGeneration);
            return enqueue(async () => {
                if (joinGeneration !== lifecycleGeneration) {
                    releaseGeneration(joinGeneration);
                    throw supersededJoinError();
                }

                await disposeActiveSession();
                if (joinGeneration !== lifecycleGeneration) {
                    releaseGeneration(joinGeneration);
                    throw supersededJoinError();
                }

                const session = {
                    generation: joinGeneration,
                    roomId: typeof options.roomId === 'string' ? options.roomId.trim() : '',
                    displayName: typeof options.displayName === 'string' ? options.displayName : '',
                    membershipToken: normalizeOpaqueValue(
                        options.membershipToken,
                        MAX_MEMBERSHIP_TOKEN_LENGTH
                    ),
                    videoSessionId: ''
                };
                let joined = null;

                try {
                    if (!session.roomId || !session.displayName) {
                        throw createVideoError('VIDEO_REQUEST_INVALID', 'Video room and display name are required.');
                    }
                    if (!session.membershipToken) {
                        throw createVideoError(
                            'ROOM_MEMBERSHIP_REQUIRED',
                            'A verified room membership is required for video.'
                        );
                    }

                    const tokenPayload = await postJson(
                        buildApiUrl(apiBaseUrl, `/api/rooms/${encodeURIComponent(session.roomId)}/video-token`),
                        {
                            displayName: session.displayName,
                            role: options.role || 'student'
                        },
                        { headers: membershipHeaders(session.membershipToken) }
                    );
                    session.videoSessionId = normalizeOpaqueValue(
                        tokenPayload.videoSessionId,
                        MAX_VIDEO_SESSION_ID_LENGTH
                    );
                    if (!session.videoSessionId) {
                        throw createVideoError(
                            'VIDEO_SESSION_INVALID',
                            'Video token response did not include a valid server session id.'
                        );
                    }
                    if (joinGeneration !== lifecycleGeneration) throw supersededJoinError();
                    state.session = session;

                    const realtimeKitClient = (/** @type {any} */ (global)).HalastudyRealtimeKitClient;
                    const joinMethod = options.headless ? realtimeKitClient?.joinHeadless : realtimeKitClient?.join;
                    if (typeof joinMethod !== 'function') {
                        throw createVideoError('VIDEO_PROVIDER_UNAVAILABLE', 'RealtimeKit client is unavailable.');
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
                    if (state.session?.generation === joinGeneration) {
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
