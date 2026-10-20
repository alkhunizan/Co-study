const http = require('node:http');

const port = Number(process.env.PORT || 0);
const failParticipants = process.env.REALTIMEKIT_FAIL_PARTICIPANT === '1';
const state = {
    meetings: [],
    participants: []
};

function sendJson(res, status, payload) {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
}

function readJson(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
            raw += chunk;
        });
        req.on('end', () => {
            if (!raw) {
                resolve({});
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, { ok: true });
        return;
    }
    if (req.method === 'GET' && url.pathname === '/__state') {
        sendJson(res, 200, state);
        return;
    }

    const meetingMatch = url.pathname.match(/\/accounts\/([^/]+)\/realtime\/kit\/([^/]+)\/meetings$/);
    if (req.method === 'POST' && meetingMatch) {
        const body = await readJson(req);
        const id = `meeting_${state.meetings.length + 1}`;
        state.meetings.push({ id, body });
        sendJson(res, 200, {
            success: true,
            result: { id }
        });
        return;
    }

    const participantMatch = url.pathname.match(/\/accounts\/([^/]+)\/realtime\/kit\/([^/]+)\/meetings\/([^/]+)\/participants$/);
    if (req.method === 'POST' && /\/active-session\/kick(?:-all)?$/.test(url.pathname)) {
        const body = await readJson(req);
        for (const participant of state.participants) {
            if (url.pathname.endsWith('/kick-all') || body.participant_ids?.includes(participant.id)) participant.kicked = true;
        }
        return sendJson(res, 200, { success: true });
    }
    const deleteMatch = url.pathname.match(/\/participants\/([^/]+)$/);
    if (req.method === 'DELETE' && deleteMatch) {
        const participant = state.participants.find((entry) => entry.id === decodeURIComponent(deleteMatch[1]));
        if (participant) participant.revoked = true;
        return sendJson(res, participant ? 200 : 404, { success: !!participant });
    }
    if (req.method === 'PATCH' && /\/meetings\/[^/]+$/.test(url.pathname)) {
        return sendJson(res, 200, { success: true });
    }
    if (req.method === 'POST' && participantMatch) {
        if (failParticipants) {
            sendJson(res, 502, {
                success: false,
                errors: [{ code: 'fake_failure', message: 'Fake participant failure' }]
            });
            return;
        }
        const body = await readJson(req);
        const id = `participant_${state.participants.length + 1}`;
        const meetingId = decodeURIComponent(participantMatch[3]);
        state.participants.push({ id, meetingId, body });
        if (process.env.REALTIMEKIT_PARTICIPANT_DELAY) {
            await new Promise((resolve) => setTimeout(resolve, Number(process.env.REALTIMEKIT_PARTICIPANT_DELAY)));
        }
        sendJson(res, 200, {
            success: true,
            result: {
                id,
                authToken: `auth_${id}`
            }
        });
        return;
    }

    sendJson(res, 404, { success: false, errors: [{ code: 'not_found' }] });
});

server.listen(port, '127.0.0.1', () => {
    const address = /** @type {import('node:net').AddressInfo} */ (server.address());
    console.log(JSON.stringify({ event: 'fake_realtimekit_ready', port: address.port }));
});
