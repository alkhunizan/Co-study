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
const { normalizeEmail, sanitizeUserText } = require('./index');
const {
    GOOGLE_DELETE_GRANT_COOKIE,
    OAUTH_STATE_MAX_AGE_MS,
    createOAuthSecurity,
    normalizeLocalNext
} = require('./oauth-security');
const { verifyPassword } = require('./password');
const { createUser } = require('../../user-store');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const STATE_COOKIE = 'hala_oauth';
const LINK_PROOF_COOKIE = 'hala_google_link';
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
        runUserMutation,
        runGoogleSubjectMutation,
        sessionSecret,
        logger = console,
        fetchImpl = globalThis.fetch
    } = deps;

    const router = express.Router();
    if (!config.enabled) {
        return router; // no handlers — all /auth/google/* fall through to 404
    }
    if (typeof runUserMutation !== 'function') {
        throw new TypeError('createGoogleAuthRouter requires runUserMutation.');
    }
    if (typeof runGoogleSubjectMutation !== 'function') {
        throw new TypeError('createGoogleAuthRouter requires runGoogleSubjectMutation.');
    }
    const oauthSecurity = deps.oauthSecurity || createOAuthSecurity({ secret: sessionSecret });

    function setStateCookie(req, res, nonce) {
        const parts = [
            `${STATE_COOKIE}=${nonce}`,
            'Path=/auth/google',
            'HttpOnly',
            'SameSite=Lax',
            `Max-Age=${Math.floor(OAUTH_STATE_MAX_AGE_MS / 1000)}`
        ];
        if (req.secure) parts.push('Secure');
        appendSetCookie(res, parts.join('; '));
    }

    function clearStateCookie(req, res) {
        const parts = [`${STATE_COOKIE}=`, 'Path=/auth/google', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
        if (req.secure) parts.push('Secure');
        appendSetCookie(res, parts.join('; '));
    }

    function setLinkProofCookie(req, res, token) {
        const parts = [
            `${LINK_PROOF_COOKIE}=${token}`,
            'Path=/auth/google',
            'HttpOnly',
            'SameSite=Lax',
            `Max-Age=${Math.floor(OAUTH_STATE_MAX_AGE_MS / 1000)}`
        ];
        if (req.secure) parts.push('Secure');
        appendSetCookie(res, parts.join('; '));
    }

    function clearLinkProofCookie(req, res) {
        const parts = [
            `${LINK_PROOF_COOKIE}=`,
            'Path=/auth/google',
            'HttpOnly',
            'SameSite=Lax',
            'Max-Age=0'
        ];
        if (req.secure) parts.push('Secure');
        appendSetCookie(res, parts.join('; '));
    }

    function setDeletionGrantCookie(req, res, token) {
        const parts = [
            `${GOOGLE_DELETE_GRANT_COOKIE}=${token}`,
            'Path=/api/me',
            'HttpOnly',
            'SameSite=Lax',
            `Max-Age=${Math.floor(OAUTH_STATE_MAX_AGE_MS / 1000)}`
        ];
        if (req.secure) parts.push('Secure');
        appendSetCookie(res, parts.join('; '));
    }

    // Linking starts with a password recheck. The short-lived HttpOnly proof
    // is consumed by the subsequent browser GET before any Google redirect.
    router.post('/api/auth/google/link', async (req, res) => {
        const requestIp = getRequestIp(req);
        if (!applyHttpRateLimit(req, res, rateLimiters.authLogin, requestIp)) return;
        if (!req.user) {
            res.status(401).json({ errorCode: 'AUTH_REQUIRED' });
            return;
        }
        if (req.user.passwordEnabled === false || !req.user.passwordHash) {
            res.status(409).json({ errorCode: 'PASSWORD_AUTH_REQUIRED' });
            return;
        }
        if (req.user.googleSub) {
            res.status(409).json({ errorCode: 'GOOGLE_ALREADY_LINKED' });
            return;
        }
        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        if (!await verifyPassword(password, req.user.passwordHash)) {
            res.status(401).json({ errorCode: 'INVALID_CREDENTIALS' });
            return;
        }

        const next = normalizeLocalNext(req.body?.next, '/account?auth=google_linked');
        const proof = oauthSecurity.issueProof({ purpose: 'link_preauth', userId: req.user.id });
        setLinkProofCookie(req, res, proof);
        const params = new URLSearchParams({ intent: 'link', next });
        res.json({ ok: true, redirectTo: `/auth/google?${params.toString()}` });
    });

    // Step 1 — redirect the browser to Google's consent screen.
    router.get('/auth/google', (req, res) => {
        const requestIp = getRequestIp(req);
        if (!applyHttpRateLimit(req, res, rateLimiters.authLogin, requestIp)) return;

        const intent = req.query.intent === undefined ? 'signin' : req.query.intent;
        if (intent !== 'signin' && intent !== 'link' && intent !== 'reauth_delete') {
            res.status(400).json({ errorCode: 'OAUTH_INTENT_INVALID' });
            return;
        }
        let userId = null;
        if (intent === 'link') {
            const proof = parseCookies(req.headers.cookie || '')[LINK_PROOF_COOKIE];
            clearLinkProofCookie(req, res);
            if (!req.user || !oauthSecurity.consumeProof({
                purpose: 'link_preauth',
                token: proof,
                userId: req.user.id
            })) {
                res.redirect('/account?auth=reauth_required');
                return;
            }
            if (req.user.passwordEnabled === false || !req.user.passwordHash || req.user.googleSub) {
                res.redirect('/account?auth=link_unavailable');
                return;
            }
            userId = req.user.id;
        } else if (intent === 'reauth_delete') {
            if (!req.user?.googleSub) {
                res.redirect('/account?auth=reauth_required');
                return;
            }
            userId = req.user.id;
        }
        const fallbackByIntent = {
            signin: '/account?auth=google',
            link: '/account?auth=google_linked',
            reauth_delete: '/account?auth=delete_granted'
        };
        const fallback = fallbackByIntent[intent];
        const next = normalizeLocalNext(req.query.next, fallback);
        const state = oauthSecurity.issueState({ intent, next, userId });
        setStateCookie(req, res, state.nonce);
        const params = new URLSearchParams({
            client_id: config.clientId,
            redirect_uri: config.redirectUri,
            response_type: 'code',
            scope: 'openid email profile',
            state: state.token,
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

        // The signed state is purpose-bound and must match a browser-only,
        // process-issued nonce. Acceptance atomically consumes it.
        const cookies = parseCookies(req.headers.cookie || '');
        const state = oauthSecurity.consumeState({
            token: typeof req.query.state === 'string' ? req.query.state : '',
            nonce: cookies[STATE_COOKIE]
        });
        if (!state) {
            return failRedirect('state_mismatch');
        }
        if (state.intent !== 'signin' && (!req.user || req.user.id !== state.userId)) {
            return failRedirect('identity_mismatch');
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
            logger.error({ event: 'google_auth_error', error: error?.message });
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

        const subjectMatches = Array.from(users.values())
            .filter((candidate) => candidate.googleSub === googleSub);

        if (state.intent === 'reauth_delete') {
            const user = req.user;
            if (user.googleSub !== googleSub
                || subjectMatches.length !== 1
                || subjectMatches[0].id !== user.id) {
                logger.warn({ event: 'google_delete_reauth_mismatch', userId: user.id });
                return res.redirect('/account?auth=google_reauth_failed');
            }
            const grant = oauthSecurity.issueProof({ purpose: 'delete_grant', userId: user.id });
            setDeletionGrantCookie(req, res, grant);
            logger.info({ event: 'google_delete_reauthenticated', userId: user.id });
            return res.redirect(state.next);
        }

        if (state.intent === 'link') {
            const user = req.user;
            try {
                return await runUserMutation(user, async () => {
                    if (user.passwordEnabled === false || !user.passwordHash || user.googleSub) {
                        return failRedirect('link_unavailable');
                    }
                    if (normalizeEmail(user.email) !== email) {
                        logger.warn({ event: 'google_link_email_mismatch', userId: user.id });
                        return res.redirect('/account?auth=link_email_mismatch');
                    }
                    return runGoogleSubjectMutation(googleSub, async () => {
                        const currentSubjectMatches = Array.from(users.values())
                            .filter((candidate) => candidate.googleSub === googleSub);
                        if (currentSubjectMatches.length > 0) {
                            logger.warn({ event: 'google_link_subject_in_use', userId: user.id });
                            return res.redirect('/account?auth=google_subject_in_use');
                        }

                        const previousGoogleSub = user.googleSub;
                        user.googleSub = googleSub;
                        try {
                            await persistUser(user);
                        } catch (error) {
                            user.googleSub = previousGoogleSub;
                            throw error;
                        }
                        logger.info({ event: 'google_linked', userId: user.id });
                        return res.redirect(state.next);
                    });
                });
            } catch (error) {
                if (error?.code === 'AUTH_REQUIRED' || error?.code === 'ACCOUNT_TOMBSTONED') {
                    return failRedirect('identity_mismatch');
                }
                logger.error({ event: 'google_link_persist_failed', userId: user.id, error: error?.message });
                return res.status(503).json({ errorCode: 'PERSISTENCE_UNAVAILABLE' });
            }
        }

        // Subject is the identity boundary. Fail closed if corrupt persisted
        // state contains the same subject on more than one account.
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
            return res.redirect(state.next);
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
        return res.redirect(state.next);
    });

    return router;
}

module.exports = { createGoogleAuthRouter };
