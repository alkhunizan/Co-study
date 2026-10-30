const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createDatabase } = require('../../services/platform/database');
const { createStudyPlanner } = require('../../services/platform/study-planner');
const {
	createStudyCommunity,
	agendaCalendar,
} = require('../../services/platform/study-community');
const { createProgress } = require('../../services/platform/progress');
const { createCohorts } = require('../../services/platform/cohorts');
const { createEntitlements } = require('../../services/platform/catalog');
const { createBilling } = require('../../services/platform/billing');
const {
	backupDatabase,
	restoreDatabase,
} = require('../../services/platform/maintenance');
const { hash } = require('../../services/platform/common');

test('twenty study tools preserve ownership, trusted time, retries and lifecycle', {
	timeout: 120000,
}, async (t) => {
	const db = await createDatabase();
	t.after(() => db.close());
	let time = Date.parse('2026-10-22T20:58:00Z');
	const now = () => time;
	const a = crypto.randomUUID(),
		b = crypto.randomUUID(),
		c = crypto.randomUUID();
	for (const id of [a, b, c])
		await db.query(
			'INSERT INTO halastudy.users(id,display_name,created_at) VALUES($1,$2,$3)',
			[id, id, now()],
		);
	const study = createStudyPlanner(db, now),
		progress = createProgress(db, now);
	const cohorts = createCohorts(db, createEntitlements(db, 'test', now), now);
	const community = createStudyCommunity(db, cohorts, now);
	const create = (kind, data, user = a) =>
		study.create(user, kind, { requestId: crypto.randomUUID(), ...data });
	const taskData = {
		title: 'Study algebra',
		note: 'Private note',
		priority: 'high',
		due_date: '2026-10-22',
		recurrence: 'none',
		estimate_minutes: 25,
		steps: [{ id: 'one', text: 'Chapter one', done: false }],
	};
	let project, task, session, circle, scheduled;
	await t.test(
		'F01-F04 private CRUD, checklists, dates, priorities, version conflict and archive',
		async () => {
			project = await create('projects', { name: 'Math' });
			const input = {
				...taskData,
				project_id: project.id,
				requestId: crypto.randomUUID(),
			};
			task = await study.create(a, 'tasks', input);
			assert.equal((await study.create(a, 'tasks', input)).id, task.id);
			await assert.rejects(
				study.create(a, 'tasks', { ...input, title: 'Changed retry' }),
				/STUDY_RETRY_CONFLICT/,
			);
			await assert.rejects(
				study.update(b, 'tasks', task.id, { title: 'Stolen', version: 1 }),
				/STUDY_NOT_FOUND/,
			);
			await assert.rejects(
				create('tasks', { ...taskData, project_id: project.id }, b),
				/STUDY_NOT_FOUND/,
			);
			task = await study.update(a, 'tasks', task.id, {
				version: 1,
				steps: [{ ...task.steps[0], done: true }],
				priority: 'low',
			});
			assert.equal(task.steps[0].done, true);
			assert.equal(task.version, 2);
			assert.equal(
				(
					await study.update(a, 'tasks', task.id, {
						version: 1,
						steps: task.steps,
						priority: 'low',
					})
				).version,
				2,
			);
			await assert.rejects(
				study.update(a, 'tasks', task.id, { title: 'Stale', version: 1 }),
				/STUDY_VERSION_CONFLICT/,
			);
			assert.deepEqual((await study.overview(b)).tasks, []);
			for (const invalid of [
				{ due_date: '2026-02-30' },
				{ priority: 'urgent' },
				{ steps: Array(21).fill(task.steps[0]) },
				{ estimate_minutes: null },
				{ estimate_minutes: true },
				{ due_date: false },
			])
				await assert.rejects(
					create('tasks', { ...taskData, ...invalid }),
					/STUDY_VALUE_INVALID/,
				);
		},
	);
	await t.test(
		'F05 recurrence skips Saudi weekend and duplicate completion cannot spawn twice',
		async () => {
			const repeat = await create('tasks', {
				...taskData,
				recurrence: 'workdays',
			});
			await study.completeTask(a, repeat.id, { completed: true, version: 1 });
			await study.completeTask(a, repeat.id, { completed: true, version: 1 });
			const rows = (await study.overview(a)).tasks.filter(
				(row) => row.id !== repeat.id && row.recurrence === 'workdays',
			);
			assert.equal(rows.length, 1);
			assert.equal(rows[0].due_date, '2026-10-25');
			assert.equal(rows[0].steps[0].done, false);
			await study.completeTask(a, repeat.id, { completed: false, version: 2 });
			await study.completeTask(a, repeat.id, { completed: true, version: 3 });
			assert.equal(
				(await study.overview(a)).tasks.filter(
					(row) => row.recurrence === 'workdays',
				).length,
				2,
			);
			for (const [recurrence, expected] of [
				['daily', '2026-10-23'],
				['weekly', '2026-10-29'],
			]) {
				const row = await create('tasks', { ...taskData, recurrence });
				await study.completeTask(a, row.id, { completed: true, version: 1 });
				assert.equal(
					(await study.overview(a)).tasks.find(
						(r) => r.recurrence === recurrence && !r.completed,
					).due_date,
					expected,
				);
			}
		},
	);
	await t.test(
		'F06-F07 links attach only own active session once; actual effort comes from server ledger',
		async () => {
			session = await progress.start(a);
			await assert.rejects(
				study.linkFocus(b, session.id, { taskId: task.id }),
				/STUDY_NOT_FOUND/,
			);
			await study.linkFocus(a, session.id, { taskId: task.id });
			await study.linkFocus(a, session.id, { taskId: task.id });
			const another = await create('tasks', taskData);
			await assert.rejects(
				study.linkFocus(a, session.id, { taskId: another.id }),
				/STUDY_FOCUS_CONFLICT/,
			);
			for (let i = 0; i < 8; i++) {
				time += 15000;
				await progress.update(a, session.id, 'heartbeat');
			}
			session = await progress.update(a, session.id, 'complete');
			assert.equal(
				Number(
					(await study.overview(a)).tasks.find((row) => row.id === task.id)
						.actual_ms,
				),
				120000,
			);
			assert.equal(Number(session.credited_ms), 120000);
			await assert.rejects(
				study.linkFocus(a, session.id, { taskId: another.id }),
				/STUDY_FOCUS_CONFLICT/,
			);
		},
	);
	await t.test(
		'F08 saved finite routines reject marathons and foreign updates',
		async () => {
			const routine = await create('routines', {
				name: 'Two quiet rounds',
				focus_minutes: 25,
				break_minutes: 5,
				long_break_minutes: 15,
				cycles: 2,
				long_every: 2,
			});
			await assert.rejects(
				study.update(b, 'routines', routine.id, { name: 'Mine', version: 1 }),
				/STUDY_NOT_FOUND/,
			);
			await assert.rejects(
				create('routines', { ...routine, focus_minutes: 120, cycles: 8 }),
				/STUDY_ROUTINE_LIMIT/,
			);
			assert.equal((await study.overview(a)).routines.length, 1);
		},
	);
	await t.test(
		'F10 distraction capture, resolve and concurrent conversion is exactly once',
		async () => {
			const note = await create('distractions', {
				text: 'Email tutor after studying',
			});
			await assert.rejects(
				study.convertDistraction(b, note.id),
				/STUDY_NOT_FOUND/,
			);
			const [first, second] = await Promise.all([
				study.convertDistraction(a, note.id),
				study.convertDistraction(a, note.id),
			]);
			assert.equal(first.id, second.id);
			assert.equal((await study.overview(a)).distractions[0].resolved, true);
		},
	);
	await t.test(
		'F11-F14 private reflections, opt-in targets, Riyadh rollover and searched history',
		async () => {
			await assert.rejects(
				study.reflect(b, session.id, {
					outcome: 'done',
					note: 'x',
					version: 0,
				}),
				/STUDY_NOT_FOUND/,
			);
			const reflection = await study.reflect(a, session.id, {
				outcome: 'partial',
				note: 'Revise integrals',
				version: 0,
			});
			assert.equal(
				(
					await study.reflect(a, session.id, {
						outcome: 'partial',
						note: 'Revise integrals',
						version: 0,
					})
				).version,
				reflection.version,
			);
			await assert.rejects(
				study.reflect(a, session.id, {
					outcome: 'done',
					note: 'Stale',
					version: 0,
				}),
				/STUDY_VERSION_CONFLICT/,
			);
			assert.equal((await study.insights(a)).preferences.daily_target, 0);
			await study.preferences(a, {
				daily_target: 30,
				weekly_target: 120,
				reminders: false,
				reminder_minutes: 5,
				version: 0,
			});
			await assert.rejects(
				study.preferences(a, {
					daily_target: 241,
					weekly_target: 120,
					reminders: false,
					reminder_minutes: 5,
					version: 1,
				}),
				/STUDY_VALUE_INVALID/,
			);
			const insights = await study.insights(a);
			assert.equal(insights.days.length, 28);
			assert.equal(insights.weekStart, '2026-10-18');
			assert.equal(
				insights.projects.find((r) => r.project_id === project.id).minutes,
				2,
			);
			assert.equal(insights.lastSeven, 2);
			assert.equal(insights.previousSeven, 0);
			const journal = await study.journal(
				a,
				{ q: 'integrals', projectId: project.id, state: 'completed' },
				30,
			);
			assert.equal(journal.sessions.length, 1);
			assert.equal(journal.sessions[0].id, session.id);
			assert.equal(
				(await study.journal(b, { q: 'integrals' }, 30)).sessions.length,
				0,
			);
			await study.update(a, 'projects', project.id, {
				archived: true,
				version: 1,
			});
			assert.equal(
				(await study.overview(a)).tasks.find((r) => r.id === task.id)
					.project_id,
				null,
			);
			assert.equal(
				(await study.journal(a, { q: 'Math' }, 30)).sessions.length,
				1,
				'history keeps the original project snapshot',
			);
		},
	);
	await t.test(
		'F15 favorites persist, deduplicate and hide unavailable private room metadata',
		async () => {
			await db.query(
				'INSERT INTO halastudy.rooms(id,owner_id,created_at) VALUES($1,$2,$3)',
				['saved-room', a, now()],
			);
			const rooms = new Map([['saved-room', { name: 'Private quiet room' }]]);
			let allowed = true;
			const canJoin = async () => allowed;
			const first = await community.bookmark(
				{ id: a },
				'saved-room',
				rooms,
				canJoin,
			);
			assert.equal(
				(await community.bookmark({ id: a }, 'saved-room', rooms, canJoin)).id,
				first.id,
			);
			assert.equal(
				(await community.bookmarks({ id: a }, rooms, canJoin))[0].name,
				'Private quiet room',
			);
			allowed = false;
			assert.deepEqual(await community.bookmarks({ id: a }, rooms, canJoin), [
				{ id: first.id, available: false },
			]);
			await assert.rejects(
				community.bookmark({ id: b }, 'saved-room', rooms, canJoin),
				/ROOM_NOT_FOUND/,
			);
			await community.removeBookmark(b, first.id);
			assert.equal(
				(await community.bookmarks({ id: a }, rooms, canJoin)).length,
				1,
			);
		},
	);
	await t.test(
		'F16-F18 personal agenda, current-member RSVPs and valid multilingual calendar',
		async () => {
			const billing = createBilling(db, 'test', now),
				checkout = await billing.checkout(a);
			await billing.complete(a, checkout.id, checkout.token, 'success');
			circle = await cohorts.create(a, 'مجموعة الرياض');
			const invitation = await cohorts.invite(a, circle.id);
			await cohorts.accept(b, invitation.token);
			scheduled = await cohorts.schedule(a, circle.id, {
				roomId: 'saved-room',
				title: `تركيز، هادئ; one\ntwo ${'أ'.repeat(100)}`,
				startsAt: now() + 3600000,
				durationMinutes: 25,
			});
			assert.equal((await community.agenda(b)).length, 1);
			assert.equal((await community.agenda(c)).length, 0);
			await community.rsvp(b, scheduled.id, 'going');
			await community.rsvp(b, scheduled.id, 'going');
			assert.equal(Number((await community.agenda(a))[0].going), 1);
			await assert.rejects(
				community.rsvp(c, scheduled.id, 'going'),
				/COHORT_NOT_FOUND/,
			);
			const ics = agendaCalendar(await community.agenda(b), now());
			assert.match(ics, /BEGIN:VEVENT/);
			assert.match(ics, /DTSTART:20261022T220000Z/);
			assert.match(ics, /\\;/);
			assert.doesNotMatch(ics, /token|saved-room/);
			for (const line of ics.split('\r\n'))
				assert.ok(Buffer.byteLength(line) <= 75);
			await community.rsvp(b, scheduled.id, 'declined');
			assert.doesNotMatch(
				agendaCalendar(await community.agenda(b)),
				/BEGIN:VEVENT/,
			);
		},
	);
	await t.test(
		'F19 reminder preference is explicit, versioned and private',
		async () => {
			const prefs = await study.preferences(a);
			await study.preferences(a, {
				...prefs,
				reminders: true,
				reminder_minutes: 10,
			});
			assert.equal((await study.preferences(a)).reminders, true);
			assert.equal((await study.preferences(b)).reminders, false);
		},
	);
	await t.test(
		'F20 resources enforce current membership, supervisor management and safe links',
		async () => {
			const input = {
				title: 'Study guide',
				url: 'https://example.com/guide',
				note: 'Chapter 2',
				requestId: crypto.randomUUID(),
			};
			await assert.rejects(
				community.addResource(b, circle.id, input),
				/FORBIDDEN/,
			);
			const first = await community.addResource(a, circle.id, input);
			assert.equal(
				(await community.addResource(a, circle.id, input)).id,
				first.id,
			);
			await assert.rejects(
				community.addResource(a, circle.id, {
					...input,
					url: 'javascript:alert(1)',
				}),
				/STUDY_URL_INVALID/,
			);
			await assert.rejects(
				community.addResource(a, circle.id, {
					...input,
					url: 'https://user:pass@example.com',
				}),
				/STUDY_URL_INVALID/,
			);
			assert.equal(
				(await community.resources(b, circle.id)).resources.length,
				1,
			);
			await cohorts.setRole(a, circle.id, b, 'supervisor');
			await community.addResource(b, circle.id, {
				...input,
				title: 'Supervisor link',
				requestId: crypto.randomUUID(),
			});
			await cohorts.leave(b, circle.id);
			assert.equal((await community.agenda(b)).length, 0);
			await assert.rejects(
				community.resources(b, circle.id),
				/COHORT_NOT_FOUND/,
			);
			assert.equal(
				(
					await db.query(
						'SELECT * FROM halastudy.study_rsvps WHERE user_id=$1',
						[b],
					)
				).rows.length,
				0,
			);
			await community.archiveResource(a, circle.id, first.id);
			assert.equal(
				(await community.resources(a, circle.id)).resources.length,
				1,
			);
		},
	);
	await t.test(
		'active task and distraction limits apply to reopen paths as well as new entries',
		async () => {
			const completed = await create('tasks', taskData, c);
			await study.completeTask(c, completed.id, {
				completed: true,
				version: 1,
			});
			await db.query(
				`INSERT INTO halastudy.study_tasks(id,user_id,title,priority,recurrence,estimate_minutes,mutation_key,request_hash,created_at)
            SELECT 'limit-task-'||n,$1,'Bounded task','normal','none',25,'limit-task-'||n,'fixture',1 FROM generate_series(1,200) n`,
				[c],
			);
			await assert.rejects(
				study.completeTask(c, completed.id, { completed: false, version: 2 }),
				/STUDY_LIMIT/,
			);
			await assert.rejects(create('tasks', taskData, c), /STUDY_LIMIT/);
			await study.update(c, 'tasks', 'limit-task-1', {
				archived: true,
				version: 1,
			});
			assert.equal(
				(
					await study.completeTask(c, completed.id, {
						completed: false,
						version: 2,
					})
				).completed,
				false,
			);
			const resolved = await create(
				'distractions',
				{ text: 'Resolved', resolved: true },
				c,
			);
			await db.query(
				`INSERT INTO halastudy.study_distractions(id,user_id,text,mutation_key,request_hash,created_at)
            SELECT 'limit-note-'||n,$1,'Bounded note','limit-note-'||n,'fixture',1 FROM generate_series(1,100) n`,
				[c],
			);
			await assert.rejects(
				study.update(c, 'distractions', resolved.id, {
					resolved: false,
					version: 1,
				}),
				/STUDY_LIMIT/,
			);
			await db.query('DELETE FROM halastudy.study_tasks WHERE user_id=$1', [c]);
			await db.query(
				'DELETE FROM halastudy.study_distractions WHERE user_id=$1',
				[c],
			);
		},
	);
	await t.test(
		'journal cursor handles timestamp ties without skipping; history window remains entitled',
		async () => {
			for (let i = 0; i < 52; i++)
				await db.query(
					"INSERT INTO halastudy.focus_sessions(id,user_id,state,started_at,last_seen_at,completed_at) VALUES($1,$2,'completed',$3,$3,$3)",
					[crypto.randomUUID(), b, i === 51 ? now() - 40 * 86400000 : now()],
				);
			const first = await study.journal(b, {}, 30),
				second = await study.journal(b, first.next, 30);
			assert.equal(first.sessions.length, 50);
			assert.equal(second.sessions.length, 1);
			assert.equal(
				new Set([...first.sessions, ...second.sessions].map((s) => s.id)).size,
				51,
			);
			const extended = await study.journal(b, {}, 365);
			assert.ok(extended.next);
			assert.equal(
				(await study.journal(b, extended.next, 365)).sessions.length,
				2,
			);
			await assert.rejects(
				study.journal(b, { from: 'invalid-date' }, 30),
				/STUDY_VALUE_INVALID/,
			);
			await assert.rejects(
				study.journal(b, { before: time, beforeId: 'not-an-id' }, 30),
				/STUDY_VALUE_INVALID/,
			);
		},
	);
	await t.test(
		'v3 backup restores every new domain, accepts v1/v2, and account cascades private data',
		async () => {
			const folder = await fs.mkdtemp(
				path.join(os.tmpdir(), 'halastudy-tools-backup-'),
			);
			t.after(() => fs.rm(folder, { recursive: true, force: true }));
			const file = path.join(folder, 'backup.json');
			await backupDatabase(db, file);
			const snapshot = JSON.parse(await fs.readFile(file, 'utf8'));
			assert.equal(snapshot.format, 'halastudy-platform-v3');
			assert.equal(
				snapshot.tables.study_tasks.length,
				(await study.overview(a)).tasks.length,
			);
			for (const version of [3, 2, 1]) {
				const restored = await createDatabase();
				try {
					const copy = structuredClone(snapshot);
					copy.format = `halastudy-platform-v${version}`;
					if (version < 3)
						for (const key of Object.keys(copy.tables).filter((k) =>
							k.startsWith('study_'),
						))
							delete copy.tables[key];
					if (version === 1) delete copy.tables.digetpay_orders;
					copy.checksum = hash(JSON.stringify(copy.tables));
					await restoreDatabase(restored, copy);
					assert.equal(
						(await restored.query('SELECT * FROM halastudy.study_tasks')).rows
							.length,
						version === 3 ? snapshot.tables.study_tasks.length : 0,
					);
				} finally {
					await restored.close();
				}
			}
			await db.query('DELETE FROM halastudy.users WHERE id=$1', [a]);
			for (const table of [
				'study_tasks',
				'study_projects',
				'study_focus_links',
				'study_routines',
				'study_distractions',
				'study_preferences',
				'study_reflections',
				'study_bookmarks',
			])
				assert.equal(
					(
						await db.query(
							`SELECT * FROM halastudy.${table} WHERE user_id=$1`,
							[a],
						)
					).rows.length,
					0,
				);
		},
	);
});
