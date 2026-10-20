(() => {
    const runtime = /** @type {any} */ (window);
    const core = runtime.HalaCore;
    const fragment = new URLSearchParams(location.hash.slice(1));
    let token = fragment.get('token') || '';
    let purpose = fragment.get('purpose') || (new URLSearchParams(location.search).get('mode') === 'verify' ? 'verify' : 'reset');
    history.replaceState(null, '', location.pathname);
    const copy = {
        ar: { title: 'أمان حسابك', theme: 'المظهر', loading: 'جارٍ التحميل…', email: 'البريد الإلكتروني',
            password: 'كلمة المرور الجديدة', confirm: 'أعد كتابة كلمة المرور', send: 'إرسال الرابط', save: 'حفظ كلمة المرور',
            verify: 'تأكيد البريد', account: 'العودة إلى الحساب', retry: 'حاول مجددًا',
            request: 'أدخل بريدك لطلب رابط استعادة الحساب.', verifyNote: 'أرسل رابط التأكيد إلى البريد المرتبط بحسابك.',
            resetNote: 'اختر كلمة مرور من 8 إلى 64 حرفًا. ستنتهي جلسات الدخول السابقة.',
            sent: 'إذا كان الحساب مؤهلًا، أُعدّت رسالة اختبار محلية. لم يُرسل بريد إلكتروني.',
            done: 'تم التحديث. يمكنك العودة إلى حسابك.', mismatch: 'كلمتا المرور غير متطابقتين.',
            unavailable: 'خدمة البريد غير متاحة حاليًا. حاول لاحقًا.', invalid: 'الرابط منتهي الصلاحية أو مستخدم. اطلب رابطًا جديدًا.',
            failure: 'تعذر إكمال الطلب. حاول مجددًا.', limited: 'طلبات كثيرة. انتظر قليلًا ثم حاول مجددًا.',
            login: 'سجّل الدخول إلى حسابك أولًا.' },
        en: { title: 'Account security', theme: 'Theme', loading: 'Loading…', email: 'Email address',
            password: 'New password', confirm: 'Confirm password', send: 'Send link', save: 'Save password',
            verify: 'Verify email', account: 'Back to account', retry: 'Try again',
            request: 'Enter your email to request an account recovery link.', verifyNote: 'Send a verification link to your account email.',
            resetNote: 'Choose 8–64 characters. Your previous sign-in sessions will end.',
            sent: 'If the account is eligible, a local test message was prepared. No email was sent.',
            done: 'Updated. You can return to your account.', mismatch: 'The passwords do not match.',
            unavailable: 'Email service is currently unavailable. Please try later.', invalid: 'This link has expired or was used. Request a new link.',
            failure: 'The request could not be completed. Try again.', limited: 'Too many requests. Wait a little before trying again.',
            login: 'Sign in to your account first.' }
    };
    core.initLang(copy);
    const $ = (id) => document.getElementById(id);
    const form = /** @type {HTMLFormElement} */ ($('recovery-form'));
    const email = /** @type {HTMLInputElement} */ ($('recovery-email'));
    const password = /** @type {HTMLInputElement} */ ($('recovery-password'));
    const confirm = /** @type {HTMLInputElement} */ ($('recovery-confirm'));
    const submit = /** @type {HTMLButtonElement} */ ($('recovery-submit'));
    let statusKey = 'loading';
    function status(key) { statusKey = key; $('recovery-status').textContent = core.t(key); }
    core.onLangChange(() => status(statusKey));
    $('theme-toggle').addEventListener('click', core.toggleTheme);
    async function boot() {
        $('recovery-retry').hidden = true;
        status('loading');
        try {
            const config = await core.requestJson('GET', '/api/auth/recovery/config');
            if (!config.enabled) { status('unavailable'); return; }
            if (!token && purpose === 'verify' && !await runtime.HalaAuth.getUser()) { status('login'); return; }
            const resetting = !!token && purpose === 'reset';
            email.required = !token && purpose === 'reset';
            password.required = resetting;
            confirm.required = resetting;
            $('email-field').hidden = !email.required;
            $('password-field').hidden = !resetting;
            $('confirm-field').hidden = !resetting;
            const action = token ? (resetting ? 'save' : 'verify') : 'send';
            submit.dataset.lang = action;
            submit.textContent = core.t(action);
            form.hidden = false;
            status(resetting ? 'resetNote' : purpose === 'verify' ? 'verifyNote' : 'request');
        } catch { status('failure'); $('recovery-retry').hidden = false; }
    }
    $('recovery-retry').addEventListener('click', () => { void boot(); });
    window.addEventListener('hashchange', () => {
        const next = new URLSearchParams(location.hash.slice(1));
        if (!next.get('token')) return;
        token = next.get('token');
        purpose = next.get('purpose') || 'reset';
        history.replaceState(null, '', location.pathname);
        password.value = '';
        confirm.value = '';
        void boot();
    });
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (password.required && password.value !== confirm.value) { status('mismatch'); return; }
        submit.disabled = true;
        try {
            const completing = !!token;
            await core.postJson(completing ? '/api/auth/recovery/complete'
                : purpose === 'verify' ? '/api/me/email-verification' : '/api/auth/recovery/request',
            completing ? { token, purpose, password: password.value } : { email: email.value });
            status(completing ? 'done' : 'sent');
            token = '';
            password.value = '';
            confirm.value = '';
            form.hidden = true;
        } catch (error) {
            status(error.code === 'RECOVERY_LINK_INVALID' ? 'invalid'
                : error.code === 'RATE_LIMITED' ? 'limited'
                : error.code === 'RECOVERY_UNAVAILABLE' ? 'unavailable'
                : error.code === 'AUTH_REQUIRED' ? 'login' : 'failure');
        } finally { submit.disabled = false; }
    });
    void boot();
})();
