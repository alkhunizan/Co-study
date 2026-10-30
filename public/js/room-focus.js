// The room countdown is local. This surface owns only acknowledged account credit.
(() => {
    const global = /** @type {any} */ (window);
    const $ = (id) => document.getElementById(id);
    let member = false;
    let unavailable = false;
    let recap = null;
    let failedAction = null;
    let actionRequest = 0;
    const copy = {
        ar: { guest: 'وقت المؤقّت على هذا الجهاز فقط. الحساب يحفظ الجلسات الموثّقة.', idle: 'ابدأ المؤقّت لحفظ جلسة موثّقة. الكاميرا لا تؤثر على احتسابها.',
            active: 'جارٍ حفظ وقت التركيز:', paused: 'الجلسة متوقفة مؤقتًا:', minutes: 'دقيقة موثّقة', points: 'نقطة',
            failed: 'تعذّرت مزامنة التقدّم. قد يبقى مؤقّت الغرفة مستمرًا؛ أعد المحاولة لتأكيد حفظ الجلسة.',
            short: 'حُفظت الجلسة. لم تكتمل دقيقة موثّقة، لذلك لم تُضف نقاط.', saved: 'حُفظت في حسابك.',
            saveFocus: 'أنهِ واحفظ', verifiedProgress: 'تقدّمي الموثّق', mediaRetry: 'إعادة المحاولة',
            roomRecapTitle: 'وقت مناسب للاستراحة', roomRecapRest: 'ما أنجزته محفوظ. خذ استراحة، أو اختر خطوتك التالية.' },
        en: { guest: 'Timer time stays on this device. An account saves validated sessions.', idle: 'Start the timer to save a validated session. Camera use never changes credit.',
            active: 'Saving focus time:', paused: 'Session paused:', minutes: 'validated minutes', points: 'points',
            failed: 'Progress could not sync. Your room timer may still be running; retry to confirm your session was saved.',
            short: 'Session saved. Less than one validated minute; no points added.', saved: 'Saved to your account.',
            saveFocus: 'Finish and save', verifiedProgress: 'My verified progress', mediaRetry: 'Retry',
            roomRecapTitle: 'A good place to pause', roomRecapRest: 'Your progress is saved. Rest, or choose your next small step.' }
    };
    const t = (key) => copy[global.HalaCore.getLang()][key];
    function text(id, value) { if ($(id).textContent !== value) $(id).textContent = value; }
    function render() {
        const session = global.HalaFocus.current();
        const open = member && session && ['active', 'paused'].includes(session.state);
        text('room-focus-message', unavailable ? t('failed') : !member ? t('guest') : open
            ? `${t(session.state)} ${Math.floor(global.HalaFocus.displaySeconds() / 60)} ${t('minutes')}` : t('idle'));
        $('room-focus-finish').hidden = !open;
        $('room-focus-retry').hidden = !unavailable;
        $('room-progress-link').hidden = !member;
        for (const id of ['room-focus-finish', 'room-focus-retry', 'room-progress-link']) {
            $(id).textContent = t({ 'room-focus-finish': 'saveFocus', 'room-focus-retry': 'mediaRetry', 'room-progress-link': 'verifiedProgress' }[id]);
        }
        $('room-session-recap').hidden = !recap;
        if (recap) {
            $('room-session-recap').querySelector('h2').textContent = t('roomRecapTitle');
            $('room-session-recap').querySelector('p:last-child').textContent = t('roomRecapRest');
            const minutes = Math.floor(Number(recap.credited_ms) / 60000);
            $('room-recap-values').textContent = minutes ? `${minutes} ${t('minutes')} · ${recap.xp} ${t('points')}. ${t('saved')}` : t('short');
        }
    }
    async function reconcile() {
        if (!member) {
            member = !!(await global.HalaAuth.refreshUser());
            if (!member) { unavailable = false; render(); return; }
        }
        const summary = await global.HalaFocus.reconcile();
        unavailable = !!failedAction;
        window.dispatchEvent(new CustomEvent('halaprogress', { detail: summary }));
        render();
    }
    async function action(name, expectedSessionId = null) {
        if (!member) return null;
        const request = ++actionRequest;
        const intended = { name, sessionId: expectedSessionId || global.HalaFocus.current()?.id || null };
        let acknowledged = false;
        try {
            const result = await global.HalaFocus[name](expectedSessionId);
            acknowledged = true;
            if (request !== actionRequest) return result;
            failedAction = null;
            unavailable = false;
            if (name === 'complete' && result?.state === 'completed') { recap = result; await reconcile(); }
            else if (name === 'start') recap = null;
            render();
            return result;
        } catch (error) {
            if (request === actionRequest) {
                // A failed follow-up refresh must not replay an acknowledged mutation.
                failedAction = acknowledged ? null : { ...intended, sessionId: error.focusSessionId || intended.sessionId };
                unavailable = true;
                render();
            }
            return null;
        }
    }
    async function retry() {
        if (global.HalaFocus.hasPendingCompletion()) return action('complete');
        const pending = failedAction;
        const request = actionRequest;
        await reconcile();
        if (!pending || failedAction !== pending || request !== actionRequest) return;
        const session = global.HalaFocus.current();
        if ((pending.sessionId && session?.id !== pending.sessionId) || (!pending.sessionId && session)) {
            // Another surface replaced this session. Adopt its state without changing it.
            failedAction = null;
            unavailable = false;
            render();
            return;
        }
        return action(pending.name, pending.sessionId);
    }
    $('room-focus-finish').addEventListener('click', async () => {
        window.dispatchEvent(new Event('halaroomfinish'));
        const control = /** @type {HTMLButtonElement} */ ($('room-focus-finish'));
        control.disabled = true;
        const result = await action('complete');
        control.disabled = false;
        if (result) $('room-session-recap').focus({ preventScroll: true });
    });
    $('room-focus-retry').addEventListener('click', async () => {
        const control = /** @type {HTMLButtonElement} */ ($('room-focus-retry'));
        const request = actionRequest;
        control.disabled = true;
        try { await retry(); }
        catch { if (request === actionRequest) { unavailable = true; render(); } }
        finally { control.disabled = false; }
    });
    window.addEventListener('halafocuschange', () => {
        const session = global.HalaFocus.current();
        const intendedState = { start: 'active', pause: 'paused', complete: 'completed' }[failedAction?.name];
        if (failedAction && session?.state === intendedState && (!failedAction.sessionId || session.id === failedAction.sessionId)) failedAction = null;
        unavailable = !!failedAction;
        if (member && session?.state === 'completed') recap = session;
        render();
    });
    window.addEventListener('halafocuserror', () => { unavailable = true; render(); });
    window.addEventListener('halaroomlanguage', render);
    setInterval(() => { if (member && !document.hidden) render(); }, 1000);
    global.HalaRoomFocus = { action };
    // Validated focus needs the platform; a deployment without it keeps the
    // local countdown and never calls platform routes.
    void global.HalaCore.requestJson('GET', '/api/runtime-config')
        .then((runtime) => (runtime?.platformEnabled === false ? null : global.HalaAuth.getUser()))
        .then(async (user) => { member = !!user; if (member) await reconcile(); render(); })
        .catch(() => { unavailable = true; render(); });
})();
