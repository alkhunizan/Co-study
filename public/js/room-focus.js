// The room countdown is local. This surface owns only acknowledged account credit.
(() => {
    const global = /** @type {any} */ (window);
    const $ = (id) => document.getElementById(id);
    let member = false;
    let unavailable = false;
    let recap = null;
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
        unavailable = false;
        window.dispatchEvent(new CustomEvent('halaprogress', { detail: summary }));
        render();
    }
    async function action(name) {
        if (!member) return null;
        try {
            const result = await global.HalaFocus[name]();
            unavailable = false;
            if (name === 'complete' && result?.state === 'completed') { recap = result; await reconcile(); }
            else if (name === 'start') recap = null;
            render();
            return result;
        } catch { unavailable = true; render(); return null; }
    }
    $('room-focus-finish').addEventListener('click', async () => {
        window.dispatchEvent(new Event('halaroomfinish'));
        const control = /** @type {HTMLButtonElement} */ ($('room-focus-finish'));
        control.disabled = true;
        const result = await action('complete');
        control.disabled = false;
        if (result) $('room-session-recap').focus({ preventScroll: true });
    });
    $('room-focus-retry').addEventListener('click', () => {
        if (global.HalaFocus.hasPendingCompletion()) void action('complete');
        else void reconcile().catch(() => { unavailable = true; render(); });
    });
    window.addEventListener('halafocuschange', () => {
        unavailable = false;
        if (member && global.HalaFocus.current()?.state === 'completed') recap = global.HalaFocus.current();
        render();
    });
    window.addEventListener('halafocuserror', () => { unavailable = true; render(); });
    window.addEventListener('halaroomlanguage', render);
    setInterval(() => { if (member && !document.hidden) render(); }, 1000);
    global.HalaRoomFocus = { action };
    void global.HalaAuth.getUser().then(async (user) => { member = !!user; if (member) await reconcile(); render(); })
        .catch(() => { unavailable = true; render(); });
})();
