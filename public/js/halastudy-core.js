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

    /* ---------- language ---------- */
    function getLang() {
        try { return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'ar'; } catch (_e) { return 'ar'; }
    }
    function setStoredLang(lang) {
        try { localStorage.setItem(LANG_KEY, lang); } catch (_e) {}
    }

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
            b.classList.toggle('is-on', b.getAttribute('data-lang-value') === langState.lang);
        });
        langState.listeners.forEach((cb) => {
            try { cb(langState.lang, copy); } catch (_e) {}
        });
    }

    function initLang(dict) {
        langState.dict = dict;
        document.querySelectorAll('[data-lang-value]').forEach((b) => {
            b.addEventListener('click', () => {
                langState.lang = b.getAttribute('data-lang-value') === 'en' ? 'en' : 'ar';
                setStoredLang(langState.lang);
                applyLangToDom();
            });
        });
        applyLangToDom();
    }

    /* ---------- fetch helper (same contract as video-client postJson) ---------- */
    function requestJson(method, url, body) {
        /** @type {RequestInit & { headers: Record<string, string> }} */
        const options = {
            method: method,
            headers: {},
            credentials: 'include'
        };
        if (body !== undefined) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body || {});
        }
        return fetch(url, options).then((response) => response.json().catch(() => ({})).then((payload) => {
                if (!response.ok) {
                    /** @type {Error & { status?: number, code?: string, payload?: any }} */
                    const error = new Error(`Request failed: ${response.status}`);
                    error.status = response.status;
                    error.code = payload.errorCode || payload.error || 'REQUEST_FAILED';
                    error.payload = payload;
                    throw error;
                }
                return payload;
            }));
    }

    /* ---------- auth session cache ---------- */
    var userPromise = null;

    function getUser() {
        if (!userPromise) {
            userPromise = requestJson('GET', '/api/auth/me')
                .then((payload) => payload?.user ? payload.user : null)
                .catch(() => null);
        }
        return userPromise;
    }

    function refreshUser() {
        userPromise = null;
        return getUser();
    }

    function signout() {
        return requestJson('POST', '/api/auth/logout')
            .catch(() => { /* already signed out */ })
            .then(() => { userPromise = Promise.resolve(null); return null; });
    }

    /* Swap the quiet "Sign in" topbar link (#auth-entry) for the avatar chip
     * when a session exists. Pages without #auth-entry are untouched. */
    function initAuthEntry() {
        var entry = document.getElementById('auth-entry');
        if (!entry) return;
        getUser().then((user) => {
            if (!user) return;
            const ui = (/** @type {any} */ (global)).HalaUI;
            if (ui && typeof ui.renderAuthChip === 'function') {
                ui.renderAuthChip(entry, user);
            } else {
                entry.textContent = user.displayName;
                entry.setAttribute('href', '/account.html');
            }
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
        if (!announcement || !announcement.id) return;
        var message = announcementMessage(announcement);
        if (!message) return;
        try {
            if (localStorage.getItem(ANNOUNCE_DISMISS_KEY) === announcement.id) return;
        } catch (e) { /* storage unavailable */ }

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
        dismiss.setAttribute('aria-label', 'Dismiss');
        dismiss.textContent = '×';
        dismiss.style.cssText = 'border:0;background:transparent;cursor:pointer;color:inherit;'
            + 'font-size:16px;line-height:1;min-inline-size:32px;min-block-size:32px;border-radius:50%;';
        dismiss.addEventListener('click', () => {
            banner.remove();
            try { localStorage.setItem(ANNOUNCE_DISMISS_KEY, announcement.id); } catch (e) {}
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
        postJson: (url, body) => requestJson('POST', url, body)
    };

    (/** @type {any} */ (global)).HalaAuth = {
        getUser: getUser,
        refreshUser: refreshUser,
        signout: signout
    };
})(window);
