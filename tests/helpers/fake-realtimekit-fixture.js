const http = require('node:http');
const crypto = require('node:crypto');

const port = Number(process.env.PORT || 0);
const failParticipants = process.env.REALTIMEKIT_FAIL_PARTICIPANT === '1';
const failReconciliation = process.env.REALTIMEKIT_FAIL_RECONCILIATION === '1';
const failClose = process.env.REALTIMEKIT_FAIL_CLOSE === '1';
const participantDelayMs = Number.parseInt(process.env.REALTIMEKIT_PARTICIPANT_DELAY_MS || '0', 10);
const closeDelayMs = Number.parseInt(process.env.REALTIMEKIT_CLOSE_DELAY_MS || '0', 10);
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
let initialActiveSessions = {};
try {
    initialActiveSessions = JSON.parse(process.env.REALTIMEKIT_INITIAL_ACTIVE_SESSIONS_JSON || '{}');
} catch (_error) {
    initialActiveSessions = {};
}
const state = {
    meetings: [],
    disabledMeetings: [],
    kickAllMeetings: [],
    exactKicks: [],
    deletedParticipants: [],
    // Retained during the migration so existing integration assertions keep
    // working while new tests use the more precise disabledMeetings field.
    closedMeetings: [],
    participants: [],
    activeSessions: initialActiveSessions
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

function applyProviderEvent(event) {
    const meetingId = event?.meeting?.id;
    if (!meetingId) return;
    if (event.event === 'meeting.ended') {
        delete state.activeSessions[meetingId];
        return;
    }
    const customParticipantId = event?.participant?.customParticipantId;
    if (!customParticipantId) return;
    const active = state.activeSessions[meetingId] || {
        id: event.meeting?.sessionId || `session_${Object.keys(state.activeSessions).length + 1}`,
        status: 'LIVE',
        participants: []
    };
    state.activeSessions[meetingId] = active;
    const eventPeerId = event?.participant?.peerId;
    const existing = active.participants.find((participant) => (
        eventPeerId
            ? participant.id === eventPeerId
            : participant.custom_participant_id === customParticipantId && !participant.left_at
    ));
    if (event.event === 'meeting.participantJoined') {
        const participant = existing || {
            id: eventPeerId || `peer_${active.participants.length + 1}`,
            custom_participant_id: customParticipantId,
            display_name: event.participant?.userDisplayName || '',
            joined_at: event.participant?.joinedAt || new Date().toISOString(),
            left_at: null
        };
        participant.left_at = null;
        if (!existing) active.participants.push(participant);
    } else if (event.event === 'meeting.participantLeft' && existing) {
        existing.left_at = event.participant?.leftAt || new Date().toISOString();
    }
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
    if (req.method === 'GET' && url.pathname === '/.well-known/webhooks.json') {
        sendJson(res, 200, {
            success: true,
            data: { publicKey: publicKey.export({ type: 'spki', format: 'pem' }) }
        });
        return;
    }
    if (req.method === 'POST' && url.pathname === '/__sign') {
        const body = await readJson(req);
        const raw = typeof body.raw === 'string' ? body.raw : '';
        if (!raw) {
            sendJson(res, 400, { error: 'raw is required' });
            return;
        }
        let event;
        try {
            event = JSON.parse(raw);
        } catch (_error) {
            sendJson(res, 400, { error: 'raw must be JSON' });
            return;
        }
        applyProviderEvent(event);
        sendJson(res, 200, {
            signature: crypto.sign('RSA-SHA256', Buffer.from(raw), privateKey).toString('base64'),
            uuid: body.uuid || crypto.randomUUID()
        });
        return;
    }

    const meetingMatch = url.pathname.match(/\/accounts\/([^/]+)\/realtime\/kit\/([^/]+)\/meetings$/);
    if (req.method === 'POST' && meetingMatch) {
        const body = await readJson(req);
        const id = `meeting_${state.meetings.length + 1}`;
        state.meetings.push({ id, body });
        sendJson(res, 200, {
            success: true,
            data: { id }
        });
        return;
    }

    const participantMatch = url.pathname.match(/\/accounts\/([^/]+)\/realtime\/kit\/([^/]+)\/meetings\/([^/]+)\/participants$/);
    if (req.method === 'POST' && participantMatch) {
        if (failParticipants) {
            sendJson(res, 502, {
                success: false,
                errors: [{ code: 'fake_failure', message: 'Fake participant failure' }]
            });
            return;
        }
        if (participantDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, participantDelayMs));
        }
        const body = await readJson(req);
        const id = `participant_${state.participants.length + 1}`;
        const meetingId = decodeURIComponent(participantMatch[3]);
        const createdAt = new Date().toISOString();
        state.participants.push({ id, meetingId, body, createdAt, deletedAt: null });
        sendJson(res, 200, {
            success: true,
            data: {
                id,
                token: `auth_${id}`,
                created_at: createdAt,
                updated_at: createdAt,
                custom_participant_id: body.custom_participant_id,
                preset_name: body.preset_name,
                name: body.name || ''
            }
        });
        return;
    }

    const deleteParticipantMatch = url.pathname.match(
        /\/accounts\/([^/]+)\/realtime\/kit\/([^/]+)\/meetings\/([^/]+)\/participants\/([^/]+)$/
    );
    if (req.method === 'DELETE' && deleteParticipantMatch) {
        const meetingId = decodeURIComponent(deleteParticipantMatch[3]);
        const participantId = decodeURIComponent(deleteParticipantMatch[4]);
        const participant = state.participants.find((candidate) => (
            candidate.id === participantId && candidate.meetingId === meetingId
        ));
        if (!participant || participant.deletedAt) {
            sendJson(res, 404, {
                success: false,
                error: { code: 404, message: 'Participant not found' }
            });
            return;
        }
        const deletedAt = new Date().toISOString();
        participant.deletedAt = deletedAt;
        state.deletedParticipants.push({ meetingId, participantId, deletedAt });
        sendJson(res, 200, {
            success: true,
            data: {
                created_at: participant.createdAt,
                custom_participant_id: participant.body.custom_participant_id,
                preset_id: participant.body.preset_name,
                updated_at: deletedAt
            }
        });
        return;
    }

    const activeMatch = url.pathname.match(/\/accounts\/([^/]+)\/realtime\/kit\/([^/]+)\/meetings\/([^/]+)\/active-session$/);
    if (req.method === 'GET' && activeMatch) {
        if (failReconciliation) {
            sendJson(res, 502, { success: false, errors: [{ code: 'fake_reconciliation_failure' }] });
            return;
        }
        const meetingId = decodeURIComponent(activeMatch[3]);
        const active = state.activeSessions[meetingId];
        if (!active) {
            sendJson(res, 404, { success: false, error: { code: 404, message: 'No active session' } });
            return;
        }
        sendJson(res, 200, {
            success: true,
            data: {
                id: active.id,
                associated_id: meetingId,
                status: 'LIVE',
                live_participants: active.participants.filter((participant) => !participant.left_at).length
            }
        });
        return;
    }

    const sessionParticipantsMatch = url.pathname.match(/\/accounts\/([^/]+)\/realtime\/kit\/([^/]+)\/sessions\/([^/]+)\/participants$/);
    if (req.method === 'GET' && sessionParticipantsMatch) {
        const sessionId = decodeURIComponent(sessionParticipantsMatch[3]);
        const active = Object.values(state.activeSessions).find((session) => session.id === sessionId);
        const participants = active?.participants || [];
        const page = Number.parseInt(url.searchParams.get('page_no') || '1', 10);
        const perPage = Number.parseInt(url.searchParams.get('per_page') || '100', 10);
        const start = Math.max(0, page - 1) * perPage;
        sendJson(res, 200, {
            success: true,
            data: {
                participants: participants.slice(start, start + perPage),
                paging: {
                    start_offset: Math.min(start, participants.length),
                    end_offset: Math.min(start + perPage, participants.length),
                    total_count: participants.length
                }
            }
        });
        return;
    }

    const kickMatch = url.pathname.match(/\/accounts\/([^/]+)\/realtime\/kit\/([^/]+)\/meetings\/([^/]+)\/active-session\/kick$/);
    if (req.method === 'POST' && kickMatch) {
        const meetingId = decodeURIComponent(kickMatch[3]);
        const body = await readJson(req);
        const requestedIds = Array.isArray(body.custom_participant_ids) ? body.custom_participant_ids : [];
        const active = state.activeSessions[meetingId];
        const kickedParticipants = [];
        active?.participants.forEach((participant) => {
            if (requestedIds.includes(participant.custom_participant_id) && !participant.left_at) {
                participant.left_at = new Date().toISOString();
                kickedParticipants.push({
                    id: participant.id,
                    created_at: participant.joined_at,
                    updated_at: participant.left_at,
                    name: participant.display_name || ''
                });
            }
        });
        state.exactKicks.push({ meetingId, customParticipantIds: requestedIds });
        sendJson(res, 200, {
            success: true,
            data: { action: 'kick', participants: kickedParticipants }
        });
        return;
    }

    const kickAllMatch = url.pathname.match(
        /\/accounts\/([^/]+)\/realtime\/kit\/([^/]+)\/meetings\/([^/]+)\/active-session\/kick-all$/
    );
    if (req.method === 'POST' && kickAllMatch) {
        const meetingId = decodeURIComponent(kickAllMatch[3]);
        state.kickAllMeetings.push(meetingId);
        const active = state.activeSessions[meetingId];
        if (!active) {
            sendJson(res, 404, {
                success: false,
                error: { code: 404, message: 'No active session' }
            });
            return;
        }
        let kickedParticipantsCount = 0;
        active.participants.forEach((participant) => {
            if (participant.left_at) return;
            participant.left_at = new Date().toISOString();
            kickedParticipantsCount += 1;
        });
        sendJson(res, 200, {
            success: true,
            data: {
                action: 'kick-all',
                kicked_participants_count: kickedParticipantsCount
            }
        });
        return;
    }

    const closeMeetingMatch = url.pathname.match(/\/accounts\/([^/]+)\/realtime\/kit\/([^/]+)\/meetings\/([^/]+)$/);
    if (req.method === 'PATCH' && closeMeetingMatch) {
        if (closeDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, closeDelayMs));
        }
        if (failClose) {
            sendJson(res, 502, { success: false, errors: [{ code: 'fake_close_failure' }] });
            return;
        }
        const meetingId = decodeURIComponent(closeMeetingMatch[3]);
        const body = await readJson(req);
        if (body.status !== 'INACTIVE') {
            sendJson(res, 400, {
                success: false,
                errors: [{ code: 'invalid_status', message: 'Expected INACTIVE status' }]
            });
            return;
        }
        state.disabledMeetings.push(meetingId);
        state.closedMeetings.push(meetingId);
        sendJson(res, 200, { success: true, data: { id: meetingId, status: 'INACTIVE' } });
        return;
    }

    sendJson(res, 404, { success: false, errors: [{ code: 'not_found' }] });
});

server.listen(port, '127.0.0.1', () => {
    const address = /** @type {import('node:net').AddressInfo} */ (server.address());
    console.log(JSON.stringify({ event: 'fake_realtimekit_ready', port: address.port }));
});
