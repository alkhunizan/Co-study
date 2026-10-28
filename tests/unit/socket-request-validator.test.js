const assert = require('node:assert/strict');
const test = require('node:test');

const {
    SOCKET_REQUEST_EVENTS,
    validateSocketRequest
} = require('../../services/socket/socket-request-validator');

const validPayloads = {
    'create-room': {
        roomName: 'R'.repeat(48),
        password: 'p'.repeat(64),
        requirePassword: true,
        mediaMode: 'mesh',
        schedule: {
            title: 'T'.repeat(48),
            startDate: '2099-12-30',
            startTime: '23:59',
            endDate: '2099-12-31',
            cadence: 'daily',
            timezone: 'Asia/Riyadh',
            focusMinutes: '240',
            breakMinutes: 240,
            boardGoalTemplate: 'G'.repeat(80)
        }
    },
    'join-room': {
        roomId: 'R'.repeat(64),
        username: 'ط'.repeat(20),
        clientId: 'c'.repeat(64),
        password: 'p'.repeat(64)
    },
    'send-message': {
        roomId: 'R'.repeat(64),
        text: 'm'.repeat(500)
    },
    'board-set-goal': { goal: 'g'.repeat(80) },
    'board-add-task': { text: 't'.repeat(500), priority: 3 },
    'board-toggle-task': { taskId: 't'.repeat(128), done: true },
    'board-delete-task': { taskId: 't'.repeat(128) },
    'board-reorder-tasks': {
        taskIds: Array.from({ length: 100 }, (_, index) => `task-${index}`)
    },
    'camera-status': { camera: true },
    'rtc-offer': {
        targetId: 's'.repeat(128),
        sdp: { type: 'offer', sdp: 'v'.repeat(64 * 1024) }
    },
    'rtc-answer': {
        targetId: 's'.repeat(128),
        sdp: { type: 'answer', sdp: 'v'.repeat(64 * 1024) }
    },
    'rtc-ice': {
        targetId: 's'.repeat(128),
        candidate: {
            candidate: 'c'.repeat(8192),
            sdpMid: 'm'.repeat(256),
            sdpMLineIndex: 65_535,
            usernameFragment: 'u'.repeat(256)
        }
    },
    'user-status': {
        status: {
            text: 's'.repeat(80),
            visible: true,
            goal: 'g'.repeat(80),
            manual: 'm'.repeat(40),
            manualPreset: 'studying',
            autoSync: true,
            ambientType: 'rain',
            timerMode: 'focus',
            updatedAt: Number.MAX_SAFE_INTEGER
        }
    },
    'report-user': {
        targetId: 's'.repeat(128),
        reason: 'other',
        detail: 'd'.repeat(200)
    }
};

test('the validator defines and accepts a bounded contract for every socket request event', () => {
    assert.deepEqual([...SOCKET_REQUEST_EVENTS].sort(), Object.keys(validPayloads).sort());
    for (const [eventName, payload] of Object.entries(validPayloads)) {
        assert.equal(validateSocketRequest(eventName, payload), true, String(eventName));
    }
});

test('the validator preserves current minimal payloads and the temporary legacy client fields', () => {
    const currentAndLegacyPayloads = [
        ['create-room', { roomName: 'Current room', password: '', requirePassword: false, schedule: null }],
        ['join-room', { roomId: 'ABC123', username: 'Student', clientId: 'legacy-client-id', password: '' }],
        ['send-message', { roomId: 'ABC123', text: 'Current client still sends roomId' }],
        ['board-set-goal', { goal: '' }],
        ['board-add-task', { text: 'Task' }],
        ['user-status', { status: { text: '', visible: false, goal: '', updatedAt: 1.5 } }],
        ['report-user', { targetId: 'socket-id' }]
    ];

    for (const [eventName, payload] of currentAndLegacyPayloads) {
        assert.equal(validateSocketRequest(eventName, payload), true, String(eventName));
    }
});

test('every event rejects unexpected top-level fields', () => {
    for (const [eventName, payload] of Object.entries(validPayloads)) {
        assert.equal(
            validateSocketRequest(eventName, { ...payload, unexpected: true }),
            false,
            eventName
        );
    }
});

test('every event rejects wrong nested types, invalid enums, or excessive values', () => {
    const invalidPayloads = {
        'create-room': { roomName: 'Room', schedule: [] },
        'join-room': { roomId: 'ABC123', username: 7 },
        'send-message': { text: { nested: true } },
        'board-set-goal': { goal: 'g'.repeat(81) },
        'board-add-task': { text: 'Task', priority: 'urgent' },
        'board-toggle-task': { taskId: 'task-id', done: 'yes' },
        'board-delete-task': { taskId: ['task-id'] },
        'board-reorder-tasks': { taskIds: Array.from({ length: 101 }, (_, index) => `task-${index}`) },
        'camera-status': { camera: 'true' },
        'rtc-offer': { targetId: 'peer', sdp: { type: 'answer', sdp: 'v=0' } },
        'rtc-answer': { targetId: 'peer', sdp: { type: 'answer', sdp: 7 } },
        'rtc-ice': { targetId: 'peer', candidate: [] },
        'user-status': { status: { visible: 'yes' } },
        'report-user': { targetId: 'peer', reason: 'invented' }
    };

    for (const [eventName, payload] of Object.entries(invalidPayloads)) {
        assert.equal(validateSocketRequest(eventName, payload), false, String(eventName));
    }
});

test('string, byte, and array limits reject one unit beyond their public boundary', () => {
    const beyondBoundary = [
        ['create-room', { roomName: 'r'.repeat(49) }],
        ['join-room', { roomId: 'ABC123', username: 'n'.repeat(21) }],
        ['send-message', { text: 'm'.repeat(501) }],
        ['board-set-goal', { goal: 'g'.repeat(81) }],
        ['board-add-task', { text: '🙂'.repeat(126), priority: 2 }],
        ['board-toggle-task', { taskId: 't'.repeat(129), done: false }],
        ['board-delete-task', { taskId: 't'.repeat(129) }],
        ['board-reorder-tasks', { taskIds: Array.from({ length: 101 }, (_, index) => `task-${index}`) }],
        ['rtc-offer', { targetId: 'peer', sdp: { type: 'offer', sdp: 'v'.repeat((64 * 1024) + 1) } }],
        ['rtc-answer', { targetId: 'peer', sdp: { type: 'answer', sdp: 'v'.repeat((64 * 1024) + 1) } }],
        ['rtc-ice', { targetId: 'peer', candidate: { candidate: 'c'.repeat(8193) } }],
        ['user-status', { status: { text: 's'.repeat(81) } }],
        ['report-user', { targetId: 'peer', detail: 'd'.repeat(201) }]
    ];

    for (const [eventName, payload] of beyondBoundary) {
        assert.equal(validateSocketRequest(eventName, payload), false, String(eventName));
    }
});

test('nested objects reject arrays, unexpected fields, duplicates, and malformed WebRTC shapes', () => {
    const malformed = [
        ['create-room', { roomName: 'Room', schedule: { startDate: '2099-01-01', startTime: '12:00', cadence: 'monthly' } }],
        ['create-room', { roomName: 'Room', schedule: { startDate: '2099-01-01', startTime: '12:00', serverOwned: true } }],
        ['create-room', { roomName: 'Room', schedule: { startDate: ['2099-01-01'], startTime: '12:00' } }],
        ['board-reorder-tasks', { taskIds: ['same', 'same'] }],
        ['rtc-offer', { targetId: 'peer', sdp: [] }],
        ['rtc-offer', { targetId: 'peer', sdp: { type: 'offer', sdp: 'v=0', extra: true } }],
        ['rtc-ice', { targetId: 'peer', candidate: { candidate: 'candidate', component: 'rtp' } }],
        ['user-status', { status: [] }],
        ['user-status', { status: { text: 'ok', privateMetadata: 'secret' } }]
    ];

    for (const [eventName, payload] of malformed) {
        assert.equal(validateSocketRequest(eventName, payload), false, `${eventName}: ${JSON.stringify(payload)}`);
    }
});

test('non-object requests and unregistered events fail closed', () => {
    for (const payload of [null, [], false, 42, 'payload']) {
        assert.equal(validateSocketRequest('create-room', payload), false);
    }
    assert.equal(validateSocketRequest('unknown-event', {}), false);
});
