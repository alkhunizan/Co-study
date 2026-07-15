// Google Sign-In via OAuth 2.0 Authorization Code flow. Dependency-free —
// node:crypto for the CSRF state + global fetch for the token/userinfo calls.
//
// A Google account resolves only by its stable OpenID Connect subject. A
// verified-email match without a subject match requires an explicit linking
// flow and must never create a session. New emails become passwordless Google
// accounts and receive the same signed session cookie as password accounts.
//
// When GOOGLE_* env is unset the router mounts nothing, so every /auth/google
// path 404s exactly like an unknown URL.
const express = require('express');
const crypto = require('node:crypto');
const { normalizeEmail, sanitizeUserText } = require('./index');
const { createUser } = require('../../user-store');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const STATE_COOKIE = 'hala_oauth';
const STATE_TTL_MS = 10 * 60 * 1000;
const DISPLAY_NAME_MAX_LENGTH = 20;
const GOOGLE_SUB_MAX_LENGTH = 255;

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
        persistUser,
        logger = console,
        fetchImpl = globalThis.fetch
    } = deps;

    const router = express.Router();
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
        setStateCookie(req, res, nonce);
        const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            response_type: 'code',
            scope: 'openid email profile',
            state: nonce,
            access_type: 'online',
            prompt: 'select_account'
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
        if (!expected || !got || expected.length !== got.length
            || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(got))) {
            return failRedirect('state_mismatch');
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
                    redirect_uri: config.redirectUri,
                    grant_type: 'authorization_code'
                }).toString()
            });
            if (!tokenRes.ok) return failRedirect(`token_${tokenRes.status}`);
            const token = await tokenRes.json();
            const infoRes = await fetchImpl(GOOGLE_USERINFO_URL, {
                headers: { Authorization: `Bearer ${token.access_token}` }
            });
            if (!infoRes.ok) return failRedirect(`userinfo_${infoRes.status}`);
            profile = await infoRes.json();
        } catch (error) {
            logger.error({ event: 'google_auth_error', error: error && error.message });
            return failRedirect('exchange_error');
        }

        const email = normalizeEmail(profile.email);
        // Google's email_verified comes back as a boolean or the string "true".
        const emailVerified = profile.email_verified === true || profile.email_verified === 'true';
        const googleSub = typeof profile.sub === 'string'
            && profile.sub
            && profile.sub.trim() === profile.sub
            && profile.sub.length <= GOOGLE_SUB_MAX_LENGTH
            ? profile.sub
            : null;
        if (!email || !emailVerified || !googleSub) return failRedirect('unverified_email');

        clearStateCookie(req, res);

        // Subject is the identity boundary. Fail closed if corrupt persisted
        // state contains the same subject on more than one account.
        const subjectMatches = Array.from(users.values())
            .filter((candidate) => candidate.googleSub === googleSub);
        if (subjectMatches.length > 1) {
            return failRedirect('subject_conflict');
        }

        let [user] = subjectMatches;
        if (user) {
            if (user.banned) {
                logger.warn({ event: 'google_auth_banned', userId: user.id });
                return res.redirect('/account?auth=banned');
            }
            setAuthCookie(req, res, user);
            logger.info({ event: 'google_login', userId: user.id });
            return res.redirect('/account?auth=google');
        }

        // Email proves contactability, not ownership of an existing local
        // account. Linking is a separate, reauthenticated flow.
        const existingId = usersByEmail.get(email);
        user = existingId ? users.get(existingId) : null;
        if (user) {
            logger.warn({ event: 'google_link_required', userId: user.id });
            return res.redirect('/account?auth=link_required');
        }

        // New verified email: create a Google-only account with no password.
        const displayName = sanitizeUserText(profile.name || email.split('@')[0], DISPLAY_NAME_MAX_LENGTH)
            || email.split('@')[0].slice(0, DISPLAY_NAME_MAX_LENGTH);
        user = createUser({
            email,
            passwordHash: null,
            passwordEnabled: false,
            googleSub,
            displayName
        });
        users.set(user.id, user);
        usersByEmail.set(email, user.id);
        try {
            await persistUser(user);
        } catch (error) {
            users.delete(user.id);
            usersByEmail.delete(email);
            logger.error({ event: 'google_signup_persist_failed', error: error?.message });
            return res.status(503).json({ errorCode: 'PERSISTENCE_UNAVAILABLE' });
        }
        logger.info({ event: 'google_signup', userId: user.id });
        setAuthCookie(req, res, user);
        return res.redirect('/account?auth=google');
    });

    return router;
}

module.exports = { createGoogleAuthRouter };
