(function attachRealtimeKitClient(global) {
    // RealtimeKit CDN versions are pinned for beta stability.
    // Upgrade intentionally after running npm run cloudflare:smoke and manual camera QA.
    const REALTIMEKIT_VERSION = '2.0.0';
    const UI_LOADER_URL = `https://cdn.jsdelivr.net/npm/@cloudflare/realtimekit-ui@${REALTIMEKIT_VERSION}/loader/index.es2017.js`;
    const CORE_SDK_URL = `https://cdn.jsdelivr.net/npm/@cloudflare/realtimekit@${REALTIMEKIT_VERSION}/dist/browser.js`;
    const SDK_LOAD_TIMEOUT_MS = 15000;
    const PROVIDER_TEARDOWN_TIMEOUT_MS = 2000;
    const LOCAL_MEDIA_FIELDS = [
        'audioTrack',
        'videoTrack',
        'screenShareTrack',
        'screenShareTracks',
        'screenshareTrack',
        'screenshareTracks',
        'screenShareAudioTrack',
        'screenShareVideoTrack',
        'mediaStream',
        'audioStream',
        'videoStream',
        'screenShareStream',
        'screenshareStream',
        'tracks'
    ];
    const NESTED_MEDIA_FIELDS = [
        'track',
        'audio',
        'video',
        'audioTrack',
        'videoTrack',
        'screenShareTrack',
        'screenShareTracks',
        'screenshareTrack',
        'screenshareTracks'
    ];
    let sdkLoadPromise = null;
    const meetingMountPoints = new WeakMap();

    function withTimeout(promise, timeoutMs, message) {
        let timeoutId = null;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => {
            if (timeoutId) clearTimeout(timeoutId);
        });
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', reject, { once: true });
                if ((/** @type {HTMLScriptElement} */ (existing)).dataset.loaded === 'true') resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = () => {
                script.dataset.loaded = 'true';
                resolve();
            };
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }

    function loadUiKit() {
        if (customElements.get('rtk-meeting')) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const existing = document.getElementById('halastudy-rtk-ui-loader');
            if (existing) {
                existing.addEventListener('load', resolve, { once: true });
                existing.addEventListener('error', reject, { once: true });
                return;
            }

            const globalAny = /** @type {any} */ (global);
            globalAny.__halastudyRtkUiLoaded = () => resolve();
            globalAny.__halastudyRtkUiFailed = (message) => reject(new Error(message || 'RealtimeKit UI Kit failed to load.'));

            const script = document.createElement('script');
            script.id = 'halastudy-rtk-ui-loader';
            script.type = 'module';
            script.textContent = `
                import { defineCustomElements } from "${UI_LOADER_URL}";
                defineCustomElements();
                window.__halastudyRtkUiLoaded && window.__halastudyRtkUiLoaded();
            `;
            script.onerror = () => {
                globalAny.__halastudyRtkUiFailed?.('RealtimeKit UI Kit failed to load.');
            };
            document.head.appendChild(script);
        });
    }

    function loadSdk() {
        if (sdkLoadPromise) return sdkLoadPromise;
        sdkLoadPromise = withTimeout(Promise.all([
            loadUiKit(),
            loadScript(CORE_SDK_URL)
        ]), SDK_LOAD_TIMEOUT_MS, 'RealtimeKit SDK load timed out.').then(() => {
            const globalAny = /** @type {any} */ (global);
            if (!globalAny.RealtimeKitClient || typeof globalAny.RealtimeKitClient.init !== 'function') {
                throw new Error('RealtimeKit SDK did not expose RealtimeKitClient.init.');
            }
            return globalAny.RealtimeKitClient;
        }).catch((error) => {
            sdkLoadPromise = null;
            throw error;
        });
        return sdkLoadPromise;
    }

    function rememberMeetingMount(meetingElement) {
        if (!meetingElement?.parentNode) return;
        meetingMountPoints.set(meetingElement, {
            parent: meetingElement.parentNode,
            nextSibling: meetingElement.nextSibling
        });
    }

    function ensureMeetingElementMounted(meetingElement) {
        if (meetingElement.parentNode) return;
        const mountPoint = meetingMountPoints.get(meetingElement);
        if (!mountPoint?.parent) return;
        if (mountPoint.nextSibling && mountPoint.nextSibling.parentNode === mountPoint.parent) {
            mountPoint.parent.insertBefore(meetingElement, mountPoint.nextSibling);
            return;
        }
        mountPoint.parent.appendChild(meetingElement);
    }

    function unmountMeetingElement(meetingElement) {
        if (!meetingElement) return;
        try {
            meetingElement.meeting = null;
        } catch (_error) {}
        try {
            if (typeof meetingElement.remove === 'function') {
                meetingElement.remove();
            } else if (meetingElement.parentNode) {
                meetingElement.parentNode.removeChild(meetingElement);
            }
        } catch (_error) {}
    }

    function localParticipants(meeting) {
        const participants = [];
        for (const participant of [readProperty(meeting, 'self'), readProperty(meeting, 'localUser')]) {
            if (!participant || (typeof participant !== 'object' && typeof participant !== 'function')) continue;
            if (!participants.includes(participant)) participants.push(participant);
        }
        return participants;
    }

    function readProperty(target, property) {
        try {
            return target?.[property];
        } catch (_error) {
            return undefined;
        }
    }

    function collectTracksFromValue(value, tracks, visited) {
        if (!value || (typeof value !== 'object' && typeof value !== 'function')) return;
        if (visited.has(value)) return;
        visited.add(value);

        const kind = readProperty(value, 'kind');
        if ((kind === 'audio' || kind === 'video') && typeof readProperty(value, 'stop') === 'function') {
            tracks.add(value);
            return;
        }

        const getTracks = readProperty(value, 'getTracks');
        if (typeof getTracks === 'function') {
            try {
                for (const track of getTracks.call(value) || []) {
                    collectTracksFromValue(track, tracks, visited);
                }
            } catch (_error) {}
        }

        if (Array.isArray(value)) {
            for (const item of value) collectTracksFromValue(item, tracks, visited);
            return;
        }

        for (const field of NESTED_MEDIA_FIELDS) {
            collectTracksFromValue(readProperty(value, field), tracks, visited);
        }
    }

    function collectLocalTracks(meeting) {
        const tracks = new Set();
        const visited = new Set();
        for (const participant of localParticipants(meeting)) {
            for (const field of LOCAL_MEDIA_FIELDS) {
                collectTracksFromValue(readProperty(participant, field), tracks, visited);
            }
        }
        return tracks;
    }

    function stopTracks(tracks, stoppedTracks = new Set()) {
        for (const track of tracks) {
            if (stoppedTracks.has(track)) continue;
            stoppedTracks.add(track);
            try {
                track.stop();
            } catch (_error) {}
        }
        return stoppedTracks;
    }

    function disableLocalMedia(meeting) {
        const operations = [];
        for (const participant of localParticipants(meeting)) {
            for (const method of ['disableScreenShare', 'disableVideo', 'disableAudio']) {
                const disable = readProperty(participant, method);
                if (typeof disable !== 'function') continue;
                try {
                    operations.push(Promise.resolve(disable.call(participant)));
                } catch (error) {
                    operations.push(Promise.reject(error));
                }
            }
        }
        return Promise.allSettled(operations);
    }

    async function releaseLocalMedia(meeting) {
        const tracks = collectLocalTracks(meeting);
        const disablePromise = disableLocalMedia(meeting);
        // Stop capture synchronously. Provider RPCs may reject or never settle,
        // but the camera, microphone, and display capture must still turn off.
        const stoppedTracks = stopTracks(tracks);
        await disablePromise;
        for (const track of collectLocalTracks(meeting)) tracks.add(track);
        stopTracks(tracks, stoppedTracks);
    }

    function meetingOwnsFullscreen(meetingElement, fullscreenElement) {
        if (!meetingElement || !fullscreenElement) return false;
        if (meetingElement === fullscreenElement) return true;
        try {
            return typeof meetingElement.contains === 'function'
                && meetingElement.contains(fullscreenElement);
        } catch (_error) {
            return false;
        }
    }

    function clearMeetingFullscreen(meetingElement) {
        const documentAny = /** @type {any} */ (document);
        let fullscreenElement = null;
        try {
            fullscreenElement = document.fullscreenElement || documentAny.webkitFullscreenElement;
        } catch (_error) {
            return Promise.resolve();
        }
        if (!meetingOwnsFullscreen(meetingElement, fullscreenElement)) return Promise.resolve();
        let exitFullscreen = null;
        try {
            exitFullscreen = document.exitFullscreen || documentAny.webkitExitFullscreen;
        } catch (_error) {
            return Promise.resolve();
        }
        if (typeof exitFullscreen !== 'function') return Promise.resolve();
        try {
            return Promise.resolve(exitFullscreen.call(document)).catch(() => {});
        } catch (_error) {
            return Promise.resolve();
        }
    }

    async function disconnectMeeting(meeting) {
        const methods = ['leaveRoom', 'leave', 'disconnect'];
        let firstError = null;
        for (const method of methods) {
            const disconnect = readProperty(meeting, method);
            if (typeof disconnect === 'function') {
                try {
                    await disconnect.call(meeting);
                    return;
                } catch (error) {
                    firstError ||= error;
                }
            }
        }
        if (firstError) throw firstError;
    }

    function withTeardownDeadline(promise) {
        let timeoutId = null;
        const deadline = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error('RealtimeKit teardown timed out.'));
            }, PROVIDER_TEARDOWN_TIMEOUT_MS);
        });
        return Promise.race([promise, deadline]).finally(() => {
            if (timeoutId !== null) clearTimeout(timeoutId);
        });
    }

    function createIdempotentLeave(meeting, meetingElement = null) {
        let leavePromise = null;
        return function leaveMeeting() {
            if (!leavePromise) {
                // Detach the provider UI immediately so a rejected/hung SDK
                // leave cannot keep a fullscreen layer intercepting the page.
                const fullscreenCleanup = clearMeetingFullscreen(meetingElement);
                unmountMeetingElement(meetingElement);
                const mediaCleanup = releaseLocalMedia(meeting);
                leavePromise = withTeardownDeadline(
                    disconnectMeeting(meeting).finally(async () => {
                        await Promise.allSettled([mediaCleanup, fullscreenCleanup]);
                    })
                );
            }
            return leavePromise;
        };
    }

    async function join(options = {}) {
        const { authToken, meetingElement, policy = {} } = options;
        if (!meetingElement) throw new Error('RealtimeKit meeting element missing.');
        rememberMeetingMount(meetingElement);
        ensureMeetingElementMounted(meetingElement);

        let meeting = null;
        let leaveMeeting = null;
        try {
            if (!authToken) throw new Error('RealtimeKit auth token missing.');
            const RealtimeKitClient = await loadSdk();
            meeting = await RealtimeKitClient.init({
                authToken,
                defaults: {
                    audio: !!policy.micDefaultEnabled,
                    video: true
                }
            });
            leaveMeeting = createIdempotentLeave(meeting, meetingElement);

            meetingElement.meeting = meeting;
            if (typeof meeting.join === 'function') {
                await meeting.join();
            }
            if (!policy.micDefaultEnabled && meeting.self && typeof meeting.self.disableAudio === 'function') {
                try {
                    await meeting.self.disableAudio();
                } catch (_error) {}
            }
        } catch (error) {
            if (leaveMeeting) {
                await leaveMeeting().catch(() => {});
            } else {
                unmountMeetingElement(meetingElement);
            }
            throw error;
        }

        return {
            meeting,
            leave: leaveMeeting
        };
    }

    // Headless join for a CUSTOM grid (the Lobby): inits the core SDK and joins
    // the meeting WITHOUT mounting the prebuilt <rtk-meeting> UI component. The
    // caller drives its own tiles from the returned `meeting` object
    // (meeting.participants / meeting.self). Mic stays off; video is only
    // produced when the caller explicitly calls meeting.self.enableVideo()
    // (and only a publisher-preset token permits that).
    async function joinHeadless(options = {}) {
        const { authToken } = options;
        if (!authToken) throw new Error('RealtimeKit auth token missing.');

        const RealtimeKitClient = await loadSdk();
        const meeting = await RealtimeKitClient.init({
            authToken,
            defaults: { audio: false, video: false }
        });
        const leaveMeeting = createIdempotentLeave(meeting);

        try {
            if (typeof meeting.join === 'function') {
                await meeting.join();
            }
            // Belt-and-braces: never emit audio from the Lobby.
            if (meeting.self && typeof meeting.self.disableAudio === 'function') {
                try { await meeting.self.disableAudio(); } catch (_error) {}
            }
        } catch (error) {
            await leaveMeeting().catch(() => {});
            throw error;
        }
        return { meeting, leave: leaveMeeting };
    }

    (/** @type {any} */ (global)).HalastudyRealtimeKitClient = {
        join,
        joinHeadless,
        loadSdk
    };
})(window);
