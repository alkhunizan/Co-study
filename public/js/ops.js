(() => {
    const global = /** @type {any} */ (window);
    const core = global.HalaCore;
    const $ = (id) => /** @type {any} */ (document.getElementById(id));
    const sections = {
        overview: { title: 'opsOverview', permission: null }, rooms: { title: 'opsRooms', permission: 'operations.read' },
        users: { title: 'opsUsers', permission: 'cases.manage' }, reports: { title: 'opsReports', permission: 'cases.read' },
        billing: { title: 'opsBilling', permission: 'billing.read' }, access: { title: 'opsAccess', permission: 'staff.read' },
        audit: { title: 'opsAudit', permission: 'audit.read' }, system: { title: 'opsSystem', permission: 'operations.read' }
    };
    const dynamicIds = ['staff-overview', 'ops-attention', 'staff-alerts', 'staff-live-rooms', 'staff-users', 'staff-roles',
        'staff-cases', 'staff-billing', 'payment-orders', 'payment-orders-more', 'staff-audit', 'ops-system-status'];
    const t = (key) => core.t(key) || key;
    const date = (value) => value ? global.HalaSchedule.format(value, core.getLang()) : '—';
    const pendingWrites = new Set();
    const drafts = new Map();
    const draftOpeners = new WeakMap();
    async function api(method, route, body = undefined) {
        if (method === 'GET') return core.requestJson(method, `/api/platform${route}`, body);
        if (pendingWrites.has(route)) throw Object.assign(new Error('Action pending'), { code: 'opsActionPending', status: 409 });
        pendingWrites.add(route);
        try { return await core.requestJson(method, `/api/platform${route}`, body); }
        finally { pendingWrites.delete(route); }
    }
    let state = null;
    let user = null;
    let current = 'overview';
    let revision = 0;
    let viewRevision = 0;
    let checking = false;
    let paymentCursor = '';
    let records = { rooms: [], cases: [], audit: [] };
    const allowed = (section) => !!state?.roles?.length && (!sections[section].permission || state.permissions.includes(sections[section].permission));
    const can = (permission) => !!state?.permissions?.includes(permission);
    const routeSection = () => Object.hasOwn(sections, location.pathname.split('/')[2]) ? location.pathname.split('/')[2] : 'overview';
    const roleName = (role) => t({ super_admin: 'roleSuperAdmin', admin: 'roleAdmin', moderator: 'roleModerator', support: 'roleSupport', billing_operator: 'roleBilling' }[role] || role);
    function node(tag, text = '', className = '') {
        const element = document.createElement(tag);
        element.textContent = text; element.className = className;
        return element;
    }
    function button(label, action) {
        const control = node('button', label);
        control.type = 'button'; control.addEventListener('click', () => action(control));
        return control;
    }
    function row(title, detail, actions = []) {
        const item = node('div', '', 'row');
        const main = node('div', '', 'row-main');
        main.append(node('strong', title), node('small', detail)); item.append(main);
        if (actions.length) {
            const controls = node('div', '', 'actions'); controls.append(...actions); item.append(controls);
            actions.forEach(control => { draftOpeners.get(control)?.(); });
        }
        return item;
    }
    function fill(id, items, empty = 'opsNoResults') { $(id).replaceChildren(...(items.length ? items : [node('p', t(empty), 'empty')])); }
    function link(section, label = t(sections[section].title)) {
        const anchor = node('a', label, 'button');
        anchor.href = `/ops/${section}`; anchor.dataset.section = section;
        return anchor;
    }
    function feedback(key = '', error = false) {
        $('feedback').textContent = key ? t(key) : '';
        $('feedback').hidden = !key; $('feedback').classList.toggle('error', error);
    }
    function focusDestination() {
        return !$('ops-retry').hidden ? $('ops-retry') : !$('ops-gate').hidden ? $('ops-gate-title') : $('ops-title');
    }
    function restoreFocus(previous, preferred = previous) {
        // Do not take focus back if the operator moved to another control.
        if (document.activeElement !== document.body && document.activeElement !== previous) return;
        const usable = element => element instanceof HTMLElement && element.isConnected
            && !element.matches(':disabled') && element.getClientRects().length > 0;
        const target = usable(preferred) ? preferred : focusDestination();
        if (usable(target)) target.focus({ preventScroll: true });
    }
    function clearSensitive() {
        dynamicIds.forEach(id => { $(id).replaceChildren(); });
        records = { rooms: [], cases: [], audit: [] };
        $('ops-content').hidden = true;
        document.querySelectorAll('[data-ops-panel]').forEach(panel => { panel.setAttribute('hidden', ''); });
        ['staff-monitoring-status', 'ops-video-status', 'ops-updated'].forEach(id => { $(id).textContent = ''; });
    }
    function gate(title, body) {
        drafts.clear();
        clearSensitive(); $('ops-gate').hidden = false;
        $('ops-gate-title').textContent = t(title); $('ops-gate-body').textContent = t(body);
        ['ops-login', 'ops-mfa', 'ops-security-link', 'ops-return'].forEach(id => { $(id).hidden = true; });
        ['staff-grant', 'announcement-form', 'ops-mfa'].forEach(id => { $(id).reset(); });
    }
    function navigation() {
        const available = Object.keys(sections).filter(allowed);
        $('ops-nav').hidden = !available.length; $('ops-mobile-navigation').hidden = !available.length;
        document.querySelectorAll('#ops-nav a').forEach(anchor => {
            const section = anchor.getAttribute('data-section');
            anchor.toggleAttribute('hidden', !available.includes(section));
            if (section === current) anchor.setAttribute('aria-current', 'page'); else anchor.removeAttribute('aria-current');
        });
        $('ops-section-select').replaceChildren(...available.map(section => {
            const option = document.createElement('option'); option.value = section; option.textContent = t(sections[section].title); return option;
        }));
        $('ops-section-select').value = available.includes(current) ? current : '';
        $('staff-identity').textContent = user ? `${user.displayName} · ${(state?.roles || []).map(roleName).join('، ')}` : '';
    }
    function details(item, values) {
        const detail = document.createElement('details'); detail.append(node('summary', t('opsDetails')));
        for (const [label, value] of values) detail.append(node('p', `${t(label)}: ${value || '—'}`));
        item.querySelector('.row-main').append(detail); return detail;
    }
    async function mutate(control, action, success = 'saved', companions = []) {
        if (control.disabled) return;
        const started = viewRevision;
        const actorId = user?.id;
        const section = current;
        const focused = document.activeElement;
        const restoreControl = focused === control || control.form?.contains(focused);
        const stillCurrent = () => started === viewRevision && actorId === user?.id;
        const reconcileReturnedView = async () => {
            // A returned view may have loaded before this write committed. Refresh
            // its current query without replaying feedback or disturbing a gate.
            if (actorId === user?.id && current === section && state?.staffVerified && allowed(current)) await load();
        };
        const controls = [control, ...companions].map(target => ({ target, disabled: target.disabled }));
        controls.forEach(({ target }) => { target.disabled = true; }); feedback();
        try {
            const result = await action();
            if (!stillCurrent()) { await reconcileReturnedView(); return; }
            const refreshed = revision + 1;
            await load();
            if (stillCurrent() && revision === refreshed && !$('ops-content').hidden) feedback(typeof result === 'string' ? result : success);
        } catch (error) {
            const uncertain = !error.status || error.status >= 500;
            if (!stillCurrent()) {
                if (uncertain || error.status === 401 || error.status === 403) await reconcileReturnedView();
                return;
            }
            if (uncertain || error.status === 401 || error.status === 403) {
                const refreshed = revision + 1;
                await load();
                if (!stillCurrent() || revision !== refreshed) return;
            }
            feedback(uncertain ? 'opsActionUnconfirmed' : core.t(error.code) ? error.code : 'genericError', true);
        } finally {
            controls.forEach(({ target, disabled }) => { target.disabled = disabled; });
            if (restoreControl && stillCurrent()) restoreFocus(focused);
        }
    }
    function bindDraft(form, key, fields, action, companions = []) {
        const values = () => Object.fromEntries(Object.entries(fields).map(([name, input]) => [name, input.value]));
        const initial = JSON.stringify(values());
        const remembered = drafts.get(key);
        if (remembered) Object.entries(fields).forEach(([name, input]) => { input.value = remembered[name]; });
        const remember = () => {
            const value = values();
            if (JSON.stringify(value) === initial) drafts.delete(key); else drafts.set(key, value);
        };
        remember();
        if (drafts.has(key)) form.prepend(node('p', t('opsDraftRestored'), 'note'));
        form.addEventListener('input', remember); form.addEventListener('change', remember);
        form.addEventListener('submit', event => {
            event.preventDefault(); const submitted = values();
            void mutate(form.querySelector('button[type="submit"]'), async () => {
                const result = await action(submitted);
                if (JSON.stringify(drafts.get(key)) === JSON.stringify(submitted)) drafts.delete(key);
                return result;
            }, 'saved', companions);
        });
        return drafts.has(key);
    }
    function reasonAction(label, route, perform, extra = false, intent = '') {
        const key = `${route}:${intent}`;
        const open = (control, focus) => {
            const form = document.createElement('form'); form.className = 'form-grid';
            const reasonLabel = node('label', t('actionReason'));
            const reason = document.createElement('input'); reason.required = true; reason.minLength = 3; reason.maxLength = 250;
            reasonLabel.append(reason); form.append(reasonLabel);
            const reference = document.createElement('input'); reference.maxLength = 36; reference.dir = 'ltr';
            if (extra) { const labelNode = node('label', t('transactionHint')); labelNode.append(reference); form.append(labelNode); }
            const submit = node('button', label); submit.type = 'submit';
            const cancel = button(t('opsCancel'), () => { drafts.delete(key); form.remove(); control.hidden = false; control.focus(); });
            const actions = node('div', '', 'actions'); actions.append(submit, cancel); form.append(actions);
            bindDraft(form, key, { reason, reference }, data => perform(route, data.reason, data.reference), [cancel]);
            control.closest('.row').append(form); control.hidden = true; if (focus) reason.focus();
        };
        const control = button(label, target => open(target, true));
        if (drafts.has(key) && !pendingWrites.has(route)) draftOpeners.set(control, () => open(control, false));
        return control;
    }
    function monitoring(operations) {
        return t(operations.monitoring?.storageHealthy === false ? 'alertStorage' : operations.monitoring?.deliveryConfigured ? 'alertExternal' : 'alertLocal');
    }
    function backupText(operations) {
        return operations.backup?.failed ? t('opsBackupFailed') : operations.backup?.lastRunAt ? date(operations.backup.lastRunAt) : t('opsNoBackup');
    }
    async function overview(call) {
        const [counts, operations, cases, payments] = await Promise.all([
            can('operations.read') ? call('/staff/overview') : null,
            can('operations.read') ? call('/staff/operations') : null,
            can('cases.read') ? call('/staff/cases') : null,
            can('billing.read') && state.billing?.provider === 'digetpay' ? call('/staff/payment-orders') : null
        ]);
        $('staff-overview').hidden = !counts;
        if (counts) $('staff-overview').replaceChildren(...Object.entries(counts).map(([key, value]) => {
            const metric = node('div', '', 'metric'); metric.append(node('strong', String(value)), node('span', t(key))); return metric;
        }));
        const attention = [];
        const pending = cases?.cases.filter(entry => ['open', 'investigating'].includes(entry.status)) || [];
        if (pending.length) attention.push(row(t('opsReviewReports'), String(pending.length), [link('reports')]));
        if (payments?.orders.length) attention.push(row(t('opsReviewPayments'), `${payments.orders.length}${payments.nextCursor ? ` · ${t('opsMorePayments')}` : ''}`, [link('billing')]));
        if (operations && (operations.backup?.failed || !operations.backup?.lastRunAt)) attention.push(row(t('opsBackup'), backupText(operations), [link('system')]));
        fill('ops-attention', attention, 'opsNoAttention');
        $('ops-alert-summary').hidden = !operations;
        if (operations) {
            $('staff-monitoring-status').textContent = monitoring(operations);
            fill('staff-alerts', (operations.alerts || []).filter(entry => !entry.resolvedAt).map(entry => row(t(entry.event), `${entry.count} · ${date(entry.lastSeenAt)}`)), 'alertsEmpty');
        }
    }
    function renderRooms() {
        const query = $('ops-room-query').value.toLowerCase().trim();
        fill('staff-live-rooms', records.rooms.filter(entry => `${entry.name} ${entry.id}`.toLowerCase().includes(query)).map(entry => {
            const actions = [];
            if (can('operations.manage')) {
                if (entry.id !== 'LOBBY') actions.push(reasonAction(t('closeRoom'), `/staff/rooms/${encodeURIComponent(entry.id)}/close`, (route, reason) => api('POST', route, { reason })));
                for (const person of entry.participants) actions.push(reasonAction(`${t('kickParticipant')}: ${person.name}`, `/staff/rooms/${encodeURIComponent(entry.id)}/kick`,
                    (route, reason) => api('POST', route, { reason, socketId: person.socketId }), false, person.socketId));
            }
            return row(entry.name, `${entry.id} · ${entry.participants.length} ${t('participants')}`, actions);
        }), 'opsNoRooms');
    }
    async function users(call) {
        const result = await call(`/staff/users?q=${encodeURIComponent($('staff-query').value)}`);
        fill('staff-users', result.users.map(entry => row(entry.displayName,
            `${entry.id} · ${t(entry.banned ? 'opsMemberBanned' : 'opsMemberActive')}`,
            entry.id === user.id ? [] : [reasonAction(t(entry.banned ? 'unbanAccount' : 'banAccount'), `/staff/users/${encodeURIComponent(entry.id)}/status`, (route, reason) =>
                api('POST', route, { reason, banned: !entry.banned }), false, entry.banned ? 'unban' : 'ban')])), 'opsNoUsers');
    }
    function renderCases() {
        const status = $('ops-case-status').value;
        const query = $('ops-case-query').value.toLowerCase().trim();
        fill('staff-cases', records.cases.filter(entry => (!status || entry.status === status)
            && `${entry.reason} ${t(entry.reason)} ${entry.detail} ${entry.id} ${entry.room_id || ''}`.toLowerCase().includes(query)).map(entry => {
            const item = row(t(entry.reason), entry.detail);
            item.querySelector('.row-main').append(node('span', t(entry.status), 'ops-status'));
            const detail = details(item, [['opsRoom', entry.room_id], ['opsTarget', entry.target_id], ['opsCaseOwner', entry.assigned_to], ['opsDisposition', entry.disposition]]);
            if (can('cases.manage')) {
                const form = document.createElement('form'); form.className = 'form-grid';
                const select = document.createElement('select'); select.setAttribute('aria-label', t('opsStatus'));
                for (const value of ['investigating', 'resolved', 'dismissed']) { const option = node('option', t(value)); option.value = value; select.append(option); }
                select.value = entry.status === 'open' ? 'investigating' : entry.status;
                const statusLabel = node('label', t('opsStatus')); statusLabel.append(select);
                const reason = document.createElement('input'); reason.required = true; reason.maxLength = 500; reason.value = entry.disposition || '';
                const reasonLabel = node('label', t('disposition')); reasonLabel.append(reason);
                const submit = node('button', t('opsSaveCase')); submit.type = 'submit'; form.append(statusLabel, reasonLabel, submit);
                if (bindDraft(form, `case:${entry.id}`, { status: select, disposition: reason }, data => api('PATCH', `/staff/cases/${encodeURIComponent(entry.id)}`, data))) detail.open = true;
                detail.append(form);
            }
            return item;
        }), 'opsNoCases');
    }
    async function billing(call) {
        const [subscriptions, result] = await Promise.all([
            call('/staff/subscriptions'), state.billing?.provider === 'digetpay' ? call(`/staff/payment-orders${paymentCursor ? `?cursor=${encodeURIComponent(paymentCursor)}` : ''}`) : null
        ]);
        fill('staff-billing', subscriptions.subscriptions.map(entry => row(`VIP · US$4.99 · ${entry.mode}`, `${entry.user_id} · ${t(entry.status)} · ${date(entry.period_end)}`)), 'opsNoSubscriptions');
        $('payment-review-section').hidden = !result;
        if (!result) return;
        fill('payment-orders', result.orders.map(entry => row(entry.id,
            `${entry.user_id} · ${t(entry.status)} · ${date(entry.created_at)}${entry.last_error ? ` · ${entry.last_error}` : ''}`,
            can('staff.manage') ? [reasonAction(t(entry.status === 'review' ? 'activateReviewedPayment' : 'recheckPayment'), `/staff/payment-orders/${encodeURIComponent(entry.id)}/recheck`, async (route, reason, reference) => {
                const checked = await api('POST', route, {
                    reason, transactionId: reference.trim() || undefined, activateReview: entry.status === 'review'
                });
                return ({ completed: 'paymentCompleted', refunded: 'paymentRefunded', expired: 'paymentExpired', review: 'paymentReview', unknown: 'paymentReview', creating: 'paymentReview' })[checked.status] || 'paymentPending';
            }, result.lookup === 'transaction', entry.status === 'review' ? 'activate' : 'recheck')] : [])));
        const controls = [];
        if (paymentCursor) controls.push(button(t('opsFirstOrders'), () => { paymentCursor = ''; void load(); }));
        if (result.nextCursor) controls.push(button(t('olderOrders'), () => { paymentCursor = result.nextCursor; void load(); }));
        $('payment-orders-more').replaceChildren(...controls);
    }
    async function access(call) {
        const result = await call('/staff');
        $('staff-grant').hidden = !can('staff.manage');
        fill('staff-roles', result.assignments.map(entry => row(entry.display_name, `${roleName(entry.role)} · ${entry.user_id}`,
            can('staff.manage') ? [button(t('revoke'), control => {
                const controls = control.parentElement; control.hidden = true;
                const confirm = button(t('opsConfirmRevoke'), target => void mutate(target, () => api('POST', '/staff/roles', { userId: entry.user_id, role: entry.role, remove: true }), 'opsRevokeDone', [cancel]));
                const cancel = button(t('opsCancel'), () => { confirm.remove(); cancel.remove(); control.hidden = false; control.focus(); });
                controls.append(confirm, cancel); confirm.focus();
            })] : [])), 'opsNoRoles');
    }
    function renderAudit() {
        const query = $('ops-audit-query').value.toLowerCase().trim();
        fill('staff-audit', records.audit.filter(entry => `${entry.action} ${entry.actor_id || ''} ${entry.resource_id || ''}`.toLowerCase().includes(query)).map(entry => {
            const item = row(entry.action, `${entry.actor_id || '—'} · ${date(entry.created_at)}`);
            const detail = details(item, [['opsTarget', entry.resource_id], ['opsActor', entry.actor_id]]);
            if (Object.keys(entry.detail || {}).length) { const pre = node('pre', JSON.stringify(entry.detail, null, 2)); pre.dir = 'ltr'; detail.append(pre); }
            return item;
        }), 'opsNoAudit');
    }
    async function system(call) {
        const operations = await call('/staff/operations');
        fill('ops-system-status', [row(t('opsBackup'), backupText(operations)), row(t('opsMonitoring'), monitoring(operations))]);
        $('ops-video-status').textContent = t(operations.videoDisabled ? 'opsVideoOff' : 'opsVideoOn');
        $('video-gate').hidden = !can('operations.manage'); $('announcement-form').hidden = !can('operations.manage');
        $('platform-backup').hidden = !can('backups.manage');
        $('video-gate').dataset.disabled = String(operations.videoDisabled);
        $('video-gate').textContent = t(operations.videoDisabled ? 'enableVideo' : 'disableVideo');
    }
    async function load(focus = false) {
        const started = ++revision;
        const focused = document.activeElement;
        const restore = focus || focused === $('ops-refresh') || focused === $('ops-retry')
            || $('ops-content').contains(focused) || $('ops-gate').contains(focused);
        const next = routeSection(); if (next !== current) paymentCursor = '';
        current = next; clearSensitive(); feedback();
        $('ops-gate').hidden = true; $('ops-retry').hidden = true; $('loading').hidden = false;
        $('ops-refresh').disabled = true;
        $('main').setAttribute('aria-busy', 'true');
        $('ops-title').textContent = t(sections[current].title);
        $('ops-description').textContent = t(`${sections[current].title}Body`);
        document.title = `${t(sections[current].title)} — Halastudy`;
        const ensureCurrent = () => { if (started !== revision) throw Object.assign(new Error('stale'), { stale: true }); };
        const call = async (route) => { const result = await api('GET', route); ensureCurrent(); return result; };
        try {
            const account = await global.HalaAuth.refreshUser(); ensureCurrent();
            if (user && account?.id !== user.id) { location.reload(); return; }
            user = account;
            if (!user) {
                state = null; navigation(); gate('opsSignInTitle', 'opsSignInBody');
                $('ops-login').href = `/account?next=${encodeURIComponent(`/ops/${current}`)}`; $('ops-login').hidden = false; return;
            }
            const fresh = await call('/me');
            if (state && JSON.stringify(fresh.permissions) !== JSON.stringify(state.permissions)) drafts.clear();
            state = fresh; navigation();
            if (!state.roles.length) { gate('opsNoStaffTitle', 'opsNoStaffBody'); return; }
            if (!state.staffVerified) {
                gate('opsVerifyTitle', state.mfaEnabled ? 'opsVerifyBody' : 'opsSetupBody');
                $('ops-mfa').hidden = !state.mfaEnabled; $('ops-security-link').hidden = false; return;
            }
            if (!allowed(current)) { gate('opsDeniedTitle', 'opsDeniedBody'); $('ops-return').hidden = false; return; }
            if (current === 'overview') await overview(call);
            if (current === 'rooms') { records.rooms = (await call('/staff/rooms')).rooms; renderRooms(); }
            if (current === 'users') await users(call);
            if (current === 'reports') { records.cases = (await call('/staff/cases')).cases; renderCases(); }
            if (current === 'billing') await billing(call);
            if (current === 'access') await access(call);
            if (current === 'audit') { records.audit = (await call('/staff/audit')).events; renderAudit(); }
            if (current === 'system') await system(call);
            ensureCurrent();
            document.querySelector(`[data-ops-panel="${current}"]`).removeAttribute('hidden');
            $('ops-content').hidden = false;
            $('ops-updated').textContent = `${t('opsUpdated')}: ${date(Date.now())}`;
        } catch (error) {
            if (error.stale || started !== revision) return;
            if (error.status === 401 || error.status === 403) drafts.clear();
            clearSensitive();
            if (error.code === 'AUTH_ACCOUNT_CHANGED') { location.reload(); return; }
            feedback(error.status === 401 || error.status === 403 ? 'opsAccessChanged' : 'opsUnavailable', true);
            $('ops-retry').hidden = false;
        } finally {
            if (started === revision) {
                $('loading').hidden = true; $('ops-refresh').disabled = false; $('main').removeAttribute('aria-busy');
                if (restore) restoreFocus(focused, focus || !$('ops-retry').hidden || !$('ops-gate').hidden ? focusDestination() : focused);
            }
        }
    }
    function openView(focus = false) { viewRevision++; void load(focus); }
    function navigate(section) {
        if (!Object.hasOwn(sections, section)) return;
        history.pushState(null, '', `/ops/${section}`); openView(true);
    }
    document.addEventListener('click', event => {
        const click = /** @type {MouseEvent} */ (event);
        const target = event.target instanceof Element ? event.target.closest('a[data-section]') : null;
        if (!target || click.button || click.ctrlKey || click.metaKey || click.shiftKey || click.altKey) return;
        event.preventDefault(); navigate(target.getAttribute('data-section'));
    });
    function bind(id, action) {
        $(id).addEventListener('submit', event => {
            event.preventDefault(); const form = event.currentTarget;
            const started = revision;
            const submitted = Object.fromEntries(new FormData(form));
            void mutate(form.querySelector('button'), async () => {
                await action(submitted);
                // A late save must not clear a draft edited while it was pending.
                if (started === revision && JSON.stringify(Object.fromEntries(new FormData(form))) === JSON.stringify(submitted)) form.reset();
            });
        });
    }
    bind('staff-grant', data => api('POST', '/staff/roles', data));
    bind('announcement-form', data => api('POST', '/staff/announcement', data));
    bind('ops-mfa', data => api('POST', '/security/mfa/verify', data));
    $('staff-user-search').addEventListener('submit', event => { event.preventDefault(); openView(); });
    $('ops-room-query').addEventListener('input', renderRooms);
    $('ops-case-query').addEventListener('input', renderCases);
    $('ops-case-status').addEventListener('change', renderCases);
    $('ops-audit-query').addEventListener('input', renderAudit);
    $('ops-section-select').addEventListener('change', event => navigate(event.target.value));
    $('ops-refresh').addEventListener('click', () => void load());
    $('ops-retry').addEventListener('click', () => void load());
    $('theme-toggle').addEventListener('click', core.toggleTheme);
    $('video-gate').addEventListener('click', () => void mutate($('video-gate'), () => api('POST', '/staff/video', { disabled: $('video-gate').dataset.disabled !== 'true' })));
    $('platform-backup').addEventListener('click', () => void mutate($('platform-backup'), () => api('POST', '/staff/backup', {})));
    $('clear-announcement').addEventListener('click', () => void mutate($('clear-announcement'), () => api('DELETE', '/staff/announcement')));
    window.addEventListener('popstate', () => openView(true));
    async function checkAccess() {
        if (checking || !user || document.hidden || $('ops-content').hidden) return;
        checking = true; const started = revision;
        try {
            const fresh = await api('GET', '/me');
            if (started !== revision) return;
            if (!fresh.staffVerified || JSON.stringify(fresh.permissions) !== JSON.stringify(state.permissions)) { viewRevision++; await load(); }
        } catch (error) {
            if (started !== revision) return;
            if (error.status === 401) { await load(); return; }
            const focused = document.activeElement;
            const restore = $('ops-content').contains(focused);
            if (error.status === 403) drafts.clear();
            revision++; clearSensitive(); feedback(error.status === 403 ? 'opsAccessChanged' : 'opsUnavailable', true); $('ops-retry').hidden = false;
            if (restore) restoreFocus(focused, $('ops-retry'));
        } finally { checking = false; }
    }
    window.addEventListener('focus', () => void checkAccess());
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void checkAccess(); });
    setInterval(() => void checkAccess(), 30000);
    if (location.pathname === '/ops' || location.pathname === '/ops/') history.replaceState(null, '', '/ops/overview');
    core.initLang(global.HalaOpsCopy);
    core.onLangChange(() => openView());
    void load();
})();
