const { test, expect } = require('@playwright/test');

test('board capacity feedback preserves the draft and translates', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('halastudyLang', 'en'));
    await page.goto('/open'); await page.fill('#room-name', 'Board feedback');
    await page.click('#create-form button[type=submit]'); await page.locator('#create-result').waitFor({ state: 'visible' });
    await page.click('#btn-enter-room'); await page.fill('#join-name', 'Synthetic'); await page.click('#join-form button[type=submit]');
    await expect(page.locator('#chat-input')).toBeEnabled();
    // Isolate feedback rendering; the real limit is covered by the socket/restore test.
    await page.evaluate(`socket.emit = (event, payload, ack) => { if (event === 'board-add-task') ack({ ok: false, errorCode: 'BOARD_TASK_LIMIT' }); };`);
    await page.fill('#new-task', 'Keep this draft'); await page.click('#add-task-btn');
    await expect(page.locator('#board-feedback')).toContainText('100-task limit');
    await expect(page.locator('#new-task')).toHaveValue('Keep this draft');
    await page.locator('[data-lang-value=ar]').filter({ visible: true }).click();
    await expect(page.locator('#board-feedback')).toContainText('حد 100 مهمة');
    await expect(page.locator('#new-task')).toHaveValue('Keep this draft');
});
