// Cookie-jar helpers for auth-aware integration tests.

/** Collapses Set-Cookie header(s) into a replayable `Cookie:` header value. */
function extractCookies(setCookieHeader) {
    if (!setCookieHeader) return '';
    const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    return headers
        .map((header) => header.split(';')[0].trim())
        .filter(Boolean)
        .join('; ');
}

/** Signs up a fresh user over HTTP; returns the public user + cookie header. */
async function signupUser(server, options = {}) {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const body = {
        email: options.email || `student-${unique}@example.com`,
        password: options.password || 'hunter2hunter2',
        displayName: options.displayName || 'Student'
    };
    const response = await server.request('/api/auth/signup', { method: 'POST', body });
    if (response.status !== 200) {
        throw new Error(`Signup failed in test helper: ${response.status} ${JSON.stringify(response.body)}`);
    }
    return {
        user: response.body.user,
        credentials: body,
        cookie: extractCookies(response.headers['set-cookie'])
    };
}

module.exports = {
    extractCookies,
    signupUser
};
