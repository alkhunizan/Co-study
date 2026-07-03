(function attachRealtimeKitClient(global) {
    const UI_LOADER_URL = 'https://cdn.jsdelivr.net/npm/@cloudflare/realtimekit-ui@latest/loader/index.es2017.js';
    const CORE_SDK_URL = 'https://cdn.jsdelivr.net/npm/@cloudflare/realtimekit@latest/dist/browser.js';
    const SDK_LOAD_TIMEOUT_MS = 15000;
    let sdkLoadPromise = null;

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
                globalAny.__halastudyRtkUiFailed && globalAny.__halastudyRtkUiFailed('RealtimeKit UI Kit failed to load.');
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

    async function join(options = {}) {
        const { authToken, meetingElement, policy = {} } = options;
        if (!authToken) throw new Error('RealtimeKit auth token missing.');
        if (!meetingElement) throw new Error('RealtimeKit meeting element missing.');

        const RealtimeKitClient = await loadSdk();
        const meeting = await RealtimeKitClient.init({
            authToken,
            defaults: {
                audio: !!policy.micDefaultEnabled,
                video: true
            }
        });

        async function leaveMeeting() {
            const methods = ['leaveRoom', 'leave', 'disconnect'];
            for (const method of methods) {
                if (meeting && typeof meeting[method] === 'function') {
                    await meeting[method]();
                    break;
                }
            }
            meetingElement.meeting = null;
        }

        meetingElement.meeting = meeting;
        try {
            if (typeof meeting.join === 'function') {
                await meeting.join();
            }
            if (!policy.micDefaultEnabled && meeting.self && typeof meeting.self.disableAudio === 'function') {
                try {
                    await meeting.self.disableAudio();
                } catch (_error) {}
            }
        } catch (error) {
            await leaveMeeting().catch(() => {});
            throw error;
        }

        return {
            meeting,
            leave: leaveMeeting
        };
    }

    (/** @type {any} */ (global)).HalastudyRealtimeKitClient = {
        join,
        loadSdk
    };
})(window);
