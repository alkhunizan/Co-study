// Socket.IO does not await listeners. Keep malformed arguments and rejected
// asynchronous handlers inside the event boundary rather than the process.
function onClientEvent(socket, event, handler, logger) {
    socket.on(event, (...args) => {
        const callback = typeof args.at(-1) === 'function' ? args.pop() : null;
        let replied = false;
        const ack = (result) => {
            if (replied) return;
            replied = true;
            if (callback) callback(result);
        };
        const payload = args.length === 0 ? {} : args[0];
        if (args.length > 1 || payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
            ack({ ok: false, errorCode: 'PAYLOAD_INVALID' });
            return;
        }
        // Invoke synchronously to preserve the ordering of synchronous events.
        try {
            Promise.resolve(handler(payload, ack)).catch(failed);
        } catch {
            failed();
        }
        function failed() {
            logger.error({ event: 'socket_handler_failed', socketEvent: event });
            ack({ ok: false, errorCode: 'SERVICE_UNAVAILABLE' });
        }
    });
}

module.exports = { onClientEvent };
