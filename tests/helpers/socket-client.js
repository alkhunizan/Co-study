const { io } = require('socket.io-client');

const membershipCookies = new Map();

function headerValue(headers, name) {
    const key = Object.keys(headers || {}).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
    return key ? headers[key] : '';
}

async function createAnonymousCookie(baseUrl) {
    const response = await fetch(new URL('/api/health', baseUrl));
    const setCookie = response.headers.get('set-cookie') || '';
    const match = setCookie.match(/(?:^|,\s*)(coStudySessionId=[^;]+)/);
    if (!match) throw new Error('Test server did not issue an anonymous session cookie.');
    return match[1];
}

async function connectSocket(baseUrl, options = {}) {
    const extraHeaders = { ...(options.extraHeaders || {}) };
    let cookie = headerValue(extraHeaders, 'cookie');
    if (!cookie) {
        cookie = await createAnonymousCookie(baseUrl);
        extraHeaders.Cookie = cookie;
    }
    const socket = io(baseUrl, {
        auth: options.auth || (options.clientId ? { clientId: options.clientId } : {}),
        extraHeaders,
        forceNew: true,
        reconnection: false,
        rejectUnauthorized: false,
        transports: ['websocket']
    });
    // Lets callers attach listeners for events the server emits on connect.
    options.onCreate?.(socket);

    return new Promise((resolve, reject) => {
        const cleanup = () => {
            socket.off('connect', handleConnect);
            socket.off('connect_error', handleError);
        };

        const handleConnect = () => {
            cleanup();
            /** @type {any} */ (socket).sessionCookie = cookie;
            resolve(socket);
        };

        const handleError = (error) => {
            cleanup();
            reject(error);
        };

        socket.once('connect', handleConnect);
        socket.once('connect_error', handleError);
    });
}

function emitAck(socket, eventName, payload = {}, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`Timed out waiting for ${eventName} ack.`));
        }, timeoutMs);

        socket.emit(eventName, payload, (response = {}) => {
            clearTimeout(timeoutId);
            const sessionCookie = /** @type {any} */ (socket).sessionCookie;
            if (typeof response.membershipToken === 'string' && sessionCookie) {
                membershipCookies.set(response.membershipToken, sessionCookie);
            }
            resolve(response);
        });
    });
}

function cookieForMembershipToken(token) {
    return typeof token === 'string' ? membershipCookies.get(token) || '' : '';
}

async function closeSocket(socket) {
    if (!socket) return;
    socket.removeAllListeners();
    socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 25));
}

module.exports = {
    closeSocket,
    cookieForMembershipToken,
    connectSocket,
    emitAck
};
