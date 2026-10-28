const assert = require('node:assert/strict');
const test = require('node:test');

const { createRealtimeKitProvider } = require('../../services/video/realtimekit-provider');

function buildConfig(cloudflare = {}) {
    return {
        defaultPresetName: 'halastudy_student',
        cloudflare: {
            accountId: 'account-id',
            appId: 'app-id',
            apiToken: 'api-token',
            apiBaseUrl: 'http://127.0.0.1:9876/client/v4',
            webhookPublicKeyUrl: 'http://127.0.0.1:9876/.well-known/webhooks.json',
            ...cloudflare
        }
    };
}

function jsonResponse(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

function createFetchQueue(responses) {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        const response = responses.shift();
        if (!response) throw new Error(`Unexpected provider request: ${url}`);
        return typeof response === 'function' ? response(url, options) : response;
    };
    return { calls, fetchImpl };
}

function assertInvalidProviderResponse(error) {
    assert.equal(error.code, 'VIDEO_PROVIDER_INVALID_RESPONSE');
    assert.equal(error.status, 502);
    return true;
}

test('production accepts only the official HTTPS RealtimeKit endpoints', () => {
    const official = buildConfig({
        apiBaseUrl: 'https://api.cloudflare.com/client/v4',
        webhookPublicKeyUrl: 'https://api.realtime.cloudflare.com/.well-known/webhooks.json'
    });
    assert.doesNotThrow(() => createRealtimeKitProvider({
        config: official,
        runtimeEnvironment: 'production'
    }));

    assert.throws(
        () => createRealtimeKitProvider({
            config: buildConfig({
                apiBaseUrl: 'http://api.cloudflare.com/client/v4',
                webhookPublicKeyUrl: official.cloudflare.webhookPublicKeyUrl
            }),
            runtimeEnvironment: 'production'
        }),
        /official Cloudflare HTTPS endpoint/
    );
    assert.throws(
        () => createRealtimeKitProvider({
            config: buildConfig({
                apiBaseUrl: 'https://api.cloudflare.com.evil.example/client/v4',
                webhookPublicKeyUrl: official.cloudflare.webhookPublicKeyUrl
            }),
            runtimeEnvironment: 'production'
        }),
        /official Cloudflare HTTPS endpoint/
    );
    assert.throws(
        () => createRealtimeKitProvider({
            config: buildConfig({
                apiBaseUrl: official.cloudflare.apiBaseUrl,
                webhookPublicKeyUrl: 'https://api.realtime.cloudflare.com.evil.example/.well-known/webhooks.json'
            }),
            runtimeEnvironment: 'production'
        }),
        /official Cloudflare HTTPS endpoint/
    );

    assert.doesNotThrow(() => createRealtimeKitProvider({
        config: buildConfig(),
        runtimeEnvironment: 'test'
    }));
});

test('meeting and participant creation require documented success response shapes', async () => {
    const valid = createFetchQueue([
        jsonResponse({ success: true, data: { id: 'meeting-1' } }),
        jsonResponse({
            success: true,
            data: {
                id: 'participant-1',
                token: 'auth-token-1',
                custom_participant_id: 'video-session-1',
                preset_name: 'halastudy_student'
            }
        })
    ]);
    const provider = createRealtimeKitProvider({ config: buildConfig(), fetchImpl: valid.fetchImpl });
    assert.deepEqual(await provider.ensureRoomMeeting({ roomId: 'ROOM01', roomName: 'Room' }), {
        provider: 'realtimekit',
        meetingId: 'meeting-1',
        reused: false
    });
    assert.deepEqual(await provider.createParticipantToken({
        roomId: 'ROOM01',
        meetingId: 'meeting-1',
        userId: 'video-session-1',
        displayName: 'Student'
    }), {
        provider: 'realtimekit',
        roomId: 'ROOM01',
        meetingId: 'meeting-1',
        participantId: 'participant-1',
        authToken: 'auth-token-1',
        expiresAt: null
    });

    const malformedMeeting = createFetchQueue([
        jsonResponse({ success: true, data: {} })
    ]);
    await assert.rejects(
        createRealtimeKitProvider({ config: buildConfig(), fetchImpl: malformedMeeting.fetchImpl })
            .ensureRoomMeeting({ roomId: 'ROOM01' }),
        assertInvalidProviderResponse
    );

    const malformedParticipant = createFetchQueue([
        jsonResponse({ success: true, data: { id: 'participant-1' } })
    ]);
    await assert.rejects(
        createRealtimeKitProvider({ config: buildConfig(), fetchImpl: malformedParticipant.fetchImpl })
            .createParticipantToken({
                roomId: 'ROOM01',
                meetingId: 'meeting-1',
                userId: 'video-session-1',
                displayName: 'Student'
            }),
        assertInvalidProviderResponse
    );
});

test('malformed and oversized successful provider bodies fail closed', async () => {
    const invalidJson = createFetchQueue([
        new Response('{"success":true', {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        })
    ]);
    await assert.rejects(
        createRealtimeKitProvider({ config: buildConfig(), fetchImpl: invalidJson.fetchImpl })
            .ensureRoomMeeting({ roomId: 'ROOM01' }),
        assertInvalidProviderResponse
    );

    const oversized = createFetchQueue([
        new Response(JSON.stringify({ success: true, data: { id: 'x'.repeat(1024 * 1024) } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        })
    ]);
    await assert.rejects(
        createRealtimeKitProvider({ config: buildConfig(), fetchImpl: oversized.fetchImpl })
            .ensureRoomMeeting({ roomId: 'ROOM01' }),
        (error) => {
            const providerError = /** @type {any} */ (error);
            assert.equal(providerError.code, 'VIDEO_PROVIDER_RESPONSE_TOO_LARGE');
            assert.equal(providerError.status, 502);
            return true;
        }
    );
});

test('active-session reconciliation validates session, participant, and paging data', async () => {
    const queue = createFetchQueue([
        jsonResponse({
            success: true,
            data: {
                id: 'session-1',
                associated_id: 'meeting-1',
                status: 'LIVE',
                live_participants: 1
            }
        }),
        jsonResponse({
            success: true,
            data: {
                paging: { start_offset: 0, end_offset: 1, total_count: 1 },
                participants: [{
                    id: 'peer-1',
                    custom_participant_id: 'video-session-1',
                    display_name: 'Student',
                    joined_at: '2026-07-15T06:00:00.000Z',
                    left_at: null
                }]
            }
        })
    ]);
    const result = await createRealtimeKitProvider({ config: buildConfig(), fetchImpl: queue.fetchImpl })
        .getActiveMeetingSession({ meetingId: 'meeting-1' });
    assert.deepEqual(result, {
        active: true,
        meetingId: 'meeting-1',
        sessionId: 'session-1',
        liveParticipants: 1,
        participants: [{
            customParticipantId: 'video-session-1',
            providerPeerId: 'peer-1',
            displayName: 'Student',
            joinedAt: Date.parse('2026-07-15T06:00:00.000Z')
        }]
    });

    const malformed = createFetchQueue([
        jsonResponse({
            success: true,
            data: {
                id: 'session-1',
                associated_id: 'meeting-1',
                status: 'LIVE'
            }
        })
    ]);
    await assert.rejects(
        createRealtimeKitProvider({ config: buildConfig(), fetchImpl: malformed.fetchImpl })
            .getActiveMeetingSession({ meetingId: 'meeting-1' }),
        assertInvalidProviderResponse
    );
});

test('only a provider 404 is treated as an absent active session', async () => {
    const absent = createFetchQueue([
        jsonResponse({ success: false, error: { code: 404, message: 'No active session' } }, 404)
    ]);
    assert.deepEqual(
        await createRealtimeKitProvider({ config: buildConfig(), fetchImpl: absent.fetchImpl })
            .getActiveMeetingSession({ meetingId: 'meeting-1' }),
        { active: false, meetingId: 'meeting-1', sessionId: null, participants: [] }
    );

    const emptySuccess = createFetchQueue([
        jsonResponse({ success: true, data: {} })
    ]);
    await assert.rejects(
        createRealtimeKitProvider({ config: buildConfig(), fetchImpl: emptySuccess.fetchImpl })
            .getActiveMeetingSession({ meetingId: 'meeting-1' }),
        assertInvalidProviderResponse
    );

    const malformedNotFound = createFetchQueue([
        jsonResponse({ success: true, data: {} }, 404)
    ]);
    await assert.rejects(
        createRealtimeKitProvider({ config: buildConfig(), fetchImpl: malformedNotFound.fetchImpl })
            .getActiveMeetingSession({ meetingId: 'meeting-1' }),
        (error) => {
            const providerError = /** @type {any} */ (error);
            assert.equal(providerError.code, 'VIDEO_PROVIDER_UNAVAILABLE');
            assert.equal(providerError.status, 404);
            return true;
        }
    );
});

test('participant pagination rejects truncation and totals above its bounded pass', async () => {
    const activeSession = () => jsonResponse({
        success: true,
        data: {
            id: 'session-1',
            associated_id: 'meeting-1',
            status: 'LIVE',
            live_participants: 1
        }
    });
    const records = Array.from({ length: 100 }, (_, index) => ({
        id: `peer-${index}`,
        custom_participant_id: `video-session-${index}`,
        joined_at: '2026-07-15T06:00:00.000Z',
        left_at: null
    }));
    const truncated = createFetchQueue([
        activeSession(),
        jsonResponse({
            success: true,
            data: {
                paging: { start_offset: 0, end_offset: 100, total_count: 101 },
                participants: records
            }
        }),
        jsonResponse({
            success: true,
            data: {
                paging: { start_offset: 100, end_offset: 100, total_count: 101 },
                participants: []
            }
        })
    ]);
    await assert.rejects(
        createRealtimeKitProvider({ config: buildConfig(), fetchImpl: truncated.fetchImpl })
            .getActiveMeetingSession({ meetingId: 'meeting-1' }),
        assertInvalidProviderResponse
    );
    assert.equal(truncated.calls.length, 3);

    const tooMany = createFetchQueue([
        activeSession(),
        jsonResponse({
            success: true,
            data: {
                paging: { start_offset: 0, end_offset: 0, total_count: 10_001 },
                participants: []
            }
        })
    ]);
    await assert.rejects(
        createRealtimeKitProvider({ config: buildConfig(), fetchImpl: tooMany.fetchImpl })
            .getActiveMeetingSession({ meetingId: 'meeting-1' }),
        assertInvalidProviderResponse
    );
    assert.equal(tooMany.calls.length, 2);
});

test('close disables the meeting before kicking all active participants', async () => {
    const queue = createFetchQueue([
        jsonResponse({ success: true, data: { id: 'meeting-1', status: 'INACTIVE' } }),
        jsonResponse({
            success: true,
            data: { action: 'kick-all', kicked_participants_count: 2 }
        })
    ]);
    const provider = createRealtimeKitProvider({ config: buildConfig(), fetchImpl: queue.fetchImpl });
    assert.deepEqual(await provider.closeRoomMeeting({ meetingId: 'meeting-1' }), {
        ok: true,
        disabled: true,
        kickedParticipants: 2,
        noActiveSession: false
    });
    assert.equal(queue.calls.length, 2);
    assert.equal(queue.calls[0].options.method, 'PATCH');
    assert.deepEqual(JSON.parse(queue.calls[0].options.body), { status: 'INACTIVE' });
    assert.match(queue.calls[1].url, /\/active-session\/kick-all$/);
    assert.equal(queue.calls[1].options.method, 'POST');
});

test('close and participant cleanup operations are separately idempotent', async () => {
    const queue = createFetchQueue([
        jsonResponse({ success: true, data: { id: 'meeting-1', status: 'INACTIVE' } }),
        jsonResponse({ success: false, error: { code: 404, message: 'No active session' } }, 404),
        jsonResponse({
            success: true,
            data: {
                created_at: '2026-07-15T06:00:00.000Z',
                custom_participant_id: 'video-session-1',
                preset_id: 'preset-1',
                updated_at: '2026-07-15T06:01:00.000Z'
            }
        }),
        jsonResponse({ success: false, error: { code: 404, message: 'Already absent' } }, 404)
    ]);
    const provider = createRealtimeKitProvider({ config: buildConfig(), fetchImpl: queue.fetchImpl });
    assert.deepEqual(await provider.closeRoomMeeting({ meetingId: 'meeting-1' }), {
        ok: true,
        disabled: true,
        kickedParticipants: 0,
        noActiveSession: true
    });
    assert.deepEqual(await provider.deleteParticipant({
        meetingId: 'meeting-1',
        participantId: 'participant-1'
    }), { ok: true, alreadyAbsent: false });
    assert.deepEqual(await provider.deleteParticipant({
        meetingId: 'meeting-1',
        participantId: 'participant-1'
    }), { ok: true, alreadyAbsent: true });
    assert.equal(queue.calls[2].options.method, 'DELETE');
    assert.match(queue.calls[2].url, /\/meetings\/meeting-1\/participants\/participant-1$/);
});

test('cleanup operations reject malformed successful responses', async () => {
    const malformedDisable = createFetchQueue([
        jsonResponse({ success: true, data: { id: 'meeting-1' } })
    ]);
    await assert.rejects(
        createRealtimeKitProvider({ config: buildConfig(), fetchImpl: malformedDisable.fetchImpl })
            .disableMeeting({ meetingId: 'meeting-1' }),
        assertInvalidProviderResponse
    );

    const malformedKickAll = createFetchQueue([
        jsonResponse({ success: true, data: { action: 'kick-all' } })
    ]);
    await assert.rejects(
        createRealtimeKitProvider({ config: buildConfig(), fetchImpl: malformedKickAll.fetchImpl })
            .kickAllParticipants({ meetingId: 'meeting-1' }),
        assertInvalidProviderResponse
    );

    const malformedDelete = createFetchQueue([
        jsonResponse({ success: true, data: {} })
    ]);
    await assert.rejects(
        createRealtimeKitProvider({ config: buildConfig(), fetchImpl: malformedDelete.fetchImpl })
            .deleteParticipant({ meetingId: 'meeting-1', participantId: 'participant-1' }),
        assertInvalidProviderResponse
    );
});
