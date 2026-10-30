(() => {
    const g = /** @type {any} */ (window),
        core = g.HalaCore,
        $ = (id) => /** @type {any} */ (document.getElementById(id));
    const t = (key) => core.t(key) || key,
        api = (method, path, body) =>
            core.requestJson(method, `/api/platform/study${path}`, body, {
                'X-Halastudy-Account': owner || g.HalaPlatform.context().user?.id || '',
            });
    const n = (tag, text = '', cls = '') => {
        const e = /** @type {any} */ (document.createElement(tag));
        e.textContent = text;
        e.className = cls;
        return e;
    };
    const tr = (tag, key, cls = '') => {
        const e = n(tag, t(key), cls);
        e.setAttribute('data-lang', key);
        return e;
    };
    const number = (value) => Number(value).toLocaleString(core.getLang() === 'ar' ? 'ar-SA' : 'en-US');
    const date = (value) => g.HalaSchedule.format(value, core.getLang());
    const obsolete = Symbol('obsolete-study-response');
    let owner = null,
        data = null,
        agenda = [],
        saved = [],
        insights = null,
        journal = [],
        next = null,
        editing = null,
        circle = null,
        resourceRequest = 0,
        loadRequest = 0,
        journalRequest = 0,
        resourceDraft = null;
    let busy = false,
        tab = 'tasks',
        routine = null,
        routineBusy = false,
        reflectionId = null,
        reflectionVersion = 0,
        expiredPause = null;
    const sections = {},
        tabs = {},
        mountedForms = [];
    const root = $('study-workspace');
    root.className = 'study-tools';
    const status = n('p', '', 'study-status');
    status.id = 'study-status';
    status.setAttribute('role', 'status');
    status.hidden = true;
    root.closest('main').prepend(status);
    const retry = btn('studyRetry', () => load());
    retry.hidden = true;
    status.after(retry);
    function message(key, error = false) {
        if (key) status.setAttribute('data-lang', key);
        else status.removeAttribute('data-lang');
        status.textContent = key ? t(key) : '';
        status.hidden = !key;
        status.classList.toggle('error', error);
    }
    function failure(error, background = false) {
        if (error?.code === 'AUTH_ACCOUNT_CHANGED' && !background) {
            // A different account now owns the cookies; never show this account's drafts to it.
            root.closest('main').hidden = true;
            location.reload();
            return;
        }
        if (['AUTH_REQUIRED', 'AUTH_ACCOUNT_CHANGED'].includes(error?.code)) {
            // Keep every draft in the DOM; signing in again and retrying continues from here.
            message(error.code === 'AUTH_REQUIRED' ? 'studySignedOut' : 'studyAccountChanged', true);
            retry.hidden = false;
            return;
        }
        message(g.HalaPlatformCopy.en[error?.code] ? error.code : 'studyUnavailable', true);
    }
    function confirmed(key) {
        return window.confirm(t(key));
    }
    function btn(key, action) {
        const b = tr('button', key);
        b.type = 'button';
        b.addEventListener('click', () => void work(b, action));
        return b;
    }
    async function work(button, action) {
        button.disabled = true;
        try {
            await action();
        } catch (error) {
            failure(error);
        } finally {
            button.disabled = false;
        }
    }
    function link(key, href) {
        const e = tr('a', key, 'button');
        e.href = href;
        return e;
    }
    function field(form, key, name, type = 'text', value = /** @type {any} */ (''), options = null) {
        const label = tr('span', key),
            wrap = n('label');
        let input;
        if (options) {
            input = n('select');
            for (const [v, k] of options) {
                const option = tr('option', k);
                option.value = v;
                input.append(option);
            }
        } else input = n(type === 'textarea' ? 'textarea' : 'input');
        if (type !== 'textarea' && !options) input.type = type;
        if (type === 'checkbox') value = 'on';
        input.name = name;
        input.id = `${form.id}-${name}`;
        input.value = String(value);
        if (options) for (const option of input.options) option.defaultSelected = option.value === String(value);
        else input.defaultValue = String(value);
        wrap.append(label, input);
        form.querySelector('.study-fields').append(wrap);
        return input;
    }
    function form(parent, id, key, action, successKey = 'studySaved') {
        const f = n('form', '', 'form-grid');
        f.id = id;
        f.append(n('div', '', 'study-fields'));
        const b = tr('button', key, 'primary');
        b.type = 'submit';
        f.append(b);
        f.addEventListener('submit', (e) => {
            e.preventDefault();
            void work(b, async () => {
                const refreshed = await action(Object.fromEntries(new FormData(f)), f);
                if (refreshed !== obsolete)
                    message(refreshed === false ? 'studySavedRefreshFailed' : successKey, refreshed === false);
            });
        });
        parent.append(f);
        mountedForms.push(f);
        return f;
    }
    function section(parent, key) {
        const s = n('section');
        s.append(tr('h2', key));
        parent.append(s);
        return s;
    }
    function empty(key) {
        return tr('p', key, 'empty');
    }
    function rows(host, items, key) {
        host.replaceChildren(...(items.length ? items : [empty(key)]));
    }
    function row(title, detail, actions = []) {
        const e = n('div', '', 'row'),
            meta = n('div', '', 'row-main'),
            a = n('div', '', 'actions');
        meta.append(n('strong', title), n('small', detail));
        a.append(...actions);
        e.append(meta, a);
        return e;
    }
    function requestId(f) {
        if (!f.dataset.request) f.dataset.request = crypto.randomUUID();
        return f.dataset.request;
    }
    function resetForm(f) {
        f.reset();
        delete f.dataset.request;
        delete f.dataset.dirty;
    }
    function options(select, items, first) {
        const value = select.value;
        select.replaceChildren(
            ...[['', first], ...items].map(([id, name]) => {
                const e = n('option', name);
                e.value = id;
                return e;
            }),
        );
        if ([...select.options].some((o) => o.value === value)) select.value = value;
    }
    const nav = n('div', '', 'study-tabs');
    nav.setAttribute('aria-label', t('planStudy'));
    nav.setAttribute('data-lang-aria', 'planStudy');
    root.append(nav);
    for (const [key, label] of Object.entries({
        tasks: 'tasksTab',
        routines: 'routinesTab',
        library: 'libraryTab',
        agenda: 'agendaTab',
        insights: 'insightsTab',
    })) {
        const b = btn(label, () => {
            tab = key;
            showTab();
            if (owner) return requestLoad();
        });
        tabs[key] = b;
        nav.append(b);
        const s = n('div');
        s.id = `study-tab-${key}`;
        sections[key] = s;
        b.setAttribute('aria-controls', s.id);
        root.append(s);
    }
    function showTab() {
        for (const key of Object.keys(sections)) {
            sections[key].hidden = key !== tab;
            tabs[key].setAttribute('aria-pressed', String(key === tab));
        }
    }
    showTab();
    // The form remains mounted during refreshes and language/theme changes.
    const tasks = section(sections.tasks, 'tasksTab');
    const taskForm = form(tasks, 'study-task', 'addTask', async (values, f) => {
        const lines = String(values.steps)
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
        const remaining = [...(editing?.steps || [])];
        const usedIds = new Set(remaining.map((step) => step.id));
        let sequence = 0;
        const steps = lines.map((text) => {
            const index = remaining.findIndex((step) => step.text === text);
            const previous = index < 0 ? null : remaining.splice(index, 1)[0];
            let id = previous?.id;
            if (!id) {
                // The form key keeps newly inserted steps stable after a lost response.
                do { id = `${requestId(f)}-${sequence++}`; } while (usedIds.has(id));
                usedIds.add(id);
            }
            return {
                id,
                text,
                done: previous?.done || false,
            };
        });
        const payload = { ...values, steps, project_id: values.project_id || null };
        if (editing)
            await api('PATCH', `/tasks/${editing.id}`, {
                ...payload,
                version: editing.version,
            });
        else await api('POST', '/tasks', { ...payload, requestId: requestId(f) });
        editing = null;
        resetForm(f);
        taskForm.querySelector('button[type=submit]').setAttribute('data-lang', 'addTask');
        taskForm.querySelector('button[type=submit]').textContent = t('addTask');
        cancelEdit.hidden = true;
        return load();
    });
    const taskTitle = field(taskForm, 'taskTitle', 'title');
    taskTitle.required = true;
    taskTitle.maxLength = 120;
    const projectSelect = field(taskForm, 'taskProject', 'project_id', 'text', '', []);
    const due = field(taskForm, 'taskDue', 'due_date', 'date');
    due.min = '2000-01-01';
    due.max = '2199-12-31';
    field(taskForm, 'taskPriority', 'priority', 'text', 'normal', [
        ['low', 'low'],
        ['normal', 'normal'],
        ['high', 'high'],
    ]);
    field(taskForm, 'taskRepeat', 'recurrence', 'text', 'none', [
        ['none', 'none'],
        ['daily', 'daily'],
        ['workdays', 'workdays'],
        ['weekly', 'weekly'],
    ]);
    const estimate = field(taskForm, 'estimate', 'estimate_minutes', 'number', 25);
    estimate.min = 1;
    estimate.max = 240;
    estimate.required = true;
    const note = field(taskForm, 'taskNote', 'note', 'textarea');
    note.maxLength = 2000;
    const stepsInput = field(taskForm, 'stepsLabel', 'steps', 'textarea');
    stepsInput.maxLength = 2419;
    stepsInput.parentElement.className = 'wide';
    const taskDetails = n('details'),
        optionalFields = n('div', '', 'study-fields');
    taskDetails.append(tr('summary', 'taskDetails'), optionalFields);
    for (const child of [...taskForm.querySelector('.study-fields').children].slice(1)) optionalFields.append(child);
    taskTitle.parentElement.className = 'wide';
    taskDetails.id = 'study-task-details';
    taskForm.insertBefore(taskDetails, taskForm.querySelector('button'));
    const cancelEdit = btn('cancelEdit', () => {
        editing = null;
        resetForm(taskForm);
        taskForm.querySelector('button[type=submit]').setAttribute('data-lang', 'addTask');
        taskForm.querySelector('button[type=submit]').textContent = t('addTask');
        cancelEdit.hidden = true;
    });
    cancelEdit.hidden = true;
    taskForm.append(cancelEdit);
    const filterWrap = n('div', '', 'study-fields');
    tasks.append(filterWrap);
    const filterForm = n('div');
    filterForm.id = 'study-filter';
    filterForm.append(filterWrap);
    tasks.append(filterForm);
    const taskFilter = field(filterForm, 'taskFilter', 'filter', 'text', 'open', [
        ['open', 'allTasks'],
        ['today', 'todayTasks'],
        ['upcoming', 'upcomingTasks'],
        ['overdue', 'overdueTasks'],
        ['completed', 'completedTasks'],
    ]);
    taskFilter.addEventListener('change', renderTasks);
    const taskList = n('div');
    taskList.id = 'study-task-list';
    tasks.append(taskList);
    const projects = section(sections.tasks, 'projectsTitle');
    projects.append(tr('p', 'projectHint', 'note'));
    const projectForm = form(projects, 'study-project', 'addProject', async (values, f) => {
        await api('POST', '/projects', { ...values, requestId: requestId(f) });
        resetForm(f);
        return load();
    });
    const projectName = field(projectForm, 'projectName', 'name');
    projectName.maxLength = 60;
    projectName.required = true;
    projectName.parentElement.className = 'wide';
    const projectList = n('div');
    projects.append(projectList);
    const distractions = section(sections.tasks, 'distractionsTitle');
    distractions.append(tr('p', 'distractionHint', 'note'));
    const thoughtForm = form(distractions, 'study-thought', 'addThought', async (values, f) => {
        await api('POST', '/distractions', {
            ...values,
            requestId: requestId(f),
        });
        resetForm(f);
        return load();
    });
    const thought = field(thoughtForm, 'thought', 'text', 'textarea');
    thought.maxLength = 500;
    thought.required = true;
    thought.parentElement.className = 'wide';
    const thoughtList = n('div');
    thoughtList.id = 'study-thought-list';
    distractions.append(thoughtList);
    function editTask(task) {
        editing = structuredClone(task);
        for (const key of ['title', 'project_id', 'due_date', 'priority', 'recurrence', 'estimate_minutes', 'note'])
            taskForm.elements.namedItem(key).value = task[key] ?? '';
        stepsInput.value = task.steps.map((s) => s.text).join('\n');
        taskDetails.open = true;
        cancelEdit.hidden = false;
        taskForm.querySelector('button[type=submit]').setAttribute('data-lang', 'saveTask');
        taskForm.querySelector('button[type=submit]').textContent = t('saveTask');
        taskTitle.focus();
        taskForm.scrollIntoView({ block: 'start' });
    }
    // Row actions read the newest known record, not the one captured when the row rendered.
    function latest(kind, item) {
        return data?.[kind]?.find((x) => x.id === item.id) || item;
    }
    function remember(kind, record) {
        const list = data?.[kind];
        const index = list && record?.id ? list.findIndex((x) => x.id === record.id) : -1;
        if (index >= 0 && Number(record.version) >= Number(list[index].version)) list[index] = record;
        if (kind === 'tasks' && record && editing?.id === record.id) {
            editing.version = record.version;
            editing.steps = structuredClone(record.steps);
        }
    }
    async function patch(kind, item, changes) {
        const fresh = latest(kind, item);
        remember(
            kind,
            await api('PATCH', `/${kind}/${item.id}`, {
                ...(typeof changes === 'function' ? changes(fresh) : changes),
                version: fresh.version,
            }),
        );
        await load();
    }
    function renderTasks() {
        if (!data) return;
        const filter = taskFilter.value,
            today = data.today;
        const matches = data.tasks.filter((task) =>
            filter === 'completed'
                ? task.completed
                : !task.completed &&
                  (filter === 'open' ||
                      (filter === 'today' && task.due_date === today) ||
                      (filter === 'upcoming' && task.due_date > today) ||
                      (filter === 'overdue' && task.due_date && task.due_date < today)),
        );
        matches.sort(
            (a, b) =>
                ({ high: 0, normal: 1, low: 2 })[a.priority] - { high: 0, normal: 1, low: 2 }[b.priority] ||
                String(a.due_date || '9999').localeCompare(b.due_date || '9999'),
        );
        rows(
            taskList,
            matches.map((task) => {
                const detail = [
                    t(task.priority),
                    task.due_date || '',
                    data.projects.find((p) => p.id === task.project_id)?.name || t('noProject'),
                    `${t('actualEffort')}: ${number(Math.floor(Number(task.actual_ms) / 60000))} / ${number(task.estimate_minutes)}`,
                ]
                    .filter(Boolean)
                    .join(' · ');
                const e = row(task.title, detail, [
                    btn(task.completed ? 'reopenTask' : 'completeTask', async () => {
                        remember(
                            'tasks',
                            await api('POST', `/tasks/${task.id}/complete`, {
                                completed: !task.completed,
                                version: latest('tasks', task).version,
                            }),
                        );
                        await load();
                    }),
                    btn('editItem', () => editTask(latest('tasks', task))),
                    btn('archiveItem', () =>
                        confirmed('archiveItemConfirm') ? patch('tasks', task, { archived: true }) : undefined,
                    ),
                ]);
                if (task.steps.length) {
                    const ul = n('ul', '', 'study-checklist');
                    for (const step of task.steps) {
                        const li = n('li'),
                            label = n('label'),
                            check = n('input');
                        check.type = 'checkbox';
                        check.checked = step.done;
                        check.disabled = task.completed;
                        label.append(check, n('span', step.text));
                        li.append(label);
                        ul.append(li);
                        check.addEventListener(
                            'change',
                            () =>
                                void work(check, async () => {
                                    try {
                                        await patch('tasks', task, (fresh) => ({
                                            steps: fresh.steps.map((s) => ({
                                                ...s,
                                                done: s.id === step.id ? check.checked : s.done,
                                            })),
                                        }));
                                    } catch (error) {
                                        check.checked = step.done;
                                        throw error;
                                    }
                                }),
                        );
                    }
                    e.querySelector('.row-main').append(ul);
                }
                return e;
            }),
            'tasksEmpty',
        );
        rows(
            projectList,
            data.projects.map((p) =>
                row(p.name, '', [
                    btn('archiveProject', () =>
                        confirmed('archiveProjectConfirm') ? patch('projects', p, { archived: true }) : undefined,
                    ),
                ]),
            ),
            'noData',
        );
        rows(
            thoughtList,
            data.distractions.map((d) =>
                row(d.text, d.resolved ? t('resolved') : '', [
                    ...(!d.resolved
                        ? [
                              btn('resolveThought', () => patch('distractions', d, { resolved: true })),
                              btn('toTask', async () => {
                                  await api('POST', `/distractions/${d.id}/convert`, {});
                                  await load();
                              }),
                          ]
                        : []),
                    btn('archiveItem', () =>
                        confirmed('archiveItemConfirm') ? patch('distractions', d, { archived: true }) : undefined,
                    ),
                ]),
            ),
            'distractionsEmpty',
        );
    }
    const routinesSection = section(sections.routines, 'routinesTab');
    routinesSection.append(tr('p', 'routineHint', 'note'));
    const routineForm = form(routinesSection, 'study-routine', 'addRoutine', async (values, f) => {
        await api('POST', '/routines', { ...values, requestId: requestId(f) });
        resetForm(f);
        return load();
    });
    const routineName = field(routineForm, 'routineName', 'name');
    routineName.maxLength = 60;
    routineName.required = true;
    for (const [key, name, value, min, max] of [
        ['workMinutes', 'focus_minutes', 25, 5, 120],
        ['breakMinutes', 'break_minutes', 5, 1, 30],
        ['longMinutes', 'long_break_minutes', 15, 5, 60],
        ['rounds', 'cycles', 4, 1, 8],
        ['longEvery', 'long_every', 2, 2, 8],
    ]) {
        const input = field(routineForm, key, name, 'number', value);
        input.min = min;
        input.max = max;
        input.required = true;
    }
    const routineList = n('div');
    routineList.id = 'study-routine-list';
    routinesSection.append(routineList);
    const focusRoot = $('study-focus-tools');
    focusRoot.className = 'study-tools';
    const pickers = n('div', '', 'study-focus-pickers');
    focusRoot.append(pickers);
    const pickerForm = n('div');
    pickerForm.id = 'study-focus';
    pickerForm.append(pickers);
    focusRoot.append(pickerForm);
    pickers.classList.add('study-fields');
    const focusTask = field(pickerForm, 'focusTask', 'task', 'text', '', []),
        focusRoutine = field(pickerForm, 'focusRoutine', 'routine', 'text', '', []);
    const attach = btn('attachTask', async () => {
        await bindFocus(g.HalaFocus.current().id);
        await load();
    });
    attach.hidden = true;
    focusRoot.append(attach);
    const guide = n('section', '', 'study-guide');
    guide.id = 'study-guide';
    guide.hidden = true;
    guide.append(tr('h2', 'routineGuide'));
    const guideLabel = n('p'),
        guideClock = n('output');
    guideClock.dir = 'ltr';
    guideClock.id = 'study-guide-clock';
    const guideState = n('p', '', 'note'),
        guideActions = n('div', '', 'actions');
    guide.append(guideLabel, guideClock, guideState, guideActions, tr('p', 'routineLocal', 'note'));
    focusRoot.append(guide);
    focusRoutine.addEventListener('change', () => void work(focusRoutine, () => chooseRoutine(focusRoutine.value)));
    function activeFocus() {
        return ['active', 'paused'].includes(g.HalaFocus.current()?.state);
    }
    function storeRoutine() {
        try {
            if (routine) localStorage.setItem(`halastudy:routine:${owner}`, JSON.stringify(routine));
            else localStorage.removeItem(`halastudy:routine:${owner}`);
        } catch {
            /* guidance stays in memory */
        }
    }
    function restoreRoutine() {
        try {
            const value = JSON.parse(localStorage.getItem(`halastudy:routine:${owner}`) || 'null'),
                savedRoutine = data?.routines.find((r) => r.id === value?.routine?.id);
            if (
                value &&
                savedRoutine &&
                ['focus', 'break', 'long'].includes(value.phase) &&
                ['ready', 'running', 'paused', 'awaiting', 'done'].includes(value.status) &&
                Number.isFinite(value.remaining) &&
                value.remaining >= 0 &&
                value.remaining <= 7200000 &&
                Number.isInteger(value.round) &&
                value.round >= 1 &&
                value.round <= savedRoutine.cycles &&
                Number.isFinite(value.stamp)
            ) {
                value.routine = { ...savedRoutine };
                const current = g.HalaFocus.current();
                const pausedElsewhere =
                    value.phase === 'focus' && value.sessionId === current?.id && current.state === 'paused';
                const stoppedAt =
                    pausedElsewhere && Number.isFinite(Number(current.last_seen_at))
                        ? Math.min(Date.now(), Number(current.last_seen_at))
                        : Date.now();
                routine = g.HalaRoutine.tick(value, stoppedAt);
                if (pausedElsewhere && routine.status === 'running') routine.status = 'paused';
                reconcileRoutineFocus();
            }
        } catch {
            routine = null;
        }
    }
    function reconcileRoutineFocus() {
        const current = g.HalaFocus.current();
        if (routine?.phase !== 'focus' || !routine.sessionId || routine.sessionId !== current?.id) return;
        if (current.state === 'paused' && routine.status === 'running') {
            routine = {
                ...g.HalaRoutine.tick(routine, Date.now()),
                status: 'paused',
            };
            storeRoutine();
        } else if (current.state === 'active' && routine.status === 'paused') {
            routine = g.HalaRoutine.transition(routine, 'start', Date.now());
            storeRoutine();
        } else if (current.state === 'completed' && ['running', 'paused'].includes(routine.status)) {
            routine = { ...routine, status: 'awaiting', remaining: 0 };
            storeRoutine();
        }
    }
    async function chooseRoutine(id) {
        if (activeFocus()) throw { code: 'routineBusy' };
        routine = id ? g.HalaRoutine.create(data.routines.find((r) => r.id === id)) : null;
        storeRoutine();
        renderGuide();
    }
    focusTask.addEventListener('change', () => {
        attach.hidden = !activeFocus() || !!data?.focusLink || !focusTask.value;
    });
    async function bindFocus(id) {
        if (focusTask.value) {
            const result = await api('PUT', `/focus/${id}/task`, {
                taskId: focusTask.value,
            });
            data.focusLink = result;
            renderFocus();
        }
    }
    async function startGuidedFocus() {
        const session = await g.HalaFocus.start();
        // Starting focus and attaching its task are separate server operations.
        routine.sessionId = session.id;
        routine = g.HalaRoutine.transition(routine, 'start', Date.now());
        storeRoutine();
        await bindFocus(session.id);
    }
    async function routineAction(action) {
        if (!routine || routineBusy) return;
        routineBusy = true;
        try {
            const current = g.HalaFocus.current();
            if (
                action !== 'stop' &&
                routine.phase === 'focus' &&
                routine.sessionId &&
                activeFocus() &&
                current.id !== routine.sessionId
            )
                throw { code: 'routineChanged' };
            if (action === 'start') {
                if (routine.phase === 'focus') {
                    if (routine.status === 'ready' && activeFocus()) throw { code: 'routineBusy' };
                    await startGuidedFocus();
                } else routine = g.HalaRoutine.transition(routine, 'start', Date.now());
            } else if (action === 'pause') {
                if (routine.phase === 'focus' && current?.id === routine.sessionId && current.state === 'active')
                    await g.HalaFocus.pause();
                routine = g.HalaRoutine.transition(routine, 'pause', Date.now());
            } else if (action === 'next') {
                if (routine.phase === 'focus' && current?.id === routine.sessionId && activeFocus())
                    await g.HalaFocus.complete();
                routine = g.HalaRoutine.transition(routine, 'next', Date.now());
                if (routine.phase === 'focus' && routine.status === 'ready') {
                    await startGuidedFocus();
                }
                await g.HalaPlatform.refresh();
            } else if (action === 'stop') {
                if (routine.phase === 'focus' && current?.id === routine.sessionId && current.state === 'active')
                    await g.HalaFocus.pause();
                routine = null;
                focusRoutine.value = '';
            }
        } finally {
            routineBusy = false;
            storeRoutine();
            renderGuide();
        }
    }
    function renderGuide() {
        guide.hidden = !routine;
        if (!routine) {
            $('focus-start').disabled = false;
            focusRoutine.disabled = activeFocus();
            return;
        }
        guideLabel.textContent = `${routine.routine.name} · ${t('routineRound')} ${number(routine.round)}/${number(routine.routine.cycles)} · ${t({ focus: 'routineFocus', break: 'routineBreak', long: 'routineLong' }[routine.phase])}`;
        guideState.textContent = t(
            routine.status === 'done'
                ? 'routineDone'
                : routine.status === 'running'
                  ? {
                        focus: 'routineFocus',
                        break: 'routineBreak',
                        long: 'routineLong',
                    }[routine.phase]
                  : 'routineWaiting',
        );
        guideActions.replaceChildren();
        if (['ready', 'paused'].includes(routine.status))
            guideActions.append(
                btn(routine.status === 'ready' ? 'routineBegin' : 'routineResume', () => routineAction('start')),
            );
        if (routine.status === 'running') guideActions.append(btn('routinePause', () => routineAction('pause')));
        if (routine.status === 'awaiting')
            guideActions.append(
                btn(
                    routine.phase !== 'focus'
                        ? 'routineNextRound'
                        : routine.round === routine.routine.cycles
                          ? 'routineFinish'
                          : 'routineNext',
                    () => routineAction('next'),
                ),
            );
        guideActions.append(btn('routineStop', () => routineAction('stop')));
        updateGuideClock();
        $('focus-start').disabled = routine.status !== 'done';
    }
    function updateGuideClock() {
        if (!routine) return;
        const seconds = Math.ceil(routine.remaining / 1000);
        guideClock.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    }
    function renderFocus() {
        if (!data) return;
        const taskOptions = data.tasks.filter((task) => !task.completed).map((task) => [task.id, task.title]);
        if (data.focusLink && !taskOptions.some(([id]) => id === data.focusLink.task_id))
            taskOptions.push([data.focusLink.task_id, data.focusLink.task_title]);
        options(focusTask, taskOptions, t('unlinked'));
        if (activeFocus() && data.focusLink) focusTask.value = data.focusLink.task_id;
        options(
            focusRoutine,
            data.routines.map((r) => [r.id, r.name]),
            t('noRoutine'),
        );
        if (routine) focusRoutine.value = routine.routine.id;
        focusTask.disabled = activeFocus() && !!data.focusLink;
        focusRoutine.disabled = activeFocus() || !!routine;
        attach.hidden = !activeFocus() || !!data.focusLink || !focusTask.value;
        renderGuide();
    }
    // A completed session can be revisited from the journal at any time.
    const reflectionRoot = $('study-reflection');
    reflectionRoot.className = 'study-tools';
    reflectionRoot.hidden = true;
    reflectionRoot.append(tr('h2', 'reflectionTitle'));
    const reflectionForm = form(reflectionRoot, 'study-reflect', 'saveReflection', async (values) => {
        await api('PUT', `/focus/${reflectionId}/reflection`, {
            ...values,
            version: reflectionVersion,
        });
        reflectionRoot.hidden = true;
        try {
            return await loadJournal();
        } catch (error) {
            failure(error);
            retry.hidden = false;
            return false;
        }
    });
    field(reflectionForm, 'outcome', 'outcome', 'text', 'partial', [
        ['done', 'done'],
        ['partial', 'partial'],
        ['continue', 'continue'],
    ]);
    const reflectionNote = field(reflectionForm, 'reflectionNote', 'note', 'textarea');
    reflectionNote.maxLength = 1000;
    function openReflection(session) {
        reflectionId = session.id;
        reflectionVersion = session.reflection_version || 0;
        reflectionForm.elements.namedItem('outcome').value = session.outcome || 'partial';
        reflectionNote.value = session.note || '';
        reflectionRoot.hidden = false;
        if (location.hash !== '#progress') location.hash = 'progress';
        reflectionNote.focus();
    }
    const favorites = section(sections.library, 'favoritesTitle');
    favorites.append(tr('p', 'favoriteHint', 'note'));
    const bookmarkForm = form(favorites, 'study-bookmark', 'saveRoom', async (values, f) => {
        await api('POST', '/bookmarks', { roomId: String(values.roomId).trim() });
        resetForm(f);
        return load();
    });
    const roomId = field(bookmarkForm, 'roomCode', 'roomId');
    roomId.required = true;
    roomId.maxLength = 50;
    roomId.dir = 'ltr';
    const favoriteList = n('div');
    favoriteList.id = 'study-favorites';
    favorites.append(favoriteList);
    const agendaSection = section(sections.agenda, 'agendaTitle');
    const zone = n('p', '', 'note');
    agendaSection.append(
        zone,
        link('calendarExport', '/api/platform/study/calendar.ics'),
        tr('p', 'calendarHint', 'note'),
    );
    const agendaList = n('div');
    agendaList.id = 'study-agenda';
    agendaSection.append(agendaList);
    const reminders = section(sections.agenda, 'remindersTitle');
    reminders.append(tr('p', 'reminderHint', 'note'));
    const reminderForm = form(reminders, 'study-reminders', 'savePreferences', async (values, f) => {
        const refreshed = await savePreferences({
            reminders: values.reminders === 'on',
            reminder_minutes: Number(values.reminder_minutes),
        });
        delete f.dataset.dirty;
        return refreshed;
    });
    const reminderOn = field(reminderForm, 'remindersOn', 'reminders', 'checkbox');
    reminderOn.parentElement.className = 'study-check';
    field(reminderForm, 'reminderLead', 'reminder_minutes', 'text', '5', [
        [1, '1'],
        [5, '5'],
        [10, '10'],
        [15, '15'],
    ]);
    // Numeric option labels do not enter the translation dictionary.
    for (const option of reminderForm.querySelectorAll('option')) {
        option.removeAttribute('data-lang');
        option.textContent = number(option.value);
    }
    const permissionStatus = n('p', '', 'note');
    permissionStatus.setAttribute('role', 'status');
    reminders.append(
        btn('browserPermission', async () => {
            let granted = false;
            try {
                granted = 'Notification' in window && (await Notification.requestPermission()) === 'granted';
            } catch {}
            permissionStatus.textContent = t(granted ? 'notificationEnabled' : 'notificationDenied');
        }),
        permissionStatus,
    );
    const reminderBanner = n('div', '', 'study-alert');
    reminderBanner.id = 'study-reminder-banner';
    reminderBanner.hidden = true;
    reminderBanner.setAttribute('role', 'status');
    root.closest('main').prepend(reminderBanner);
    const insightsSection = section(sections.insights, 'studyInsightsTitle');
    const targetSection = section(insightsSection, 'goalsTitle');
    targetSection.append(tr('p', 'goalsHint', 'note'));
    const targetForm = form(targetSection, 'study-targets', 'savePreferences', async (values, f) => {
        const refreshed = await savePreferences({
            daily_target: Number(values.daily_target),
            weekly_target: Number(values.weekly_target),
        });
        delete f.dataset.dirty;
        return refreshed;
    });
    for (const [key, name, max] of [
        ['dailyTarget', 'daily_target', 240],
        ['weeklyTarget', 'weekly_target', 1680],
    ]) {
        const input = field(targetForm, key, name, 'number', 0);
        input.min = 0;
        input.max = max;
        input.required = true;
    }
    for (const f of [reminderForm, targetForm])
        f.addEventListener('input', () => {
            f.dataset.dirty = 'true';
        });
    async function savePreferences(changes) {
        data.preferences = await api('PUT', '/preferences', {
            ...data.preferences,
            ...changes,
        });
        return load();
    }
    const insightNumbers = n('div', '', 'metrics'),
        targetBars = n('div'),
        chartTitle = tr('h3', 'dailyActivity'),
        chart = n('div', '', 'study-chart'),
        allocationTitle = tr('h3', 'projectAllocation'),
        allocation = n('div');
    insightsSection.append(insightNumbers, targetBars, chartTitle, chart, allocationTitle, allocation);
    const journalSection = section(sections.insights, 'journalTitle');
    const historyLimit = n('p', '', 'note');
    journalSection.append(historyLimit);
    const journalForm = form(journalSection, 'study-journal', 'journalSearch', async () => loadJournal(), '');
    const search = field(journalForm, 'searchJournal', 'q', 'search');
    search.maxLength = 80;
    field(journalForm, 'fromDate', 'from', 'date');
    field(journalForm, 'toDate', 'to', 'date');
    field(journalForm, 'sessionState', 'state', 'text', '', [
        ['', 'anyState'],
        ['completed', 'completed'],
        ['abandoned', 'abandoned'],
        ['active', 'active'],
        ['paused', 'paused'],
    ]);
    const journalProject = field(journalForm, 'taskProject', 'projectId', 'text', '', []);
    const journalList = n('div');
    journalList.id = 'study-journal-list';
    journalSection.append(journalList);
    const more = btn('moreHistory', () => loadJournal(true));
    more.hidden = true;
    journalSection.append(more);
    journalForm.addEventListener('input', () => {
        next = null;
        more.hidden = true;
    });
    async function loadJournal(append = false) {
        if (!owner) return;
        const request = ++journalRequest,
            account = owner,
            params = new URLSearchParams();
        for (const [k, v] of new FormData(journalForm)) if (String(v)) params.set(k, String(v));
        if (append && next) for (const [k, v] of Object.entries(next)) params.set(k, String(v));
        let result;
        try {
            result = await api('GET', `/journal?${params}`);
        } catch (error) {
            if (request !== journalRequest || owner !== account) return obsolete;
            throw error;
        }
        if (request !== journalRequest || owner !== account) return obsolete;
        journal = append ? [...journal, ...result.sessions] : result.sessions;
        next = result.next;
        historyLimit.textContent = `${t('historyLimit')}: ${number(result.historyDays)}`;
        renderJournal();
        return true;
    }
    function renderJournal() {
        rows(
            journalList,
            journal.map((s) =>
                row(
                    s.task_title || date(s.started_at),
                    `${date(s.started_at)} · ${t(s.state)} · ${number(Math.floor(Number(s.credited_ms) / 60000))} ${t('creditedMinutes')}${s.project_name ? ` · ${s.project_name}` : ''}${s.note ? ` · ${s.note}` : ''}`,
                    s.state === 'completed' ? [btn('reflectAction', () => openReflection(s))] : [],
                ),
            ),
            'journalEmpty',
        );
        more.hidden = !next;
    }
    function renderInsights() {
        if (!insights) return;
        insightNumbers.replaceChildren(
            ...[
                ['todayMinutesStudy', insights.todayMinutes],
                ['weekMinutesStudy', insights.weekMinutes],
                ['lastSeven', insights.lastSeven],
                ['previousSeven', insights.previousSeven],
            ].map(([key, value]) => {
                const e = n('div', '', 'metric');
                e.append(n('strong', number(value)), tr('span', key));
                return e;
            }),
        );
        chart.replaceChildren(
            ...insights.days.map((d) => {
                const e = n('div', '', 'study-day'),
                    time = n('time', d.day.slice(5));
                time.dateTime = d.day;
                e.dataset.active = String(d.minutes > 0);
                e.append(time, n('strong', number(d.minutes)));
                e.title = `${d.day}: ${number(d.minutes)} ${t('creditedMinutes')}`;
                return e;
            }),
        );
        rows(
            allocation,
            insights.projects.map((p) =>
                row(p.project_name || t('unassigned'), `${number(p.minutes)} ${t('creditedMinutes')}`),
            ),
            'noData',
        );
        targetBars.replaceChildren();
        for (const [key, value, target] of [
            ['todayMinutesStudy', insights.todayMinutes, data.preferences.daily_target],
            ['weekMinutesStudy', insights.weekMinutes, data.preferences.weekly_target],
        ])
            if (target > 0) {
                const label = n('label', `${t(key)}: ${number(value)} / ${number(target)}`),
                    bar = n('progress');
                bar.max = target;
                bar.value = Math.min(value, target);
                label.append(bar);
                targetBars.append(label);
            }
    }
    function renderAgenda() {
        zone.textContent = `${t('localZone')} ${g.HalaSchedule.zone()}`;
        rows(
            agendaList,
            agenda.map((s) => {
                const item = row(
                    s.title,
                    `${s.circle_name} · ${date(s.starts_at)} · ${number(s.duration_minutes)} ${t('sessionMinutes')} · ${number(s.going)} ${t('goingCount')}`,
                    [link('joinSession', `/study?room=${encodeURIComponent(s.room_id)}`)],
                );
                const f = n('div');
                f.id = `study-rsvp-${s.id}`;
                f.className = 'study-fields';
                const wrapper = n('div', '', 'study-fields');
                f.append(wrapper);
                const select = field(f, 'rsvpLabel', 'status', 'text', s.status || '', [
                    ['', 'anyState'],
                    ['going', 'going'],
                    ['maybe', 'maybe'],
                    ['declined', 'declined'],
                ]);
                select.addEventListener('change', () => {
                    if (select.value)
                        void work(select, async () => {
                            await api('PUT', `/agenda/${s.id}/rsvp`, {
                                status: select.value,
                            });
                            await load();
                        });
                });
                item.querySelector('.row-main').append(f);
                return item;
            }),
            'agendaEmpty',
        );
    }
    const resourcesRoot = $('study-resources');
    resourcesRoot.className = 'study-tools study-resources';
    function render() {
        if (!data) return;
        if (editing) {
            // Keep the typed draft, but save against the newest version and step states.
            const fresh = data.tasks.find((x) => x.id === editing.id);
            if (fresh) {
                editing.version = fresh.version;
                editing.steps = structuredClone(fresh.steps);
            }
        }
        renderTasks();
        renderFocus();
        renderInsights();
        renderAgenda();
        options(
            projectSelect,
            data.projects.map((p) => [p.id, p.name]),
            t('noProject'),
        );
        options(
            journalProject,
            data.projects.map((p) => [p.id, p.name]),
            t('anyState'),
        );
        rows(
            routineList,
            data.routines.map((r) =>
                row(
                    r.name,
                    `${number(r.focus_minutes)} / ${number(r.break_minutes)} / ${number(r.long_break_minutes)} · ${number(r.cycles)} ${t('rounds')}`,
                    [
                        btn('useRoutine', async () => {
                            await chooseRoutine(r.id);
                            location.hash = 'progress';
                        }),
                        btn('archiveItem', () =>
                            confirmed('archiveItemConfirm') ? patch('routines', r, { archived: true }) : undefined,
                        ),
                    ],
                ),
            ),
            'routinesEmpty',
        );
        rows(
            favoriteList,
            saved.map((s) =>
                row(s.available ? s.name : t('roomUnavailable'), s.available ? s.roomId : '', [
                    ...(s.available ? [link('joinSession', `/study?room=${encodeURIComponent(s.roomId)}`)] : []),
                    btn('removeSaved', async () => {
                        if (!confirmed('removeSavedConfirm')) return;
                        await api('DELETE', `/bookmarks/${s.id}`);
                        await load();
                    }),
                ]),
            ),
            'favoritesEmpty',
        );
        if (!targetForm.dataset.dirty)
            for (const key of ['daily_target', 'weekly_target'])
                targetForm.elements.namedItem(key).value = data.preferences[key];
        if (!reminderForm.dataset.dirty) {
            reminderOn.checked = data.preferences.reminders;
            reminderForm.elements.namedItem('reminder_minutes').value = data.preferences.reminder_minutes;
        }
    }
    let pendingLoad = false;
    function requestLoad() {
        // A refresh that arrives mid-load runs once the current load settles.
        if (busy) {
            pendingLoad = true;
            return undefined;
        }
        return load();
    }
    async function load() {
        const user = g.HalaPlatform.context().user;
        if (!user) {
            owner = null;
            data = null;
            return obsolete;
        }
        const request = ++loadRequest;
        busy = true;
        retry.hidden = true;
        message('studyLoading');
        try {
            const results = await Promise.all([
                api('GET', '/overview'),
                api('GET', '/agenda'),
                api('GET', '/bookmarks'),
                api('GET', '/insights'),
            ]);
            if (request !== loadRequest) return obsolete;
            if (g.HalaPlatform.context().user?.id !== user.id) {
                // The account changed mid-load: reload for the new account once this settles.
                pendingLoad = true;
                return obsolete;
            }
            const changed = owner !== user.id;
            owner = user.id;
            [data, { sessions: agenda }, { bookmarks: saved }, insights] = results;
            if (changed) {
                for (const f of mountedForms) resetForm(f);
                routine = null;
                restoreRoutine();
            }
            render();
            const journalResult = await loadJournal();
            if (request === loadRequest && g.HalaPlatform.context().user?.id !== user.id) pendingLoad = true;
            if (request !== loadRequest || g.HalaPlatform.context().user?.id !== user.id || journalResult === obsolete)
                return obsolete;
            message('');
            return true;
        } catch (error) {
            if (request === loadRequest && g.HalaPlatform.context().user?.id !== user.id) pendingLoad = true;
            if (request !== loadRequest || g.HalaPlatform.context().user?.id !== user.id) return obsolete;
            failure(error);
            retry.hidden = false;
            return false;
        } finally {
            if (request === loadRequest) {
                busy = false;
                if (pendingLoad) {
                    pendingLoad = false;
                    void load();
                }
            }
        }
    }
    async function loadResources(selected) {
        const oldForm = $('study-resource');
        if (oldForm && circle)
            resourceDraft = {
                circleId: circle.id,
                owner,
                values: Object.fromEntries(new FormData(oldForm)),
                requestId: oldForm.dataset.request,
            };
        const request = ++resourceRequest;
        circle = selected;
        resourcesRoot.replaceChildren();
        if (!circle) return obsolete;
        const circleId = circle.id;
        resourcesRoot.append(tr('h3', 'resourcesTitle'), tr('p', 'resourcesHint', 'note'));
        try {
            const result = await api('GET', `/circles/${circleId}/resources`);
            if (request !== resourceRequest || circle?.id !== circleId) return obsolete;
            const list = n('div');
            list.id = 'study-resource-list';
            resourcesRoot.append(list);
            rows(
                list,
                result.resources.map((r) => {
                    const a = link('openResource', r.url);
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    return row(r.title, r.note, [
                        a,
                        ...(result.canManage
                            ? [
                                  btn('archiveItem', async () => {
                                      if (!confirmed('archiveResourceConfirm')) return;
                                      await api('DELETE', `/circles/${circleId}/resources/${r.id}`);
                                      await loadResources(circle);
                                  }),
                              ]
                            : []),
                    ]);
                }),
                'resourcesEmpty',
            );
            if (result.canManage) {
                const f = form(resourcesRoot, 'study-resource', 'addResource', async (values, f) => {
                    await api('POST', `/circles/${circleId}/resources`, {
                        ...values,
                        requestId: requestId(f),
                    });
                    resetForm(f);
                    resourceDraft = null;
                    return loadResources(circle);
                });
                const title = field(f, 'resourceTitle', 'title');
                title.required = true;
                title.maxLength = 100;
                const url = field(f, 'resourceUrl', 'url', 'url');
                url.required = true;
                url.maxLength = 2048;
                url.dir = 'ltr';
                const note = field(f, 'resourceNote', 'note', 'textarea');
                note.maxLength = 1000;
                if (resourceDraft?.circleId === circleId && resourceDraft.owner === owner) {
                    for (const [key, value] of Object.entries(resourceDraft.values))
                        f.elements.namedItem(key).value = value;
                    if (resourceDraft.requestId) f.dataset.request = resourceDraft.requestId;
                }
            }
            return true;
        } catch (error) {
            if (request !== resourceRequest || circle?.id !== circleId) return obsolete;
            resourcesRoot.append(
                empty('studyUnavailable'),
                btn('studyRetry', () => loadResources(circle)),
            );
            failure(error);
            return false;
        }
    }
    const notified = new Set();
    let reminderBusy = false;
    function reminderKey(s) {
        return `halastudy:reminder:${owner}:${s.id}:${s.starts_at}`;
    }
    function dismissed(s) {
        try {
            return !!localStorage.getItem(reminderKey(s));
        } catch {
            return false;
        }
    }
    function dueReminder(s, prefs) {
        return (
            s.status !== 'declined' &&
            Number(s.starts_at) >= Date.now() &&
            Number(s.starts_at) - Date.now() <= prefs.reminder_minutes * 60000
        );
    }
    async function remind() {
        if (reminderBusy || !owner || !data?.preferences.reminders) return;
        const candidate = agenda.find(
            (s) => dueReminder(s, data.preferences) && !notified.has(reminderKey(s)) && !dismissed(s),
        );
        if (!candidate) return;
        reminderBusy = true;
        const account = owner;
        try {
            // Recheck current cookies, membership, cancellation and opt-in before revealing a title.
            const [fresh, prefs] = await Promise.all([api('GET', '/agenda'), api('GET', '/preferences')]);
            if (owner !== account) return;
            agenda = fresh.sessions;
            data.preferences = prefs;
            if (permissionStatus.textContent === t('studyUnavailable')) permissionStatus.textContent = '';
            const s = agenda.find((s) => s.id === candidate.id && dueReminder(s, prefs));
            if (!s || !prefs.reminders || dismissed(s)) {
                reminderBanner.hidden = true;
                return;
            }
            const key = reminderKey(s);
            notified.add(key);
            reminderBanner.dataset.key = key;
            reminderBanner.hidden = false;
            reminderBanner.replaceChildren(
                n('strong', t('sessionSoon')),
                n('p', `${s.title} · ${date(s.starts_at)}`),
                btn('dismissReminder', () => {
                    try {
                        localStorage.setItem(key, String(Date.now()));
                    } catch {}
                    reminderBanner.hidden = true;
                }),
            );
            if ('Notification' in window && Notification.permission === 'granted')
                try {
                    new Notification(t('sessionSoon'), {
                        body: `${s.title} · ${date(s.starts_at)}`,
                        tag: key,
                    });
                } catch {}
        } catch (error) {
            reminderBanner.hidden = true;
            if (['AUTH_REQUIRED', 'AUTH_ACCOUNT_CHANGED'].includes(error?.code)) {
                agenda = [];
                // Background timer: report only, never reload over the user's drafts.
                failure(error, true);
            } else permissionStatus.textContent = t('studyUnavailable');
        } finally {
            reminderBusy = false;
        }
    }
    setInterval(() => {
        if (routine && !routineBusy) {
            const before = routine.status;
            routine = g.HalaRoutine.tick(routine, Date.now());
            if (before !== routine.status) {
                storeRoutine();
                renderGuide();
            } else updateGuideClock();
            if (
                routine.phase === 'focus' &&
                routine.status === 'awaiting' &&
                g.HalaFocus.current()?.id === routine.sessionId &&
                g.HalaFocus.current()?.state === 'active' &&
                !expiredPause
            ) {
                expiredPause = g.HalaFocus.pause()
                    .catch(failure)
                    .finally(() => {
                        expiredPause = null;
                    });
            }
        }
        void remind();
    }, 1000);
    window.addEventListener('storage', (event) => {
        if (event.key === `halastudy:routine:${owner}`) {
            routine = null;
            restoreRoutine();
            renderFocus();
        }
        if (event.key === reminderBanner.dataset.key) reminderBanner.hidden = true;
    });
    let platformSnapshot = null;
    window.addEventListener('halaplatformcontext', () => {
        const context = g.HalaPlatform.context();
        const changed = context.state !== platformSnapshot || context.user?.id !== owner;
        platformSnapshot = context.state;
        // A language-only render must not clear feedback from a failed save.
        if (changed || !data) void requestLoad();
    });
    window.addEventListener('halastudyrefresh', () => {
        void requestLoad();
    });
    window.addEventListener(
        'halacirclechange',
        (event) => void loadResources(/** @type {CustomEvent} */ (event).detail),
    );
    window.addEventListener('halafocuschange', () => {
        if (data) {
            if (!activeFocus() || data.focusLink?.session_id !== g.HalaFocus.current()?.id) data.focusLink = null;
            focusTask.disabled = activeFocus() && !!data.focusLink;
            focusRoutine.disabled = activeFocus() || !!routine;
            attach.hidden = !activeFocus() || !!data.focusLink || !focusTask.value;
        }
        const current = g.HalaFocus.current();
        if (current?.state === 'completed' && reflectionId !== current.id) {
            reflectionId = current.id;
            reflectionVersion = 0;
            reflectionNote.value = '';
            reflectionRoot.hidden = false;
        }
        reconcileRoutineFocus();
        renderGuide();
    });
    core.onLangChange(() => {
        render();
        renderJournal();
        if (circle) void loadResources(circle);
    });
    g.HalaStudy = { bindFocus };
    if (g.HalaPlatform.context().user) void load();
})();
