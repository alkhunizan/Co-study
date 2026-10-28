(function attachVideoClient(global) {
    const HEARTBEAT_INTERVAL_MS = 45000;
    const VIDEO_REQUEST_TIMEOUT_MS = 15000;
    const VIDEO_TEARDOWN_REQUEST_TIMEOUT_MS = 2000;
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

    function createRequestGuard(signal, timeoutMs) {
        const NativeAbortController = (/** @type {any} */ (global)).AbortController;
        let requestController = null;
        if (typeof NativeAbortController === 'function') {
            try {
                requestController = new NativeAbortController();
            } catch (_error) {}
        }

        let closed = false;
        let cancelled = false;
        let timeoutId = null;
        let abortHandler = null;
        /** @type {(reason?: any) => void} */
        let rejectCancellation = () => {};
        const cancellation = new Promise((_, reject) => {
            rejectCancellation = reject;
        });

        const cancel = (error) => {
            if (closed || cancelled) return;
            cancelled = true;
            // Settle our typed cancellation first so a native fetch AbortError
            // cannot win the same microtask race and erase the video error code.
            rejectCancellation(error);
            try {
                requestController?.abort();
            } catch (_error) {}
        };

        if (signal?.aborted) {
            cancel(createVideoError('VIDEO_REQUEST_CANCELLED', 'Video request was cancelled.'));
        } else if (signal && typeof signal.addEventListener === 'function') {
            abortHandler = () => {
                cancel(createVideoError('VIDEO_REQUEST_CANCELLED', 'Video request was cancelled.'));
            };
            signal.addEventListener('abort', abortHandler, { once: true });
        }

        if (!cancelled && Number.isFinite(timeoutMs) && timeoutMs >= 0) {
            timeoutId = setTimeout(() => {
                cancel(createVideoError('VIDEO_REQUEST_TIMEOUT', 'Video request timed out.'));
            }, timeoutMs);
        }

        return {
            cancellation,
            fetchSignal: requestController?.signal || null,
            close() {
                if (closed) return;
                closed = true;
                if (timeoutId !== null) clearTimeout(timeoutId);
                if (abortHandler) signal.removeEventListener('abort', abortHandler);
            }
        };
    }

    async function postJson(url, body, options = {}) {
        const requestGuard = createRequestGuard(
            options.signal,
            options.timeoutMs ?? VIDEO_REQUEST_TIMEOUT_MS
        );
        /** @type {RequestInit} */
        const fetchOptions = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                ...(options.headers || {})
            },
            credentials: 'include',
            body: JSON.stringify(body),
            keepalive: !!options.keepalive
        };
        if (requestGuard.fetchSignal) {
            fetchOptions.signal = requestGuard.fetchSignal;
        }

        try {
            const response = await Promise.race([
                requestGuard.cancellation,
                Promise.resolve(fetch(url, fetchOptions))
            ]);
            const payloadOperation = Promise.resolve()
                .then(() => response.json())
                .catch(() => ({}));
            const payload = await Promise.race([requestGuard.cancellation, payloadOperation]);
            if (!response.ok || payload.ok === false) {
                /** @type {Error & { code?: string, payload?: any }} */
                const error = new Error(payload.errorCode || payload.error || `HTTP_${response.status}`);
                error.code = payload.errorCode || payload.error || `HTTP_${response.status}`;
                error.payload = payload;
                throw error;
            }
            return payload;
        } finally {
            requestGuard.close();
        }
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

    function createLifecycleCancellationController() {
        const NativeAbortController = (/** @type {any} */ (global)).AbortController;
        if (typeof NativeAbortController === 'function') return new NativeAbortController();

        let aborted = false;
        const listeners = new Set();
        const signal = {
            get aborted() {
                return aborted;
            },
            addEventListener(type, listener) {
                if (type !== 'abort' || typeof listener !== 'function') return;
                listeners.add(listener);
            },
            removeEventListener(type, listener) {
                if (type === 'abort') listeners.delete(listener);
            }
        };
        return {
            signal,
            abort() {
                if (aborted) return;
                aborted = true;
                for (const listener of listeners) {
                    try {
                        listener.call(signal, { type: 'abort', target: signal });
                    } catch (_error) {}
                }
                listeners.clear();
            }
        };
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

    function createMeshPeerRecoveryController(options = {}) {
        const recoveryGraceMs = Number.isFinite(options.recoveryGraceMs)
            ? Math.max(0, options.recoveryGraceMs)
            : 10_000;
        const setTimer = options.setTimeout || global.setTimeout;
        const clearTimer = options.clearTimeout || global.clearTimeout;
        const states = new WeakMap();

        function stateFor(peerConnection) {
            let state = states.get(peerConnection);
            if (!state) {
                state = { timer: null, recoveryAttempted: false };
                states.set(peerConnection, state);
            }
            return state;
        }

        function clearScheduledTimer(state) {
            if (state.timer === null) return;
            clearTimer(state.timer);
            state.timer = null;
        }

        function forget(peerConnection) {
            const state = states.get(peerConnection);
            if (!state) return;
            clearScheduledTimer(state);
            states.delete(peerConnection);
        }

        function isCurrentPeer(peerId, peerConnection) {
            return typeof options.isCurrentPeer !== 'function'
                || options.isCurrentPeer(peerId, peerConnection) === true;
        }

        function isConnected(peerConnection) {
            const connectionUnhealthy = ['disconnected', 'failed'].includes(peerConnection.connectionState);
            const iceUnhealthy = ['disconnected', 'failed'].includes(peerConnection.iceConnectionState);
            return !connectionUnhealthy
                && !iceUnhealthy
                && (peerConnection.connectionState === 'connected'
                    || ['connected', 'completed'].includes(peerConnection.iceConnectionState));
        }

        function isClosed(peerConnection) {
            return peerConnection.connectionState === 'closed'
                || peerConnection.iceConnectionState === 'closed';
        }

        function teardown(peerId, peerConnection) {
            if (!isCurrentPeer(peerId, peerConnection)) {
                forget(peerConnection);
                return;
            }
            forget(peerConnection);
            if (typeof options.teardownPeer === 'function') {
                options.teardownPeer(peerId, peerConnection);
            }
        }

        function scheduleFinalCheck(peerId, peerConnection, state) {
            clearScheduledTimer(state);
            state.timer = setTimer(() => {
                state.timer = null;
                if (!isCurrentPeer(peerId, peerConnection)) {
                    forget(peerConnection);
                    return;
                }
                if (isConnected(peerConnection)) {
                    state.recoveryAttempted = false;
                    return;
                }
                teardown(peerId, peerConnection);
            }, recoveryGraceMs);
        }

        function beginRecovery(peerId, peerConnection, state) {
            if (state.recoveryAttempted || !isCurrentPeer(peerId, peerConnection)) return;
            state.recoveryAttempted = true;
            try {
                Promise.resolve(options.restartPeer?.(peerId, peerConnection)).catch(() => {});
            } catch (_error) {}
            scheduleFinalCheck(peerId, peerConnection, state);
        }

        function observe(peerId, peerConnection) {
            if (!peerConnection || typeof peerConnection !== 'object') return;
            if (!isCurrentPeer(peerId, peerConnection) || isClosed(peerConnection)) {
                forget(peerConnection);
                return;
            }
            const state = stateFor(peerConnection);
            const failed = peerConnection.connectionState === 'failed'
                || peerConnection.iceConnectionState === 'failed';
            if (failed) {
                if (!state.recoveryAttempted) {
                    clearScheduledTimer(state);
                    beginRecovery(peerId, peerConnection, state);
                }
                return;
            }

            const disconnected = peerConnection.connectionState === 'disconnected'
                || peerConnection.iceConnectionState === 'disconnected';
            if (disconnected) {
                beginRecovery(peerId, peerConnection, state);
                return;
            }

            if (isConnected(peerConnection)) {
                clearScheduledTimer(state);
                state.recoveryAttempted = false;
            }
        }

        return { forget, observe };
    }

    function createVideoClient(options = {}) {
        let apiBaseUrl = options.apiBaseUrl || '';
        let lifecycleGeneration = 0;
        let operationQueue = Promise.resolve();
        const trackedGenerations = new Set();
        const teardownOptionsByGeneration = new Map();
        const cancellationByGeneration = new Map();
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
            cancellationByGeneration.delete(generation);
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

        function cancelTrackedGenerations(throughGeneration) {
            for (const generation of trackedGenerations) {
                if (generation > throughGeneration) continue;
                try {
                    cancellationByGeneration.get(generation)?.abort();
                } catch (_error) {}
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
                    {
                        headers: membershipHeaders(session.membershipToken),
                        signal: cancellationByGeneration.get(session.generation)?.signal
                    }
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
                                keepalive: !!effectiveOptions.keepalive,
                                timeoutMs: VIDEO_TEARDOWN_REQUEST_TIMEOUT_MS
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
            cancelTrackedGenerations(supersededThroughGeneration);
            if (state.session || state.joined) {
                const immediateDisposal = disposeActiveSession(teardownOptions);
                return enqueue(() => immediateDisposal);
            }
            return enqueue(() => disposeActiveSession(teardownOptions));
        }

        function joinRealtimeKitRoom(options = {}) {
            const supersededThroughGeneration = lifecycleGeneration;
            const joinGeneration = ++lifecycleGeneration;
            cancelTrackedGenerations(supersededThroughGeneration);
            const cancellationController = createLifecycleCancellationController();
            trackedGenerations.add(joinGeneration);
            cancellationByGeneration.set(joinGeneration, cancellationController);
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
                        {
                            headers: membershipHeaders(session.membershipToken),
                            signal: cancellationController.signal
                        }
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
                        policy: tokenPayload.policy || {},
                        signal: cancellationController.signal
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
                    const wasSuperseded = joinGeneration !== lifecycleGeneration;
                    if (state.session?.generation === joinGeneration) {
                        stopHeartbeat();
                        state.session = null;
                        state.joined = null;
                    }
                    await disposeSession(session, joined);
                    if (wasSuperseded
                        && (/** @type {any} */ (error))?.code !== 'VIDEO_JOIN_SUPERSEDED') {
                        throw supersededJoinError();
                    }
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
        createVideoClient,
        createMeshPeerRecoveryController
    };
})(window);
