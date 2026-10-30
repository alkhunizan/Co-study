const ALLOWED_LISTEN_HOSTS = new Set(['127.0.0.1', '0.0.0.0', '::1', '::']);

function resolveListenHost(env = {}) {
    const configured = typeof env.HOST === 'string' ? env.HOST.trim() : '';
    const host = configured || (env.NODE_ENV === 'production' ? '127.0.0.1' : '0.0.0.0');
    if (!ALLOWED_LISTEN_HOSTS.has(host)) {
        throw new Error('HOST must be an explicit loopback or wildcard IP address.');
    }
    return host;
}

module.exports = {
    resolveListenHost
};
