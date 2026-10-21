// One return-path policy for password login, OAuth state and invitation handoff.
(function attachSafeReturn(root) {
    function safeReturn(value, fallback = '/open') {
        if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')
            || value.includes('\\') || [...value].some((character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)
            || /%(?:0[0-9a-f]|1[0-9a-f]|7f|5c)/i.test(value)) return fallback;
        try {
            const url = new URL(value, 'https://halastudy.invalid');
            return url.origin === 'https://halastudy.invalid' && !url.pathname.startsWith('//')
                ? `${url.pathname}${url.search}${url.hash}` : fallback;
        } catch { return fallback; }
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = safeReturn;
    else root.HalaSafeReturn = safeReturn;
})(/** @type {any} */ (globalThis));
