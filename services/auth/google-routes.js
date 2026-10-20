// Google Sign-In via OAuth 2.0 Authorization Code flow. Dependency-free —
// node:crypto for the CSRF state + global fetch for the token/userinfo calls.
//
// Google subjects identify linked accounts. Linking an existing password
// account requires its signed-in session; a new email creates a profile with a random
// internal password (so the shared password/sanitize pipeline is untouched —
// the user only ever signs in through Google). We then issue the SAME signed
// session cookie the email/password flow uses.
//
// When GOOGLE_* env is unset the router mounts nothing, so every /auth/google
// path 404s exactly like an unknown URL.
const express = require('express');
const crypto = require('node:crypto');
const { hashPassword } = require('./password');
const { normalizeEmail, sanitizeUserText } = require('./index');
const { createUser } = require('../../user-store');
const { COOKIE_NAME, TTL_MS, issueReauth } = require('./reauth');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const STATE_COOKIE = 'hala_oauth';
const STATE_TTL_MS = 10 * 60 * 1000;
const DISPLAY_NAME_MAX_LENGTH = 20;

function createGoogleAuthRouter(deps = {}) {
    const {
        config = { enabled: false },
        users,
        usersByEmail,
        rateLimiters,
        applyHttpRateLimit,
        getRequestIp,
        setAuthCookie,
        appendSetCookie,
        parseCookies,
        persistUsersSoon,
        flushUsers,
        sessionSecret,
        logger = console,
        fetchImpl = globalThis.fetch
    } = deps;

    const router = express.Router();
    const pending = new Map();
    if (!config.enabled) {
        return router; // no handlers — all /auth/google/* fall through to 404
    }

    function setStateCookie(req, res, nonce) {
        const parts = [
            `${STATE_COOKIE}=${nonce}`,
            'Path=/auth/google',
            'HttpOnly',
            'SameSite=Lax',
            `Max-Age=${Math.floor(STATE_TTL_MS / 1000)}`
        ];
        if (req.secure) parts.push('Secure');
        appendSetCookie(res, parts.join('; '));
    }

    function clearStateCookie(req, res) {
        const parts = [`${STATE_COOKIE}=`, 'Path=/auth/google', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
        if (req.secure) parts.push('Secure');
        appendSetCookie(res, parts.join('; '));
    }

    // Step 1 — redirect the browser to Google's consent screen.
    router.get('/auth/google', (req, res) => {
        const requestIp = getRequestIp(req);
        if (!applyHttpRateLimit(req, res, rateLimiters.authLogin, requestIp)) return;

        const nonce = crypto.randomBytes(24).toString('base64url');
        for (const [key, value] of pending) {
            if (value.expires <= Date.now()) pending.delete(key);
        }
        const purpose = ['delete', 'security'].includes(String(req.query.purpose)) ? String(req.query.purpose) : 'login';
        if (purpose !== 'login' && !req.user) return res.redirect('/account');
        if (pending.size >= 1000) return res.status(429).json({ errorCode: 'RATE_LIMITED' });
        const verifier = crypto.randomBytes(32).toString('base64url');
        pending.set(nonce, { expires: Date.now() + STATE_TTL_MS, purpose, userId: req.user?.id, verifier });
        setStateCookie(req, res, nonce);
        const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            response_type: 'code',
            scope: 'openid email profile',
            state: nonce,
            access_type: 'online',
            prompt: purpose !== 'login' ? 'consent select_account' : 'select_account',
            code_challenge: crypto.createHash('sha256').update(verifier).digest('base64url'),
            code_challenge_method: 'S256'
        });
        res.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`);
    });

    // Step 2 — Google redirects back with ?code&state.
    router.get('/auth/google/callback', async (req, res) => {
        const requestIp = getRequestIp(req);
        if (!applyHttpRateLimit(req, res, rateLimiters.authLogin, requestIp)) return;

        const failRedirect = (reason) => {
            clearStateCookie(req, res);
            logger.warn({ event: 'google_auth_failed', reason });
            res.redirect('/account?auth=google_failed');
        };

        // CSRF: the state must match the browser-bound nonce cookie.
        const cookies = parseCookies(req.headers.cookie || '');
        const expected = cookies[STATE_COOKIE];
        const got = typeof req.query.state === 'string' ? req.query.state : '';
        if (!expected || !got || Buffer.byteLength(expected) !== Buffer.byteLength(got)
            || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got))) {
            return failRedirect('state_mismatch');
        }
        const flow = pending.get(got);
        pending.delete(got);
        if (!flow || flow.expires <= Date.now()) return failRedirect('state_expired');
        if (flow.purpose !== 'login' && (!req.user || flow.userId !== req.user.id)) {
            return failRedirect('session_changed');
        }
        const code = typeof req.query.code === 'string' ? req.query.code : '';
        if (!code) return failRedirect(typeof req.query.error === 'string' ? req.query.error : 'missing_code');

        let profile;
        try {
            const tokenRes = await fetchImpl(GOOGLE_TOKEN_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code,
                    client_id: config.clientId,
                    client_secret: config.clientSecret,
                    code_verifier: flow.verifier,
                    redirect_uri: config.redirectUri,
                    grant_type: 'authorization_code'
                }).toString(),
                signal: AbortSignal.timeout(10000)
            });
            if (!tokenRes.ok) return failRedirect(`token_${tokenRes.status}`);
            const token = await tokenRes.json();
            const infoRes = await fetchImpl(GOOGLE_USERINFO_URL, {
                headers: { Authorization: `Bearer ${token.access_token}` },
                signal: AbortSignal.timeout(10000)
            });
            if (!infoRes.ok) return failRedirect(`userinfo_${infoRes.status}`);
            profile = await infoRes.json();
        } catch (error) {
            logger.error({ event: 'google_auth_error', error: error?.message });
            return failRedirect('exchange_error');
        }

        const email = normalizeEmail(profile.email);
        // Google's email_verified comes back as a boolean or the string "true".
        const emailVerified = profile.email_verified === true || profile.email_verified === 'true';
        const googleSub = typeof profile.sub === 'string' && profile.sub ? profile.sub : null;
        if (!email || !emailVerified || !googleSub) return failRedirect('unverified_email');

        clearStateCookie(req, res);

        if (flow.purpose !== 'login') {
            if (req.user.googleSub !== googleSub) return failRedirect('identity_mismatch');
            const proof = issueReauth(req.user, cookies.coStudyAuth, sessionSecret, Date.now(), flow.purpose === 'delete' ? 'delete-account' : 'setup-mfa');
            appendSetCookie(res, `${COOKIE_NAME}=${proof}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${TTL_MS / 1000}${req.secure ? '; Secure' : ''}`);
            return res.redirect(flow.purpose === 'delete' ? '/account?reauth=complete' : '/app?security=verified#security');
        }

        // Match the provider subject first; email alone cannot authorize linking.
        const existingId = usersByEmail.get(email);
        let user = Array.from(users.values()).find((entry) => entry.googleSub === googleSub)
            || (existingId ? users.get(existingId) : null);
        if (user) {
            const previousSubject = user.googleSub;
            if (user.banned) {
                logger.warn({ event: 'google_auth_banned', userId: user.id });
                return res.redirect('/account?auth=banned');
            }
            if (!user.googleSub) {
                // Email/password accounts have not verified email ownership.
                // Linking therefore requires their existing signed-in session.
                if (req.user?.id !== user.id) return failRedirect('link_requires_login');
                user.googleSub = googleSub;
                if (!user.authProvider) user.authProvider = 'password';
                persistUsersSoon();
            }
            if (user.googleSub !== googleSub) return failRedirect('identity_mismatch');
            try { await flushUsers(); } catch {
                user.googleSub = previousSubject;
                persistUsersSoon();
                return failRedirect('persistence_failed');
            }
            setAuthCookie(req, res, user);
            logger.info({ event: 'google_login', userId: user.id });
            return res.redirect('/account?auth=google');
        }

        // New account. Random internal password keeps the existing pipeline
        // intact; the user authenticates only through Google.
        const displayName = sanitizeUserText(profile.name || email.split('@')[0], DISPLAY_NAME_MAX_LENGTH)
            || email.split('@')[0].slice(0, DISPLAY_NAME_MAX_LENGTH);
        const passwordHash = await hashPassword(crypto.randomBytes(32).toString('hex'));
        // Re-check after the async hash (TOCTOU on the email key).
        if (usersByEmail.has(email)) {
            return failRedirect('account_changed_retry');
        } else {
            user = createUser({ email, passwordHash, displayName });
            user.authProvider = 'google';
            user.googleSub = googleSub;
            users.set(user.id, user);
            usersByEmail.set(email, user.id);
            persistUsersSoon();
            logger.info({ event: 'google_signup', userId: user.id });
        }
        try {
            await flushUsers();
        } catch {
            users.delete(user.id);
            usersByEmail.delete(user.email);
            return failRedirect('persistence_failed');
        }
        setAuthCookie(req, res, user);
        return res.redirect('/account?auth=google');
    });

    return router;
}

module.exports = { createGoogleAuthRouter };
