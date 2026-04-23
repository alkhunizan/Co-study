const { test, expect } = require('@playwright/test');

let smokeIpCounter = 10;

async function createSmokePage(browser) {
    const forwardedIp = `203.0.113.${smokeIpCounter}`;
    smokeIpCounter += 1;
    const context = await browser.newContext({
        permissions: [],
        extraHTTPHeaders: {
            'x-forwarded-for': forwardedIp
        }
    });
    const page = await context.newPage();

    await page.addInitScript(() => {
        try {
            delete window.FaceDetector;
        } catch (_error) {}

        const baseMediaDevices = navigator.mediaDevices || {};
        const stubbedMediaDevices = Object.create(baseMediaDevices);
        stubbedMediaDevices.getUserMedia = async () => {
            throw new Error('Camera access is disabled in smoke tests.');
        };
        Object.defineProperty(navigator, 'mediaDevices', {
            configurable: true,
            value: stubbedMediaDevices
        });
    });

    return { context, page };
}

async function createRoomFromLanding(page, options = {}) {
    const {
        roomName = `QA Room ${Date.now()}`,
        password = '',
        requirePassword = false,
        mediaMode = 'mesh',
        schedule = null
    } = options;

    await page.goto('/');
    await expect(page.locator('#create-form')).toBeVisible();

    await page.fill('#room-name', roomName);
    if (mediaMode === 'sfu') {
        await expect(page.locator('[data-media-mode="sfu"]')).toBeVisible();
        await page.click('[data-media-mode="sfu"]');
        await expect(page.locator('[data-media-mode="sfu"]')).toHaveClass(/active/);
    }
    if (requirePassword) {
        await page.check('#require-password');
        await page.fill('#room-password', password);
    }
    if (schedule) {
        await page.check('#enable-schedule');
        if (schedule.startDate) {
            await page.fill('#schedule-date', schedule.startDate);
        }
        if (schedule.startTime) {
            await page.fill('#schedule-time', schedule.startTime);
        }
        if (schedule.cadence) {
            await page.selectOption('#schedule-cadence', schedule.cadence);
        }
        if (schedule.focusMinutes) {
            await page.fill('#schedule-focus', String(schedule.focusMinutes));
        }
        if (schedule.breakMinutes) {
            await page.fill('#schedule-break', String(schedule.breakMinutes));
        }
        if (schedule.boardGoalTemplate) {
            await page.fill('#schedule-goal-template', schedule.boardGoalTemplate);
        }
    }

    await page.click('#create-form button[type="submit"]');
    await expect(page.locator('#create-result')).toBeVisible();

    const roomCode = (await page.locator('#result-code').textContent()).trim();
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

    return roomCode;
}

function buildFutureRiyadhSchedule(options = {}) {
    const minutesFromNow = Number.isInteger(options.minutesFromNow) ? options.minutesFromNow : 5;
    const future = new Date(Date.now() + (3 * 60 * 60 * 1000) + (minutesFromNow * 60 * 1000));
    return {
        startDate: `${future.getUTCFullYear()}-${String(future.getUTCMonth() + 1).padStart(2, '0')}-${String(future.getUTCDate()).padStart(2, '0')}`,
        startTime: `${String(future.getUTCHours()).padStart(2, '0')}:${String(future.getUTCMinutes()).padStart(2, '0')}`,
        cadence: options.cadence || 'weekdays',
        focusMinutes: options.focusMinutes || 50,
        breakMinutes: options.breakMinutes || 10,
        boardGoalTemplate: options.boardGoalTemplate || 'Ship the Saudi launch checklist'
    };
}

async function joinRoom(page, options = {}) {
    const {
        name,
        roomCode = '',
        password = ''
    } = options;

    await expect(page.locator('#join-overlay')).toBeVisible();
    await page.fill('#join-name', name);
    if (roomCode) {
        await page.fill('#join-room', roomCode);
    }
    await page.fill('#join-password', password);
    await page.click('#join-form button[type="submit"]');
}

async function expectJoined(page) {
    await expect.poll(async () => {
        const overlayHidden = await page.locator('#join-overlay').evaluate((element) => {
            return element.classList.contains('hidden');
        });
        const chatEnabled = await page.locator('#chat-input').isEnabled();
        const boardEnabled = await page.locator('#new-task').isEnabled();
        const joinError = ((await page.locator('#join-error').textContent()) || '').trim();

        if (joinError) {
            return `error:${joinError}`;
        }
        if (overlayHidden && chatEnabled && boardEnabled) {
            return 'joined';
        }
        return 'pending';
    }, { timeout: 20000 }).toBe('joined');
}

async function addTask(page, text) {
    await page.fill('#new-task', text);
    await page.click('#add-task-btn');
    await expect(page.locator('#todo-list .todo-text', { hasText: text })).toBeVisible();
}

async function taskTexts(page) {
    return (await page.locator('#todo-list .todo-text').allTextContents()).map((entry) => entry.trim());
}

async function selfBadgeLayout(page) {
    return page.locator('#user-list .user-name-row').first().evaluate((element) => {
        const style = window.getComputedStyle(element);
        return {
            display: style.display,
            gap: style.gap,
            wrap: style.flexWrap
        };
    });
}

test.describe.configure({ mode: 'serial' });

test('landing creates a protected room and join flow enforces passwords', async ({ browser }) => {
    const creator = await createSmokePage(browser);
    const guest = await createSmokePage(browser);

    try {
        const roomCode = await createRoomFromLanding(creator.page, {
            roomName: 'Protected Smoke Room',
            requirePassword: true,
            password: 'smoke123'
        });

        await guest.page.goto(`/index.html?room=${roomCode}`);
        await expect(guest.page.locator('#join-room')).toHaveValue(roomCode);

        await joinRoom(guest.page, { name: 'Guest', roomCode });
        await expect(guest.page.locator('#join-error')).toContainText(/requires a password/i);

        await guest.page.fill('#join-password', 'wrongpass');
        await guest.page.click('#join-form button[type="submit"]');
        await expect(guest.page.locator('#join-error')).toContainText(/incorrect/i);

        await guest.page.fill('#join-password', 'smoke123');
        await guest.page.click('#join-form button[type="submit"]');
        await expectJoined(guest.page);
    } finally {
        await creator.context.close();
        await guest.context.close();
    }
});

test('chat and shared board stay in sync across two participants', async ({ browser }) => {
    const owner = await createSmokePage(browser);
    const peer = await createSmokePage(browser);

    try {
        const roomCode = await createRoomFromLanding(owner.page, {
            roomName: 'Realtime Smoke Room'
        });

        await owner.page.click('#btn-enter-room');
        await joinRoom(owner.page, {
            name: 'Owner',
            roomCode
        });
        await expectJoined(owner.page);
        await expect(owner.page.locator('#user-list .user-self')).toContainText('Me');
        await expect.poll(() => selfBadgeLayout(owner.page)).toEqual({
            display: 'flex',
            gap: '8px',
            wrap: 'wrap'
        });

        await peer.page.goto(`/index.html?room=${roomCode}`);
        await joinRoom(peer.page, {
            name: 'Peer',
            roomCode
        });
        await expectJoined(peer.page);

        await owner.page.fill('#chat-input', 'Smoke hello');
        await owner.page.click('#chat-send');
        await expect(peer.page.locator('#chat-msgs')).toContainText('Smoke hello');

        await owner.page.fill('#room-goal', 'Ship CI guardrails');
        await owner.page.locator('#room-goal').blur();
        await expect.poll(async () => peer.page.locator('#room-goal').inputValue()).toBe('Ship CI guardrails');

        await addTask(owner.page, 'First shared task');
        await addTask(owner.page, 'Second shared task');
        await expect.poll(() => taskTexts(peer.page)).toEqual(['First shared task', 'Second shared task']);

        await owner.page.locator('#todo-list .todo-item', { hasText: 'Second shared task' })
            .dragTo(owner.page.locator('#todo-list .todo-item', { hasText: 'First shared task' }));
        await expect.poll(() => taskTexts(peer.page)).toEqual(['Second shared task', 'First shared task']);

        await peer.page.locator('#todo-list .todo-item', { hasText: 'Second shared task' })
            .locator('.check-circle')
            .click();
        await expect(owner.page.locator('#todo-list .todo-item', { hasText: 'Second shared task' })).toHaveClass(/done/);

        await owner.page.locator('#todo-list .todo-item', { hasText: 'First shared task' })
            .locator('.todo-delete')
            .click();
        await expect.poll(() => taskTexts(peer.page)).toEqual(['Second shared task']);
    } finally {
        await owner.context.close();
        await peer.context.close();
    }
});

test('scheduled rooms expose timer defaults and invite actions', async ({ browser }) => {
    const owner = await createSmokePage(browser);

    try {
        const schedule = buildFutureRiyadhSchedule();
        const roomCode = await createRoomFromLanding(owner.page, {
            roomName: 'Scheduled Smoke Room',
            schedule
        });

        await expect(owner.page.locator('#result-schedule')).toBeVisible();
        await expect(owner.page.locator('#result-whatsapp-link')).toHaveAttribute('href', /wa\.me/);
        await expect(owner.page.locator('#result-calendar-btn')).toBeVisible();

        await owner.page.click('#btn-enter-room');
        await joinRoom(owner.page, {
            name: 'Owner',
            roomCode
        });
        await expectJoined(owner.page);

        await expect(owner.page.locator('#schedule-card')).toBeVisible();
        await expect(owner.page.locator('#schedule-meta')).toContainText(/timer/i);
        await expect(owner.page.locator('#cfg-f')).toHaveValue('50');
        await expect(owner.page.locator('#cfg-b')).toHaveValue('10');
        await expect(owner.page.locator('#room-goal')).toHaveValue('Ship the Saudi launch checklist');
        await expect(owner.page.locator('#schedule-whatsapp-link')).toHaveAttribute('href', /wa\.me/);
    } finally {
        await owner.context.close();
    }
});

test('schedule helpers recalculate recurring sessions after stale snapshot data', async ({ browser }) => {
    const probe = await createSmokePage(browser);

    try {
        await probe.page.addInitScript(() => {
            const realNow = Date.now.bind(Date);
            let offsetMs = 0;
            Date.now = () => realNow() + offsetMs;
            window.__setTestNowOffset = (nextOffsetMs) => {
                offsetMs = Number(nextOffsetMs) || 0;
            };
        });

        const roomCode = await createRoomFromLanding(probe.page, {
            roomName: 'Scheduled Roll Forward Room',
            schedule: buildFutureRiyadhSchedule({
                minutesFromNow: 20,
                cadence: 'daily',
                focusMinutes: 50,
                breakMinutes: 10,
                boardGoalTemplate: 'Keep the next session accurate'
            })
        });

        await probe.page.click('#btn-enter-room');
        await joinRoom(probe.page, {
            name: 'Owner',
            roomCode
        });
        await expectJoined(probe.page);

        await expect(probe.page.locator('#schedule-meta')).toContainText(/Next session/i);

        const initialMeta = await probe.page.locator('#schedule-meta').textContent();

        await probe.page.evaluate(() => {
            window.__setTestNowOffset(2 * 60 * 60 * 1000);
        });

        await expect.poll(async () => probe.page.locator('#schedule-countdown').textContent()).not.toEqual('');
        await expect.poll(async () => probe.page.locator('#schedule-meta').textContent()).not.toBe(initialMeta);
        await expect(probe.page.locator('#schedule-meta')).toContainText(/Next session/i);
        await expect(probe.page.locator('#schedule-whatsapp-link')).toHaveAttribute('href', /wa\.me/);
    } finally {
        await probe.context.close();
    }
});

test('large rooms switch into embedded SFU mode', async ({ browser }) => {
    const owner = await createSmokePage(browser);

    try {
        const roomCode = await createRoomFromLanding(owner.page, {
            roomName: 'Large Room Smoke',
            mediaMode: 'sfu'
        });

        await owner.page.click('#btn-enter-room');
        await joinRoom(owner.page, {
            name: 'Owner',
            roomCode
        });
        await expectJoined(owner.page);

        await expect(owner.page.locator('#media-mode-value')).toContainText(/large room/i);
        await expect(owner.page.locator('.video-box')).toHaveClass(/sfu-mode/);
        await expect(owner.page.locator('#media-state-text')).toContainText(/embedded session|loading room media/i);

        const frame = owner.page.frameLocator('#sfu-frame');
        await expect(frame.locator('#fake-sfu-root')).toBeVisible();
        await expect(frame.locator('#fake-sfu-room')).toContainText(roomCode);
    } finally {
        await owner.context.close();
    }
});

test('a fifth participant is blocked from a full mesh room', async ({ browser }) => {
    const users = await Promise.all(Array.from({ length: 5 }, () => createSmokePage(browser)));

    try {
        const roomCode = await createRoomFromLanding(users[0].page, {
            roomName: 'Mesh Cap Smoke'
        });

        for (let index = 0; index < 4; index += 1) {
            const actor = users[index];
            if (index === 0) {
                await actor.page.click('#btn-enter-room');
            } else {
                await actor.page.goto(`/index.html?room=${roomCode}`);
            }
            await joinRoom(actor.page, {
                name: `User ${index + 1}`,
                roomCode
            });
            await expectJoined(actor.page);
        }

        await users[4].page.goto(`/index.html?room=${roomCode}`);
        await joinRoom(users[4].page, {
            name: 'User 5',
            roomCode
        });
        await expect(users[4].page.locator('#join-error')).toContainText(/full/i);
        await expect(users[4].page.locator('#join-overlay')).not.toHaveClass(/hidden/);
    } finally {
        await Promise.all(users.map(({ context }) => context.close()));
    }
});
