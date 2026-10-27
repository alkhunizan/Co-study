(() => {
    const global = /** @type {any} */ (window);
    const core = global.HalaCore;
    const $ = (id) => /** @type {any} */ (document.getElementById(id));
    const { ar, en } = global.HalaPlatformCopy;
    let user = null;
    let state = null;
    let progress = null;
    let ownedRooms = [];
    let selectedCircle = null;
    let identityKnown = false;
    let refreshRequest = 0;
    let circleRequest = 0;
    let requestedCircleId = null;
    let checkout = null;
    let providerOrder = null;
    let dashboard = null;
    let recap = null;
    let enrolling = false;
    let invitedToken = '';
    const inviteDraftKey = 'halastudy:circle-invite-draft';
    function restoreInvitation() {
        const incoming = new URLSearchParams(location.hash.split('?')[1] || '').get('invite');
        try {
            const draft = JSON.parse(sessionStorage.getItem(inviteDraftKey) || 'null');
            if (incoming !== null) {
                invitedToken = incoming.slice(0, 200);
                sessionStorage.setItem(inviteDraftKey, JSON.stringify({ token: invitedToken, expiresAt: Date.now() + 30 * 60000 }));
            } else if (draft?.expiresAt > Date.now()) invitedToken = draft.token;
            else { invitedToken = ''; sessionStorage.removeItem(inviteDraftKey); }
        } catch { if (incoming !== null) invitedToken = incoming.slice(0, 200); }
        if (invitedToken) $('invite-token').value = invitedToken;
    }
    restoreInvitation();
    let currentView = location.pathname === '/plans' ? 'vip' : location.hash.slice(1).split('?')[0] || (location.pathname === '/supervisor' ? 'circles' : 'home');
    const t = (key) => core.t(key) || en[key] || key;
    const api = (method, route, body) => core.requestJson(method, `/api/platform${route}`, body);
    const locale = () => core.getLang() === 'ar' ? 'ar-SA' : 'en-US';
    const date = (value) => global.HalaSchedule.format(value, core.getLang());
    let activeNotice = null;
    function renderNotice() {
        const visible = activeNotice?.view === currentView;
        $('feedback').textContent = visible ? t(activeNotice.key) : '';
        $('feedback').hidden = !visible;
        $('feedback').classList.toggle('error', !!(visible && activeNotice.error));
    }
    function notice(key, error = false, view = currentView) {
        if (view !== currentView) return;
        activeNotice = key ? { key, error, view } : null;
        renderNotice();
    }
    function noticeError(error, view = currentView) {
        notice(ar[error?.code] || en[error?.code] ? error.code : 'genericError', true, view);
    }
    function node(tag, text, className = '') {
        const element = document.createElement(tag);
        element.textContent = text;
        element.className = className;
        return element;
    }
    function button(label, action) {
        const element = node('button', label);
        element.type = 'button';
        element.addEventListener('click', () => void work(element, action));
        return element;
    }
    async function work(element, action) {
        const view = currentView;
        notice('');
        element.disabled = true;
        try { await action(); } catch (error) { noticeError(error, view); }
        finally { element.disabled = false; }
    }
    function bindForm(id, action) {
        $(id).addEventListener('submit', (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            void work(form.querySelector('button'), () => action(Object.fromEntries(new FormData(form)), form));
        });
    }
    function row(title, detail, actions = []) {
        const item = node('div', '', 'row');
        const meta = node('div', '', 'row-main');
        meta.append(node('strong', title), node('small', detail));
        const controls = node('div', '', 'actions');
        controls.append(...actions);
        item.append(meta, controls);
        return item;
    }
    function fill(id, children, empty = 'noData') {
        $(id).replaceChildren(...(children.length ? children : [node('p', t(empty), 'empty')]));
    }
    function metrics(id, values) {
        $(id).replaceChildren(...Object.entries(values).map(([key, value]) => {
            const item = node('div', '', 'metric');
            item.append(node('strong', Number.isFinite(Number(value)) ? Number(value).toLocaleString(locale()) : '—'), node('span', t(key)));
            return item;
        }));
    }
    function renderProgress() {
        if (!progress) return;
        metrics('home-metrics', { todayMinutes: dashboard?.today.minutes });
        metrics('progress-metrics', progress.totals);
        fill('achievements', progress.achievements.map((entry) => node('span', t(entry.achievement_key), 'badge')), 'emptyAchievements');
        fill('session-history', progress.sessions.map((entry) => row(
            date(entry.started_at), `${Math.floor(Number(entry.credited_ms) / 60000)} · ${t('minutes')} · ${entry.xp} ${t('xp')} · ${t(entry.state)}`
        )), 'emptySessions');
        $('export-progress').hidden = !state?.benefits.features['progress.export'];
        renderFocus();
        renderRhythm();
    }
    function renderRhythm() {
        const activity = progress?.activity || [];
        $('week-activity').replaceChildren(...activity.map((entry) => {
            const day = node('div', '', 'week-day');
            const label = new Intl.DateTimeFormat(locale(), { weekday: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(`${entry.day}T12:00:00Z`));
            day.append(node('span', label), node('strong', entry.xp ? Number(entry.xp).toLocaleString(locale()) : '—'));
            day.setAttribute('aria-label', `${entry.day}: ${entry.xp ? `${entry.xp} ${t('xp')}` : t('noCredit')}`);
            if (entry.xp) day.classList.add('has-focus');
            return day;
        }));
        const xp = Number(progress?.totals.xp || 0);
        const target = xp < 100 ? 100 : 1000;
        $('next-milestone').textContent = !xp ? t('firstStep') : xp >= 1000 ? t('steadyStep')
            : t('nextStep').replace('{remaining}', (target - xp).toLocaleString(locale())).replace('{target}', target.toLocaleString(locale()));
    }
    function renderFocus() {
        const session = global.HalaFocus.current();
        const open = session && ['active', 'paused'].includes(session.state);
        const seconds = global.HalaFocus.displaySeconds();
        $('focus-clock').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        const label = open ? t(session.state) : t('noSession');
        if ($('focus-state').textContent !== label) $('focus-state').textContent = label;
        $('focus-start').hidden = !!open;
        $('focus-pause').hidden = !open;
        $('focus-finish').hidden = !open;
        $('focus-pause').textContent = session?.state === 'paused' ? t('resume') : t('pause');
        const solo = document.querySelector('[data-lang="soloFocus"]');
        if (solo) solo.textContent = open ? t(session.state === 'paused' ? 'resume' : 'currentSession') : t('soloFocus');
    }
    function roomLink(id) {
        const link = node('a', t('join'), 'button');
        link.href = `/study?room=${encodeURIComponent(id)}`;
        return link;
    }
    function renderDashboard() {
        const room = dashboard?.recentRoom;
        $('return-section').hidden = !room;
        fill('return-room', room ? [row(room.name, room.passwordProtected ? t('passwordReminder') : '', [roomLink(room.id)])] : [], 'noRecentRoom');
        const session = dashboard?.nextSession;
        $('next-section').hidden = !session;
        fill('next-session', session ? [row(session.title, date(session.starts_at), [roomLink(session.room_id)])] : [], 'noNextSession');
    }
    function renderRecap() {
        $('focus-recap').hidden = !recap;
        if (!recap) return;
        const minutes = Math.floor(Number(recap.credited_ms) / 60000);
        const elapsed = Math.max(0, Math.floor((Number(recap.completed_at) - Number(recap.started_at)) / 1000));
        $('recap-values').textContent = `${t('elapsed')}: ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')} · ${t('credited')}: ${minutes} · ${t('xp')}: ${Number(recap.xp)}`;
        $('recap-note').textContent = `${t('savedSession')} ${minutes < 1 ? t('shortSession') : t('recapRule')}`;
    }
    function renderRooms() {
        $('owned-section').hidden = !ownedRooms.some((room) => room.exists);
        fill('owned-rooms', ownedRooms.filter((room) => room.exists).map((room) => {
            const link = node('a', t('join'), 'button');
            link.href = `/study?room=${encodeURIComponent(room.id)}`;
            const rename = button(t('rename'), async () => {
                const form = document.createElement('form');
                form.className = 'inline-form';
                const input = document.createElement('input');
                input.value = room.name;
                input.maxLength = 48;
                input.required = true;
                input.setAttribute('aria-label', t('rename'));
                const save = node('button', t('save'));
                form.append(input, save);
                form.addEventListener('submit', (event) => {
                    event.preventDefault();
                    void work(save, async () => {
                        await api('PATCH', `/rooms/${encodeURIComponent(room.id)}`, { name: input.value });
                        await refresh();
                        notice('saved');
                    });
                });
                rename.closest('.row').append(form);
                rename.remove();
                input.focus();
            });
            return row(room.name, room.id, room.can_manage ? [link, rename] : [link]);
        }), 'emptyRooms');
    }
    const circleUnavailable = node('div', '');
    circleUnavailable.id = 'circle-unavailable';
    circleUnavailable.hidden = true;
    $('circle-detail').before(circleUnavailable);
    function renderCircles() {
        const vip = state?.benefits.plan.id === 'vip';
        $('circle-create').hidden = !vip;
        $('circle-vip-note').hidden = vip;
        fill('circle-list', (state?.cohorts || []).map((circle) => row(
            circle.name, `${circle.member_count} · ${t('members')} · ${t(circle.owner_id === user?.id ? 'owner' : circle.member_role)}`,
            [button(t('view'), () => showCircle(circle))]
        )), 'emptyCircles');
    }
    async function showCircle(circle) {
        const request = ++circleRequest;
        const sameCircle = requestedCircleId === circle.id;
        const selectedRoom = sameCircle ? $('session-room').value : '';
        requestedCircleId = circle.id;
        selectedCircle = null;
        circleUnavailable.hidden = true;
        window.dispatchEvent(new CustomEvent('halacirclechange', { detail: null }));
        $('circle-detail').hidden = true;
        $('invite-result').hidden = true;
        $('invite-code').textContent = '';
        $('attendance').replaceChildren();
        let members, sessions;
        try {
            [members, sessions] = await Promise.all([api('GET', `/cohorts/${circle.id}/members`), api('GET', `/cohorts/${circle.id}/sessions`)]);
        } catch (error) {
            if (request !== circleRequest) return;
            core.showUnavailable(circleUnavailable, () =>
                work(circleUnavailable.querySelector('button'), () => showCircle(circle)));
            throw error;
        }
        if (request !== circleRequest) return;
        selectedCircle = circle;
        window.dispatchEvent(new CustomEvent('halacirclechange', { detail: circle }));
        const owner = circle.owner_id === user.id;
        const supervisor = owner || circle.member_role === 'supervisor';
        $('circle-detail').hidden = false;
        $('circle-title').textContent = circle.name;
        $('circle-exit').textContent = t(owner ? 'archiveCircle' : 'leaveCircle');
        $('create-invite').hidden = !owner || state.benefits.plan.id !== 'vip';
        $('revoke-invites').hidden = !owner;
        $('invite-result').hidden = true;
        $('session-create').hidden = !supervisor;
        $('session-room').replaceChildren(...ownedRooms.filter((room) => room.exists && (!room.cohort_id || room.cohort_id === circle.id)).map((room) => {
            const option = node('option', room.name); option.value = room.id; return option;
        }));
        if (sameCircle) $('session-room').value = selectedRoom;
        $('session-create').hidden = !supervisor || !$('session-room').options.length;
        $('session-room-hint').hidden = !supervisor || !!$('session-room').options.length;
        fill('circle-members', members.members.map((member) => {
            const actions = [];
            if (owner && member.user_id !== user.id) {
                actions.push(button(t(member.role === 'supervisor' ? 'makeMember' : 'makeSupervisor'), async () => {
                    await api('PATCH', `/cohorts/${circle.id}/members/${member.user_id}`, { role: member.role === 'supervisor' ? 'member' : 'supervisor' });
                    if (selectedCircle?.id === circle.id) await showCircle(circle);
                }));
                actions.push(button(t('remove'), async () => {
                    await api('PATCH', `/cohorts/${circle.id}/members/${member.user_id}`, { role: 'remove' });
                    if (selectedCircle?.id === circle.id) await showCircle(circle);
                }));
            }
            return row(member.display_name, t(member.role), actions);
        }));
        fill('circle-sessions', sessions.sessions.map((session) => {
            const join = node('a', t('join'), 'button');
            join.href = `/study?room=${encodeURIComponent(session.room_id)}`;
            const actions = [
                join,
                button(t('attendance'), async () => {
                    const result = await api('GET', `/cohorts/${circle.id}/sessions/${session.id}/attendance`);
                    if (request !== circleRequest) return;
                    fill('attendance', result.attendance.map((entry) => row(entry.display_name, t(entry.status))));
                })
            ];
            if (supervisor && Number(session.starts_at) > Date.now()) actions.push(button(t('cancelSession'), async () => {
                if (!window.confirm(t('cancelSessionConfirm'))) return;
                await api('DELETE', `/cohorts/${circle.id}/sessions/${session.id}`);
                if (selectedCircle?.id === circle.id) await showCircle(circle);
            }));
            return row(session.title, `${date(session.starts_at)} · ${session.duration_minutes}`, actions);
        }));
    }
    function renderBilling() {
        const subscription = state?.benefits.subscription;
        const billing = state?.billing;
        const digetpay = billing?.provider === 'digetpay';
        $('test-notice').hidden = state?.mode !== 'test';
        $('test-notice').textContent = t(digetpay ? 'digetpayNotice' : 'testNotice');
        $('checkout-start').hidden = !!subscription;
        $('checkout-start').disabled = !identityKnown || (!!user && !billing?.checkoutAvailable);
        $('checkout-start').textContent = user ? t(digetpay ? 'tryDigetpay' : 'tryCheckout') : t('signInForVip');
        $('plan-status').textContent = !billing?.checkoutAvailable && user ? t('checkoutUnavailable') : '';
        if (!digetpay || subscription || !billing?.checkoutAvailable) $('digetpay-checkout').hidden = true;
        $('billing-management').hidden = !subscription;
        $('billing-cancel').hidden = digetpay || subscription?.provider === 'digetpay';
        if (subscription) {
            $('billing-status').textContent = `${t(subscription.cancel_at_period_end ? 'subscriptionCancels' : 'subscriptionActive')} ${date(subscription.period_end)}`;
            $('billing-cancel').textContent = t(subscription.cancel_at_period_end ? 'keepMembership' : 'cancelRenewal');
        }
        $('payment-result').hidden = !providerOrder;
        if (providerOrder) {
            const key = providerOrder.verificationPending ? 'paymentPending' : ({
                completed: 'paymentCompleted', refunded: 'paymentRefunded', expired: 'paymentExpired',
                unknown: 'paymentReview', creating: 'paymentReview', review: 'paymentReview'
            }[providerOrder.status] || 'paymentPending');
            $('payment-result-text').textContent = t(key);
        }
    }
    function reasonAction(label, perform) {
        const control = button(label, async () => {
            const form = document.createElement('form');
            form.className = 'inline-form';
            const input = document.createElement('input');
            input.required = true; input.maxLength = 250; input.placeholder = t('actionReason'); input.setAttribute('aria-label', t('actionReason'));
            const submit = node('button', label);
            form.append(input, submit);
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                void work(submit, async () => { await perform(input.value); form.remove(); await renderStaff(); notice('saved'); });
            });
            control.closest('.row').append(form);
            control.remove(); input.focus();
        });
        return control;
    }
    async function searchStaffUsers() {
        const result = await api('GET', `/staff/users?q=${encodeURIComponent($('staff-query').value)}`);
        fill('staff-users', result.users.map((entry) => row(entry.displayName, entry.id, [
            reasonAction(t(entry.banned ? 'unbanAccount' : 'banAccount'), async (reason) => {
                await api('POST', `/staff/users/${entry.id}/status`, { reason, banned: !entry.banned });
                await searchStaffUsers();
            })
        ])));
    }
    function paymentReviewAction(entry, lookup, activateReview) {
        const label = t(activateReview ? 'activateReviewedPayment' : 'recheckPayment');
        const control = button(label, async () => {
            const form = document.createElement('form');
            form.className = 'inline-form';
            const reason = document.createElement('input');
            reason.required = true; reason.minLength = 3; reason.maxLength = 250;
            reason.placeholder = t('actionReason'); reason.setAttribute('aria-label', t('actionReason'));
            const reference = document.createElement('input');
            reference.maxLength = 36; reference.placeholder = t('transactionHint'); reference.setAttribute('aria-label', t('transactionHint'));
            const submit = node('button', label);
            form.append(reason);
            if (lookup === 'transaction') form.append(reference);
            form.append(submit);
            form.addEventListener('submit', event => {
                event.preventDefault();
                void work(submit, async () => {
                    const result = await api('POST', `/staff/payment-orders/${entry.id}/recheck`, {
                        reason: reason.value, transactionId: reference.value.trim() || undefined, activateReview
                    });
                    await renderStaff();
                    notice(({ completed: 'paymentCompleted', refunded: 'paymentRefunded', expired: 'paymentExpired',
                        review: 'paymentReview', unknown: 'paymentReview', creating: 'paymentReview' })[result.status] || 'paymentPending');
                });
            });
            control.closest('.row').append(form); control.remove(); reason.focus();
        });
        return control;
    }
    async function renderPaymentOrders(cursor = '') {
        const result = await api('GET', `/staff/payment-orders${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
        fill('payment-orders', result.orders.map(entry => row(entry.id,
            `${entry.user_id} · ${t(entry.status)} · ${date(entry.created_at)}${entry.last_error ? ` · ${entry.last_error}` : ''}`,
            state.permissions.includes('staff.manage') ? [paymentReviewAction(entry, result.lookup, entry.status === 'review')] : [])));
        $('payment-orders-more').replaceChildren(...(result.nextCursor
            ? [button(t('olderOrders'), () => renderPaymentOrders(result.nextCursor))] : []));
    }
    async function renderStaff() {
        if (!state) return;
        $('staff-lock').hidden = state.staffVerified;
        $('staff-content').hidden = !state.staffVerified;
        if (!state.staffVerified) return;
        const permissions = state.permissions;
        if (permissions.includes('operations.read')) metrics('staff-overview', await api('GET', '/staff/overview'));
        $('staff-operations-section').hidden = !permissions.includes('operations.read');
        $('staff-users-section').hidden = !permissions.includes('cases.manage');
        $('video-gate').hidden = !permissions.includes('operations.manage');
        $('announcement-form').hidden = !permissions.includes('operations.manage');
        $('platform-backup').hidden = !permissions.includes('backups.manage');
        if (permissions.includes('operations.read')) {
            const operations = await api('GET', '/staff/operations');
            $('staff-monitoring-status').textContent = t(operations.monitoring?.storageHealthy === false
                ? 'alertStorage' : operations.monitoring?.deliveryConfigured ? 'alertExternal' : 'alertLocal');
            const alerts = (operations.alerts || []).filter((entry) => !entry.resolvedAt);
            fill('staff-alerts', alerts.map((entry) => row(t(entry.event), `${entry.count} · ${date(entry.lastSeenAt)}`)), 'alertsEmpty');
            $('video-gate').textContent = t(operations.videoDisabled ? 'enableVideo' : 'disableVideo');
            $('video-gate').dataset.disabled = String(operations.videoDisabled);
            const result = await api('GET', '/staff/rooms');
            fill('staff-live-rooms', result.rooms.map((entry) => {
                const actions = [];
                if (permissions.includes('operations.manage')) {
                    if (entry.id !== 'LOBBY') actions.push(reasonAction(t('closeRoom'), (reason) => api('POST', `/staff/rooms/${entry.id}/close`, { reason })));
                    for (const person of entry.participants) actions.push(reasonAction(`${t('kickParticipant')}: ${person.name}`,
                        (reason) => api('POST', `/staff/rooms/${entry.id}/kick`, { reason, socketId: person.socketId })));
                }
                return row(entry.name, `${entry.id} · ${entry.participants.length}`, actions);
            }));
        }
        $('staff-roles-section').hidden = !permissions.includes('staff.read');
        $('staff-grant').hidden = !permissions.includes('staff.manage');
        if (permissions.includes('staff.read')) {
            const result = await api('GET', '/staff');
            fill('staff-roles', result.assignments.map((entry) => row(entry.display_name, roleName(entry.role),
                permissions.includes('staff.manage') ? [button(t('revoke'), async () => {
                    await api('POST', '/staff/roles', { userId: entry.user_id, role: entry.role, remove: true });
                    await refresh();
                })] : [])));
        }
        $('staff-cases-section').hidden = !permissions.includes('cases.read');
        if (permissions.includes('cases.read')) {
            const result = await api('GET', '/staff/cases');
            fill('staff-cases', result.cases.map((entry) => {
                const item = row(entry.reason, `${entry.detail} · ${t(entry.status)}`);
                if (permissions.includes('cases.manage')) {
                    const form = document.createElement('form');
                    form.className = 'inline-form';
                    const input = document.createElement('input');
                    input.required = true; input.maxLength = 500; input.setAttribute('aria-label', t('disposition')); input.placeholder = t('disposition');
                    const submit = node('button', t('resolve'));
                    form.append(input, submit);
                    form.addEventListener('submit', (event) => {
                        event.preventDefault();
                        void work(submit, async () => {
                            await api('PATCH', `/staff/cases/${entry.id}`, { status: 'resolved', disposition: input.value });
                            await renderStaff();
                        });
                    });
                    item.append(form);
                }
                return item;
            }));
        }
        $('staff-billing-section').hidden = !permissions.includes('billing.read');
        if (permissions.includes('billing.read')) {
            const result = await api('GET', '/staff/subscriptions');
            fill('staff-billing', result.subscriptions.map((entry) => row(`VIP · US$4.99 · ${entry.mode}`, `${entry.user_id} · ${t(entry.status)} · ${date(entry.period_end)}`)));
            $('payment-review-section').hidden = state.billing?.provider !== 'digetpay';
            if (!$('payment-review-section').hidden) await renderPaymentOrders();
        }
        $('staff-audit-section').hidden = !permissions.includes('audit.read');
        if (permissions.includes('audit.read')) {
            const result = await api('GET', '/staff/audit');
            fill('staff-audit', result.events.map((entry) => row(entry.action, `${entry.actor_id || '—'} · ${date(entry.created_at)}`)));
        }
    }
    function roleName(role) {
        return t({ moderator: 'roleModerator', support: 'roleSupport', billing_operator: 'roleBilling', admin: 'roleAdmin', super_admin: 'roleSuperAdmin' }[role] || role);
    }
    function renderInsights() {
        const enabled = global.HalaInsights?.enabled() || false;
        $('insights-consent').checked = enabled;
        $('insights-status').textContent = t(enabled ? 'insightsOn' : 'insightsOff');
        const labels = core.getLang() === 'ar' ? {
            entry: 'اختيار البداية', create: 'فتح غرفة', join: 'دخول غرفة', success: 'نجح', invalid: 'تعذّر الدخول', full: 'ممتلئة', denied: 'غير مسموح', network: 'تعذّر الاتصال',
            under5s: 'أقل من 5 ثوانٍ', under30s: 'من 5 إلى 29 ثانية', longer: '30 ثانية فأكثر',
            focus: 'تركيز', start: 'بدء', complete: 'إنهاء', room: 'الغرفة', workspace: 'مساحتك', none: 'دون وقت موثّق', under1m: 'أقل من دقيقة موثّقة', '1to24m': 'من 1 إلى 24 دقيقة موثّقة', '25plus': '25 دقيقة موثّقة فأكثر',
            return: 'عودة إلى الموقع', sameDay: 'خلال يوم من الموافقة', later: 'بعد يوم من الموافقة'
        } : {
            entry: 'Starting choice', create: 'Open a room', join: 'Room entry', success: 'Successful', invalid: 'Could not join', full: 'Full', denied: 'Not permitted', network: 'Connection unavailable',
            under5s: 'Under 5 seconds', under30s: '5–29 seconds', longer: '30 seconds or more',
            focus: 'Focus', start: 'Started', complete: 'Completed', room: 'Room', workspace: 'Workspace', none: 'No credited time', under1m: 'Under one credited minute', '1to24m': '1–24 credited minutes', '25plus': '25 or more credited minutes',
            return: 'Return visit', sameDay: 'Within a day of consent', later: 'After a day from consent'
        };
        $('insights-summary').replaceChildren(...(enabled ? Object.entries(global.HalaInsights.summary()).map(([key, count]) =>
            node('li', `${key.split(':').map((part) => labels[part]).join(' · ')}: ${count}`)) : []));
    }
    function render() {
        renderInsights();
        $('schedule-zone').textContent = global.HalaSchedule.zone();
        $('greeting').textContent = `${t('greeting')} ${user?.displayName || ''}`;
        $('account-id').textContent = user?.id || '';
        $('staff-nav').hidden = !state?.roles?.length;
        $('bootstrap').hidden = !state?.bootstrapAvailable || !state?.staffVerified;
        const google = user?.authProvider === 'google';
        const googleVerified = new URLSearchParams(location.search).get('security') === 'verified';
        $('google-security').hidden = !google || state?.mfaEnabled || googleVerified;
        $('mfa-password-label').hidden = google;
        $('mfa-password').required = !google;
        $('mfa-enroll').hidden = state?.mfaEnabled || (google && !googleVerified);
        renderProgress(); renderDashboard(); renderRecap(); renderRooms(); renderCircles(); renderBilling();
        window.dispatchEvent(new CustomEvent('halaplatformcontext'));
    }
    function showView(focus = false) {
        if (!['home','progress','circles','account','vip','security','staff','planner'].includes(currentView)) currentView = 'home';
        document.title = `${t({ account: 'accountTitle', home: 'homeTitle', progress: 'progressTitle', circles: 'circlesTitle', vip: 'vipTitle', security: 'securityTitle', staff: 'staffTitle', planner:'plannerTitle' }[currentView])} — Halastudy`;
        document.querySelectorAll('[data-panel]').forEach((panel) => {
            panel.toggleAttribute('hidden', !state || panel.getAttribute('data-panel') !== currentView || (!user && currentView !== 'vip'));
        });
        $('guest').querySelector('a.primary').href = `/account?next=${encodeURIComponent(currentView === 'vip' ? '/plans' : invitedToken && currentView === 'circles' ? `/app#circles?invite=${encodeURIComponent(invitedToken)}` : `/app#${currentView}`)}`;
        $('guest').hidden = !state || !identityKnown || !!user || currentView === 'vip';
        document.querySelectorAll('[data-view]').forEach((link) => {
            if (link.getAttribute('data-view') === currentView || (link.closest('.platform-nav') && ((link.getAttribute('data-view') === 'account' && ['vip', 'security', 'staff'].includes(currentView)) || (link.getAttribute('data-view') === 'home' && currentView === 'planner')))) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        if (activeNotice?.view !== currentView) activeNotice = null;
        renderNotice();
        if (focus) {
            const heading = document.querySelector(`[data-panel="${currentView}"]:not([hidden]) h1`);
            if (heading instanceof HTMLElement) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
        }
        if (currentView === 'staff' && state) void renderStaff().catch((error) => noticeError(error, 'staff'));
        if (focus && user && ['home','circles'].includes(currentView)) {
            const view = currentView;
            void refresh().catch((error) => noticeError(error, view));
        }
        if (focus && user && currentView === 'planner') window.dispatchEvent(new CustomEvent('halastudyrefresh'));
    }
    async function refresh() {
        if (!user) return;
        const request = ++refreshRequest;
        const focusAtStart = global.HalaFocus.current();
        let result;
        try {
            result = await Promise.all([api('GET', '/me'), api('GET', '/progress'), api('GET', '/rooms'), api('GET', '/dashboard')]);
        } catch (error) {
            if (request !== refreshRequest) return;
            throw error;
        }
        if (request !== refreshRequest) return;
        [state, progress, { rooms: ownedRooms }, dashboard] = result;
        if (selectedCircle && !state.cohorts.some(circle => circle.id === selectedCircle.id)) {
            selectedCircle = null; circleRequest++; requestedCircleId = null; $('circle-detail').hidden = true;
            window.dispatchEvent(new CustomEvent('halacirclechange', { detail:null }));
        }
        // A focus action or heartbeat can finish while an unrelated workspace read is pending.
        if (global.HalaFocus.current() === focusAtStart) global.HalaFocus.restore(progress.current);
        render();
        showView();
    }
    core.initLang({ ar, en });
    core.onLangChange(() => { render(); showView(); if (selectedCircle) void showCircle(selectedCircle).catch(() => {}); });
    $('theme-toggle').addEventListener('click', core.toggleTheme);
    document.querySelectorAll('[data-view]').forEach((link) => { link.addEventListener('click', (event) => {
        const click = /** @type {MouseEvent} */ (event);
        if (click.button || click.ctrlKey || click.metaKey || click.shiftKey || click.altKey) return;
        event.preventDefault();
        const nextView = link.getAttribute('data-view');
        if (currentView !== nextView) {
            currentView = nextView;
            history.pushState(null, '', currentView === 'vip' ? '/plans' : `/app#${currentView}`);
        }
        showView(true);
    }); });
    function restoreView() {
        if (location.hash === '#main') return; // Native skip-link focus is not a workspace route.
        restoreInvitation();
        const nextView = location.pathname === '/plans' ? 'vip' : location.hash.slice(1).split('?')[0] || (location.pathname === '/supervisor' ? 'circles' : 'home');
        const changed = currentView !== nextView;
        currentView = nextView; showView(changed);
    }
    window.addEventListener('popstate', restoreView);
    window.addEventListener('hashchange', restoreView);
    let identityCheck = null;
    function checkIdentity() {
        if (!identityKnown || identityCheck) return;
        identityCheck = global.HalaAuth.refreshUser().then((current) => {
            if (current?.id !== user?.id) location.reload();
        }).catch(() => {}).finally(() => { identityCheck = null; });
    }
    window.addEventListener('focus', checkIdentity);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) checkIdentity(); });
    window.addEventListener('halafocuschange', () => {
        if (global.HalaFocus.current()?.state === 'completed') { recap = global.HalaFocus.current(); renderRecap(); }
        renderFocus();
    });
    setInterval(() => { if (currentView === 'progress') renderFocus(); }, 1000);
    window.addEventListener('halafocuserror', () => notice('networkError', true));
    $('focus-start').addEventListener('click', () => void work($('focus-start'), async () => { recap = null; renderRecap(); const session = await global.HalaFocus.start(); await global.HalaStudy?.bindFocus(session.id); }));
    $('focus-pause').addEventListener('click', () => void work($('focus-pause'), () =>
        global.HalaFocus.current()?.state === 'paused' ? global.HalaFocus.start() : global.HalaFocus.pause()));
    $('focus-finish').addEventListener('click', () => void work($('focus-finish'), async () => {
        const view = currentView;
        let result;
        try { result = await global.HalaFocus.complete(); }
        catch { notice('completionUnconfirmed', true, view); return; }
        if (result?.state === 'completed') { recap = result; renderRecap(); }
        await refresh();
        if (currentView === 'progress' && recap) $('focus-recap').focus();
    }));
    $('insights-consent').addEventListener('change', () => { global.HalaInsights?.consent($('insights-consent').checked); renderInsights(); });
    $('insights-reset').addEventListener('click', () => { global.HalaInsights?.consent(false); renderInsights(); });
    $('recap-next').addEventListener('click', () => $('focus-start').click());
    bindForm('circle-create', async (data, form) => {
        await api('POST', '/cohorts', { name: data.name || $('circle-name').value });
        form.reset(); await refresh(); notice('saved');
    });
    bindForm('invite-accept', async (_data, form) => {
        const accepted = await api('POST', '/cohorts/accept', { token: $('invite-token').value.trim() });
        invitedToken = '';
        try { sessionStorage.removeItem(inviteDraftKey); } catch { /* storage may be unavailable */ }
        form.reset(); history.replaceState(null, '', '/app#circles');
        await refresh();
        const circle = state.cohorts.find((entry) => entry.id === accepted.id);
        if (circle) await showCircle(circle);
        notice('saved');
    });
    $('create-invite').addEventListener('click', () => void work($('create-invite'), async () => {
        const circle = selectedCircle;
        const request = circleRequest;
        if (!circle) return;
        const result = await api('POST', `/cohorts/${circle.id}/invitations`, {});
        if (request !== circleRequest) return;
        $('invite-result').hidden = false;
        $('invite-code').textContent = result.token;
        $('invite-link').href = `${location.origin}/app#circles?invite=${encodeURIComponent(result.token)}`;
        $('invite-link').textContent = $('invite-link').href;
        $('invite-copy-status').textContent = '';
    }));
    $('copy-invite').addEventListener('click', () => void work($('copy-invite'), async () => {
        try { await navigator.clipboard.writeText($('invite-link').href); $('invite-copy-status').textContent = t('inviteCopied'); }
        catch { $('invite-copy-status').textContent = t('inviteCopyFallback'); }
    }));
    $('revoke-invites').addEventListener('click', () => void work($('revoke-invites'), async () => {
        if (!selectedCircle || !window.confirm(t('revokeInviteConfirm'))) return;
        await api('DELETE', `/cohorts/${selectedCircle.id}/invitations`);
        $('invite-result').hidden = true; $('invite-code').textContent = ''; $('invite-link').removeAttribute('href');
        notice('saved');
    }));
    $('circle-exit').addEventListener('click', () => void work($('circle-exit'), async () => {
        const circle = selectedCircle;
        if (!circle) return;
        const owner = circle.owner_id === user.id;
        if (!window.confirm(t(owner ? 'archiveConfirm' : 'leaveConfirm'))) return;
        await api('POST', `/cohorts/${circle.id}/${owner ? 'archive' : 'leave'}`, {});
        if (requestedCircleId === circle.id) {
            ++circleRequest; requestedCircleId = null; selectedCircle = null; $('circle-detail').hidden = true;
        }
        await refresh(); notice('saved');
    }));
    bindForm('session-create', async (data, form) => {
        const view = currentView;
        const circle = selectedCircle;
        if (!circle) return;
        await api('POST', `/cohorts/${circle.id}/sessions`, { ...data, startsAt: new Date(String(data.startsAt)).getTime(), durationMinutes: Number(data.durationMinutes) });
        if (selectedCircle?.id === circle.id) { form.reset(); await showCircle(circle); }
        notice('saved', false, view);
    });
    $('checkout-start').addEventListener('click', () => void work($('checkout-start'), async () => {
        if (!user) { location.assign('/account?next=%2Fplans'); return; }
        if (state.billing?.provider === 'digetpay') {
            $('digetpay-checkout').hidden = false;
            $('digetpay-checkout').querySelector('input').focus();
            return;
        }
        checkout = await api('POST', '/billing/checkout', {});
        $('test-checkout').hidden = false; $('test-checkout').focus();
    }));
    bindForm('digetpay-checkout', async (data) => {
        try {
            providerOrder = await api('POST', '/billing/checkout', { phone: String(data.phone).trim() });
            renderBilling();
            if (providerOrder.redirectUrl) {
                // Defense in depth: the backend also validates the exact origin,
                // checkout path and session ID before persisting this URL.
                const url = new URL(providerOrder.redirectUrl);
                if (!['https://pay-staging.digetpay.com', 'https://fin-admin.digetpay.com'].includes(url.origin)
                    || url.pathname !== '/pay/checkout') throw new Error('CHECKOUT_UNCONFIGURED');
                location.assign(url.href);
            }
        } catch (error) {
            ({ order: providerOrder } = await api('GET', '/billing/latest'));
            renderBilling();
            throw error;
        }
    });
    $('payment-verify').addEventListener('click', () => void work($('payment-verify'), async () => {
        if (!providerOrder) return;
        providerOrder = await api('POST', `/billing/checkout/${encodeURIComponent(providerOrder.id)}/verify`, {});
        await refresh();
    }));
    document.querySelectorAll('[data-checkout-outcome]').forEach((element) => { element.addEventListener('click', () => void work(element, async () => {
        const outcome = element.getAttribute('data-checkout-outcome');
        await api('POST', `/billing/checkout/${checkout.id}/complete`, { token: checkout.token, outcome });
        checkout = null; $('test-checkout').hidden = true;
        await refresh();
        notice(outcome === 'success' ? 'checkoutSuccess' : outcome === 'declined' ? 'checkoutDeclined' : 'checkoutCanceled');
    })); });
    $('billing-cancel').addEventListener('click', () => void work($('billing-cancel'), async () => {
        await api('POST', '/billing/cancellation', { cancelAtPeriodEnd: !state.benefits.subscription.cancel_at_period_end });
        await refresh(); notice('saved');
    }));
    bindForm('mfa-enroll', async (data, form) => {
        const result = await api('POST', '/security/mfa/enroll', data);
        form.reset(); enrolling = true;
        $('mfa-secret').hidden = false; $('mfa-qr').src = result.qr; $('mfa-key').textContent = result.secret;
    });
    bindForm('mfa-verify', async (data, form) => {
        const result = await api('POST', '/security/mfa/verify', { ...data, activate: enrolling });
        form.reset(); enrolling = false; $('mfa-secret').hidden = true; $('mfa-key').textContent = ''; $('mfa-qr').removeAttribute('src');
        if (result.recoveryCodes.length) {
            $('recovery').hidden = false; $('recovery-codes').textContent = result.recoveryCodes.join('\n');
        }
        await refresh(); notice(result.recoveryCodes.length ? 'securitySaved' : 'mfaReady');
    });
    bindForm('bootstrap', async (data, form) => { await api('POST', '/staff/bootstrap', data); form.reset(); await refresh(); notice('saved'); });
    bindForm('staff-grant', async (data, form) => { await api('POST', '/staff/roles', data); form.reset(); await refresh(); notice('saved'); });
    bindForm('staff-user-search', searchStaffUsers);
    bindForm('announcement-form', async (data, form) => { await api('POST', '/staff/announcement', data); form.reset(); notice('saved'); });
    $('video-gate').addEventListener('click', () => void work($('video-gate'), async () => {
        await api('POST', '/staff/video', { disabled: $('video-gate').dataset.disabled !== 'true' }); await renderStaff();
    }));
    $('platform-backup').addEventListener('click', () => void work($('platform-backup'), async () => { await api('POST', '/staff/backup', {}); notice('saved'); }));
    $('clear-announcement').addEventListener('click', () => void work($('clear-announcement'), async () => { await api('DELETE', '/staff/announcement'); notice('saved'); }));
    async function boot() {
        if (invitedToken) $('invite-token').value = invitedToken.slice(0, 200);
        try {
            user = await global.HalaAuth.getUser();
            identityKnown = true;
            if (user) await refresh();
            else {
                const catalog = await api('GET', '/catalog');
                state = { mode: catalog.mode, billing: catalog, benefits: { plan: { id: 'free' }, features: {} } };
                render(); showView();
            }
            if (user && state.billing?.provider === 'digetpay') {
                ({ order: providerOrder } = await api('GET', '/billing/latest'));
                const returnedId = new URLSearchParams(location.search).get('checkout');
                if (returnedId) {
                    try { providerOrder = await api('POST', `/billing/checkout/${encodeURIComponent(returnedId)}/verify`, {}); }
                    catch (error) { noticeError(error); }
                    await refresh();
                }
                renderBilling();
            }
        } catch (error) {
            noticeError(error);
            core.showUnavailable(null, () => global.location.reload());
            showView();
        } finally { $('loading').hidden = true; }
    }
    global.HalaPlatform = {context:()=>({user,state,progress}),refresh};
    void boot();
})();
