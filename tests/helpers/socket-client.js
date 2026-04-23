const { io } = require('socket.io-client');

function connectSocket(baseUrl, options = {}) {
    const socket = io(baseUrl, {
        auth: options.auth || (options.clientId ? { clientId: options.clientId } : {}),
        extraHeaders: options.extraHeaders || {},
        forceNew: true,
        reconnection: false,
        rejectUnauthorized: false,
        transports: ['websocket']
    });

    return new Promise((resolve, reject) => {
        const cleanup = () => {
            socket.off('connect', handleConnect);
            socket.off('connect_error', handleError);
        };

        const handleConnect = () => {
            cleanup();
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
            resolve(response);
        });
    });
}

async function closeSocket(socket) {
    if (!socket) return;
    socket.removeAllListeners();
    socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 25));
}

module.exports = {
    closeSocket,
    connectSocket,
    emitAck
};
