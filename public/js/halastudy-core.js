/* Halastudy shared core — loaded synchronously by every page BEFORE the
 * page's inline script, so storage migration and the persisted theme apply
 * before first paint and before any page code reads halastudy* keys.
 *
 * Owns only page-agnostic boilerplate: storage migration, theme persistence,
 * a lang engine for pages that opt in via HalaCore.initLang (account/404 —
 * the three original pages keep their own engines), postJson, and the auth
 * session cache (HalaAuth). No socket, form, or timer logic lives here. */
(function attachHalastudyCore(global) {
    

    var LANG_KEY = 'halastudyLang';
    var THEME_KEY = 'halastudyTheme';

    /* ---------- storage-key migration (was: coStudy*) ----------
     * One-shot copy-forward, idempotent via sentinel. Old keys stay readable
     * for one release. Drop after the next release ships clean. */
    (function migrateCoStudyToHalastudy() {
        try {
            const SENTINEL = 'halastudy:migratedFromCoStudy:v1';
            if (localStorage.getItem(SENTINEL)) return;
            const localMap = {
                coStudyLang: 'halastudyLang',
                coStudyStatusState: 'halastudyStatusState',
                coStudyAmbientState: 'halastudyAmbientState',
                coStudyFocusStats: 'halastudyFocusStats',
                coStudyClientId: 'halastudyClientId',
                coStudyName: 'halastudyName'
            };
            const sessionMap = {
                coStudyRoomPassword: 'halastudyRoomPassword',
                coStudyRoomCode: 'halastudyRoomCode'
            };
            Object.keys(localMap).forEach((oldK) => {
                const v = localStorage.getItem(oldK);
                if (v !== null && localStorage.getItem(localMap[oldK]) === null) {
                    localStorage.setItem(localMap[oldK], v);
                }
            });
            Object.keys(sessionMap).forEach((oldK) => {
                const v = sessionStorage.getItem(oldK);
                if (v !== null && sessionStorage.getItem(sessionMap[oldK]) === null) {
                    sessionStorage.setItem(sessionMap[oldK], v);
                }
            });
            localStorage.setItem(SENTINEL, String(Date.now()));
        } catch (_e) { /* storage unavailable — skip */ }
    })();

    /* ---------- theme ---------- */
    function getStoredTheme() {
        try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch (_e) { return 'light'; }
    }
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
    }
    function setTheme(theme) {
        try { localStorage.setItem(THEME_KEY, theme); } catch (_e) {}
        applyTheme(theme);
    }
    function toggleTheme() {
        var cur = document.documentElement.getAttribute('data-theme') || 'light';
        setTheme(cur === 'dark' ? 'light' : 'dark');
    }
    // Apply persisted theme immediately (pre-paint — this file loads sync).
    applyTheme(getStoredTheme());

    /* ---------- offline worker ---------- */
    function registerServiceWorker() {
        const serviceWorker = global.navigator?.serviceWorker;
        if (!serviceWorker) return;
        serviceWorker.register('/service-worker.js', {
            scope: '/',
            updateViaCache: 'none'
        }).catch(() => { /* offline support is best-effort */ });
    }
    registerServiceWorker();

    /* ---------- language ---------- */
    function getLang() {
        // An explicit English URL (/en/...) is English for everyone, including
        // crawlers with no storage. The unprefixed Arabic route is the shared
        // canonical page, so a visitor's saved choice wins there.
        const routeLang = document.documentElement.getAttribute('data-route-lang');
        if (routeLang === 'en') return 'en';
        try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ar'; } catch (_e) { return 'ar'; }
    }
    function setStoredLang(lang) {
        try { localStorage.setItem(LANG_KEY, lang); } catch (_e) {}
    }
    /* A bilingual public route (/ vs /en) is an explicit language choice for a
     * first-time visitor: save it so app pages continue in that language. A
     * visitor who already chose a language keeps it; the language switch is
     * the only thing that changes a saved choice. */
    (function persistRouteLang() {
        const root = document.documentElement;
        if (!root || typeof root.getAttribute !== 'function' || typeof root.hasAttribute !== 'function') return;
        const routeLang = root.getAttribute('data-route-lang');
        if (!root.hasAttribute('data-route-lang-persist') || (routeLang !== 'ar' && routeLang !== 'en')) return;
        let stored = null;
        try { stored = localStorage.getItem(LANG_KEY); } catch (_e) { /* storage unavailable */ }
        if (!stored) setStoredLang(routeLang);
    })();

    /* Markup in one language that re-renders in the visitor's saved language
     * after parsing would paint twice: the second paint moves every block
     * below the hero (CLS ≈ 0.4 on the landing page). Keep the body invisible
     * until that first language pass sets html[lang]; end-of-body scripts run
     * before DOMContentLoaded, so the hold lasts milliseconds and releases
     * unconditionally once the document is parsed. */
    (function holdPaintUntilLangApplied() {
        const root = document.documentElement;
        if (!root || typeof root.getAttribute !== 'function' || typeof MutationObserver !== 'function') return;
        const markupLang = (root.getAttribute('lang') || '').slice(0, 2);
        if (!markupLang || markupLang === getLang()) return;
        root.setAttribute('data-lang-swap', '');
        const observer = new MutationObserver(release);
        function release() {
            root.removeAttribute('data-lang-swap');
            observer.disconnect();
        }
        observer.observe(root, { attributes: true, attributeFilter: ['lang'] });
        document.addEventListener('DOMContentLoaded', release, { once: true });
    })();

    /* Lang engine for pages without their own (account.html, 404.html).
     * Supports both attribute conventions used across the app:
     *   data-i18n / data-lang            -> textContent
     *   data-lang-placeholder            -> placeholder
     *   data-lang-title                  -> title
     *   data-lang-aria                   -> aria-label
     * dict shape: { en: {...}, ar: {...} } */
    var langState = { dict: null, lang: getLang(), listeners: [] };

    function activeCopy() {
        if (!langState.dict) return {};
        return langState.dict[langState.lang] || langState.dict.en || {};
    }

    function applyLangToDom() {
        var copy = activeCopy();
        document.documentElement.lang = langState.lang;
        document.documentElement.dir = langState.lang === 'ar' ? 'rtl' : 'ltr';
        if (copy.pageTitle) document.title = copy.pageTitle;
        ['data-i18n', 'data-lang'].forEach((attr) => {
            document.querySelectorAll(`[${attr}]`).forEach((el) => {
                var key = el.getAttribute(attr);
                if (copy[key] != null) el.textContent = copy[key];
            });
        });
        document.querySelectorAll('[data-lang-placeholder]').forEach((el) => {
            var key = el.getAttribute('data-lang-placeholder');
            if (copy[key] != null) el.setAttribute('placeholder', copy[key]);
        });
        document.querySelectorAll('[data-lang-title]').forEach((el) => {
            var key = el.getAttribute('data-lang-title');
            if (copy[key] != null) el.setAttribute('title', copy[key]);
        });
        document.querySelectorAll('[data-lang-aria]').forEach((el) => {
            var key = el.getAttribute('data-lang-aria');
            if (copy[key] != null) el.setAttribute('aria-label', copy[key]);
        });
        document.querySelectorAll('[data-lang-value]').forEach((b) => {
            const selected = b.getAttribute('data-lang-value') === langState.lang;
            b.classList.toggle('is-on', selected);
            if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(selected));
            else {
                b.removeAttribute('aria-pressed');
                if (selected) b.setAttribute('aria-current', 'page');
                else b.removeAttribute('aria-current');
            }
        });
        langState.listeners.forEach((cb) => {
            try { cb(langState.lang, copy); } catch (_e) {}
        });
        translateUnavailable();
    }

    function initLang(dict) {
        langState.dict = dict;
        document.querySelectorAll('[data-lang-value]').forEach((b) => {
            b.addEventListener('click', () => {
                langState.lang = b.getAttribute('data-lang-value') === 'en' ? 'en' : 'ar';
                setStoredLang(langState.lang);
                if (b.tagName === 'A') return;
                applyLangToDom();
            });
        });
        applyLangToDom();
    }

    /* ---------- fetch helper (same contract as video-client postJson) ---------- */
    /** @param {{ signal?: AbortSignal }} [requestOptions] */
    function requestJson(method, url, body, requestOptions = {}) {
        /** @type {RequestInit & { headers: Record<string, string> }} */
        const options = {
            method: method,
            headers: {},
            credentials: 'include'
        };
        // Platform requests stay pinned to the account this document first
        // verified, so a newer sign-in in another tab cannot act as it.
        if (url.startsWith('/api/platform/') && documentAccountId) {
            options.headers['X-Halastudy-Account'] ||= documentAccountId;
        }
        if (body !== undefined) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body || {});
        }
        if (requestOptions.signal) options.signal = requestOptions.signal;
        // A stalled request must release the caller: 15 s is the shared deadline (V3-01).
        else if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') options.signal = AbortSignal.timeout(15000);
        return fetch(url, options).then((response) => response.json().catch(() => ({})).then((payload) => {
                if (requestOptions.signal?.aborted) {
                    const error = new Error('Request aborted');
                    error.name = 'AbortError';
                    throw error;
                }
                if (!response.ok) {
                    // A 401 on a secondary read drops the cached user, but never
                    // aborts an identity check already in flight: that check is the
                    // authoritative answer and aborting it reads as "signed out".
                    if (response.status === 401 && !authController) invalidateAuthCache(true);
                    /** @type {Error & { status?: number, code?: string, payload?: any }} */
                    const error = new Error(`Request failed: ${response.status}`);
                    error.status = response.status;
                    error.code = payload.errorCode || payload.error || 'REQUEST_FAILED';
                    error.payload = payload;
                    throw error;
                }
                if (String(method).toUpperCase() === 'DELETE' && String(url).split(/[?#]/)[0] === '/api/me') {
                    invalidateAuthCache(true);
                }
                return payload;
            }));
    }

    /* ---------- auth session cache ---------- */
    var userPromise = null;
    var documentAccountId = null;
    var authGeneration = 0;
    var authController = null;

    function invalidateAuthCache(cacheGuest = false) {
        authGeneration += 1;
        if (authController) {
            authController.abort();
            authController = null;
        }
        userPromise = cacheGuest ? Promise.resolve(null) : null;
    }

    function getUser() {
        if (!userPromise) {
            const generation = authGeneration;
            const controller = new AbortController();
            authController = controller;
            userPromise = requestJson('GET', '/api/auth/me', undefined, { signal: controller.signal })
                .then((payload) => {
                    if (generation !== authGeneration || controller.signal.aborted) return null;
                    // Keep this document bound to its first verified account until navigation.
                    if (payload?.user && !documentAccountId) documentAccountId = payload.user.id;
                    return payload?.user ? payload.user : null;
                })
                .catch(() => null)
                .finally(() => {
                    if (authController === controller) authController = null;
                });
        }
        return userPromise;
    }

    function refreshUser() {
        invalidateAuthCache();
        return getUser();
    }

    function signout() {
        invalidateAuthCache(true);
        return requestJson('POST', '/api/auth/logout')
            .catch(() => { /* already signed out */ })
            .then(() => null);
    }
    function clearStudyStorage(userId) {
        if (typeof userId !== 'string' || !userId) return;
        try {
            for (const key of Object.keys(localStorage)) {
                if (key === `halastudy:routine:${userId}` || key.startsWith(`halastudy:reminder:${userId}:`)) localStorage.removeItem(key);
            }
        } catch { /* storage may be blocked */ }
    }

    function showUnavailable(target = null, retry = null) {
        if (!target) {
            target = document.getElementById('session-unavailable');
            if (!target) {
                target = document.createElement('div');
                target.id = 'session-unavailable';
                const main = document.querySelector('main') || document.body;
                main.prepend(target);
            }
        }
        target.hidden = false;
        target.setAttribute('role', 'status');
        const message = document.createElement('p');
        message.setAttribute('data-core-unavailable', 'message');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary';
        button.style.minBlockSize = '44px';
        button.setAttribute('data-core-unavailable', 'retry');
        button.onclick = () => {
            button.disabled = true;
            Promise.resolve().then(() => retry ? retry() : global.location.reload())
                .catch(() => showUnavailable(target, retry))
                .finally(() => { button.disabled = false; });
        };
        target.replaceChildren(message, button);
        translateUnavailable();
    }
    function translateUnavailable() {
        document.querySelectorAll('[data-core-unavailable]').forEach((element) => {
            const retry = element.getAttribute('data-core-unavailable') === 'retry';
            element.textContent = getLang() === 'ar'
                ? (retry ? 'إعادة المحاولة' : 'تعذّر تحميل البيانات. حاول مرة أخرى.')
                : (retry ? 'Retry' : 'Data is unavailable. Please try again.');
        });
    }

    /* Swap the quiet "Sign in" topbar link (#auth-entry) for the avatar chip
     * when a session exists. Pages without #auth-entry are untouched. */
    function initAuthEntry() {
        var entry = document.getElementById('auth-entry');
        if (!entry) return;
        getUser().then((user) => {
            if (!user) return;
            const ui = (/** @type {any} */ (global)).HalaUI;
            const ar = getLang() === 'ar';
            if (ui && typeof ui.renderAuthChip === 'function') {
                ui.renderAuthChip(entry, user, {
                    menuItems: [
                        { label: ar ? 'مساحتي' : 'My workspace', href: '/app' },
                        { label: ar ? 'عضوية VIP' : 'VIP membership', href: '/plans' },
                        { label: ar ? 'حسابي' : 'My account', href: '/account.html' },
                        { label: ar ? 'تسجيل الخروج' : 'Sign out', danger: true, onSelect: () => {
                            signout().then(() => { global.location.assign('/'); }).catch(() => {
                                ui.toast(ar ? 'تعذّر تسجيل الخروج. حاول مرة أخرى.' : 'Sign-out failed. Please try again.', { kind: 'error' });
                            });
                        } }
                    ]
                });
            } else {
                entry.textContent = user.displayName;
                entry.setAttribute('href', '/account.html');
            }
        }).catch(() => {
            entry.hidden = true;
            showUnavailable();
        });
    }

    /* ---------- admin broadcast banner ----------
     * Hairline strip under the topbar. Dismissal is per-announcement id.
     * Pages get it via a boot fetch; in-room clients also receive the
     * 'announcement' socket event and call HalaCore.showAnnouncement. */
    var ANNOUNCE_DISMISS_KEY = 'halastudyAnnouncementDismissed';

    function announcementMessage(announcement) {
        if (!announcement) return '';
        return getLang() === 'ar'
            ? (announcement.messageAr || announcement.messageEn || '')
            : (announcement.messageEn || announcement.messageAr || '');
    }

    function clearAnnouncement() {
        var banner = document.getElementById('announce-banner');
        if (banner) banner.remove();
    }

    function showAnnouncement(announcement) {
        clearAnnouncement();
        if (!announcement?.id) return;
        var message = announcementMessage(announcement);
        if (!message) return;
        try {
            if (localStorage.getItem(ANNOUNCE_DISMISS_KEY) === announcement.id) return;
        } catch { /* storage unavailable */ }

        var banner = document.createElement('div');
        banner.id = 'announce-banner';
        banner.setAttribute('role', 'status');
        banner.style.cssText = 'display:flex;align-items:center;gap:10px;padding-block:10px;padding-inline:20px;'
            + 'background:var(--inset,#F8F3ED);border-block-end:1px solid var(--line-2,#EFE7DA);'
            + 'color:var(--ink,#2D3436);font-size:14px;';
        var text = document.createElement('span');
        text.style.cssText = 'flex:1;min-inline-size:0;';
        text.textContent = message;
        var dismiss = document.createElement('button');
        dismiss.type = 'button';
        dismiss.setAttribute('aria-label', getLang() === 'ar' ? 'إغلاق' : 'Dismiss');
        dismiss.textContent = '×';
        dismiss.style.cssText = 'border:0;background:transparent;cursor:pointer;color:inherit;'
            + 'font-size:16px;line-height:1;min-inline-size:32px;min-block-size:32px;border-radius:50%;';
        dismiss.addEventListener('click', () => {
            banner.remove();
            try { localStorage.setItem(ANNOUNCE_DISMISS_KEY, announcement.id); } catch {}
        });
        banner.appendChild(text);
        banner.appendChild(dismiss);

        var topbar = document.querySelector('.topbar, header');
        if (topbar?.parentNode) {
            topbar.parentNode.insertBefore(banner, topbar.nextSibling);
        } else {
            document.body.insertBefore(banner, document.body.firstChild);
        }
    }

    function initAnnouncement() {
        requestJson('GET', '/api/announcement')
            .then((payload) => { showAnnouncement(payload?.announcement); })
            .catch(() => { /* banner is best-effort */ });
    }

    function boot() {
        initAuthEntry();
        initAnnouncement();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    (/** @type {any} */ (global)).HalaCore = {
        showAnnouncement: showAnnouncement,
        clearAnnouncement: clearAnnouncement,
        getLang: getLang,
        initLang: initLang,
        t: (key) => activeCopy()[key],
        onLangChange: (cb) => { langState.listeners.push(cb); },
        applyTheme: applyTheme,
        setTheme: setTheme,
        toggleTheme: toggleTheme,
        requestJson: requestJson,
        clearStudyStorage: clearStudyStorage,
        showUnavailable: showUnavailable,
        postJson: (url, body) => requestJson('POST', url, body)
    };

    (/** @type {any} */ (global)).HalaAuth = {
        getUser: getUser,
        refreshUser: refreshUser,
        signout: signout
    };
})(window);
