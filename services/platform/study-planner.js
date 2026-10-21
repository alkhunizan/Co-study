const crypto = require('node:crypto');
const { sanitizeUserText } = require('../auth');
const { requireCondition, lockUser, dayKey, hash } = require('./common');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function object(input) {
	requireCondition(
		input && typeof input === 'object' && !Array.isArray(input),
		'STUDY_VALUE_INVALID',
	);
	return input;
}
function text(value, limit, required = true) {
	requireCondition(
		typeof value === 'string' && value.length <= limit,
		'STUDY_VALUE_INVALID',
	);
	const clean = sanitizeUserText(value, limit);
	requireCondition(!required || clean.length > 0, 'STUDY_VALUE_INVALID');
	return clean;
}
function integer(value, min, max) {
	const n = Number(value);
	requireCondition(
		(typeof value === 'number' ||
			(typeof value === 'string' && /^\d+$/.test(value))) &&
			Number.isSafeInteger(n) &&
			n >= min &&
			n <= max,
		'STUDY_VALUE_INVALID',
	);
	return n;
}
function date(value) {
	if (value === undefined || value === null || value === '') return null;
	requireCondition(
		typeof value === 'string' &&
			/^\d{4}-\d{2}-\d{2}$/.test(value) &&
			Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
			new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value,
		'STUDY_VALUE_INVALID',
	);
	return value;
}
function publicRow(row) {
	if (!row) return null;
	const {
		user_id: _owner,
		mutation_key: _key,
		request_hash: _hash,
		...result
	} = row;
	return result;
}
const fields = {
	projects: ['name'],
	tasks: [
		'project_id',
		'title',
		'note',
		'priority',
		'due_date',
		'recurrence',
		'estimate_minutes',
		'steps',
	],
	distractions: ['text', 'resolved'],
	routines: [
		'name',
		'focus_minutes',
		'break_minutes',
		'long_break_minutes',
		'cycles',
		'long_every',
	],
};
const limits = { projects: 20, tasks: 200, distractions: 100, routines: 20 };
function normalize(kind, input) {
	object(input);
	if (kind === 'projects') return { name: text(input.name, 60) };
	if (kind === 'distractions') {
		requireCondition(
			input.resolved === undefined || typeof input.resolved === 'boolean',
			'STUDY_VALUE_INVALID',
		);
		return { text: text(input.text, 500), resolved: input.resolved || false };
	}
	if (kind === 'routines') {
		const result = {
			name: text(input.name, 60),
			focus_minutes: integer(input.focus_minutes, 5, 120),
			break_minutes: integer(input.break_minutes, 1, 30),
			long_break_minutes: integer(input.long_break_minutes, 5, 60),
			cycles: integer(input.cycles, 1, 8),
			long_every: integer(input.long_every, 2, 8),
		};
		requireCondition(
			result.focus_minutes * result.cycles <= 240,
			'STUDY_ROUTINE_LIMIT',
		);
		return result;
	}
	requireCondition(
		['low', 'normal', 'high'].includes(input.priority) &&
			['none', 'daily', 'workdays', 'weekly'].includes(input.recurrence),
		'STUDY_VALUE_INVALID',
	);
	requireCondition(
		Array.isArray(input.steps) && input.steps.length <= 20,
		'STUDY_VALUE_INVALID',
	);
	const steps = input.steps.map((step, index) => {
		object(step);
		requireCondition(typeof step.done === 'boolean', 'STUDY_VALUE_INVALID');
		const id = step.id === undefined ? String(index + 1) : String(step.id);
		requireCondition(/^[\w-]{1,40}$/.test(id), 'STUDY_VALUE_INVALID');
		return { id, text: text(step.text, 120), done: step.done };
	});
	requireCondition(
		new Set(steps.map((step) => step.id)).size === steps.length,
		'STUDY_VALUE_INVALID',
	);
	const due = date(input.due_date);
	requireCondition(input.recurrence === 'none' || due, 'STUDY_DUE_REQUIRED');
	requireCondition(
		!input.project_id ||
			(typeof input.project_id === 'string' && UUID.test(input.project_id)),
		'STUDY_VALUE_INVALID',
	);
	return {
		project_id: input.project_id || null,
		title: text(input.title, 120),
		note: text(input.note || '', 2000, false),
		priority: input.priority,
		due_date: due,
		recurrence: input.recurrence,
		estimate_minutes: integer(input.estimate_minutes, 1, 240),
		steps,
	};
}
function createStudyPlanner(db, now = Date.now) {
	const table = (kind) => {
		requireCondition(Object.hasOwn(fields, kind), 'STUDY_NOT_FOUND', 404);
		return `halastudy.study_${kind}`;
	};
	async function capacity(tx, userId, kind, active = true) {
		const counts = (
			await tx.query(
				`SELECT COUNT(*) AS total,COUNT(*) FILTER(WHERE ${kind === 'tasks' ? 'completed=false' : kind === 'distractions' ? 'resolved=false' : 'true'}) AS active FROM ${table(kind)} WHERE user_id=$1 AND archived=false`,
				[userId],
			)
		).rows[0];
		requireCondition(
			Number(counts.total) <
				(kind === 'tasks'
					? 300
					: kind === 'distractions'
						? 150
						: limits[kind]) &&
				(!active || Number(counts.active) < limits[kind]),
			'STUDY_LIMIT',
			409,
		);
	}
	async function validateProject(tx, userId, projectId) {
		if (projectId)
			requireCondition(
				(
					await tx.query(
						'SELECT id FROM halastudy.study_projects WHERE id=$1 AND user_id=$2 AND archived=false',
						[projectId, userId],
					)
				).rows.length,
				'STUDY_NOT_FOUND',
				404,
			);
	}
	async function createIn(tx, userId, kind, data, key) {
		const normalized = normalize(kind, data);
		const digest = hash(JSON.stringify(normalized));
		const existing = (
			await tx.query(
				`SELECT * FROM ${table(kind)} WHERE user_id=$1 AND mutation_key=$2`,
				[userId, key],
			)
		).rows[0];
		if (existing) {
			requireCondition(
				existing.request_hash === digest,
				'STUDY_RETRY_CONFLICT',
				409,
			);
			return existing;
		}
		if (kind === 'tasks')
			await validateProject(tx, userId, normalized.project_id);
		await capacity(
			tx,
			userId,
			kind,
			kind !== 'distractions' || !normalized.resolved,
		);
		const columns = [
			'id',
			'user_id',
			...fields[kind],
			'mutation_key',
			'request_hash',
			'created_at',
		];
		const values = [
			crypto.randomUUID(),
			userId,
			...fields[kind].map((field) =>
				field === 'steps'
					? JSON.stringify(normalized[field])
					: normalized[field],
			),
			key,
			digest,
			now(),
		];
		return (
			await tx.query(
				`INSERT INTO ${table(kind)}(${columns.join(',')}) VALUES(${values.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`,
				values,
			)
		).rows[0];
	}
	async function create(userId, kind, input) {
		object(input);
		requireCondition(
			typeof input.requestId === 'string' && UUID.test(input.requestId),
			'STUDY_VALUE_INVALID',
		);
		return db.transaction(async (tx) => {
			await lockUser(tx, userId);
			return publicRow(
				await createIn(tx, userId, kind, input, input.requestId),
			);
		});
	}
	async function update(userId, kind, id, input) {
		object(input);
		return db.transaction(async (tx) => {
			await lockUser(tx, userId);
			const row = (
				await tx.query(
					`SELECT * FROM ${table(kind)} WHERE user_id=$1 AND id=$2 FOR UPDATE`,
					[userId, id],
				)
			).rows[0];
			requireCondition(row, 'STUDY_NOT_FOUND', 404);
			requireCondition(
				input.archived === undefined || typeof input.archived === 'boolean',
				'STUDY_VALUE_INVALID',
			);
			const data = normalize(kind, { ...row, ...input });
			const archived = input.archived ?? row.archived;
			if (
				JSON.stringify(normalize(kind, row)) === JSON.stringify(data) &&
				archived === row.archived
			)
				return publicRow(row);
			requireCondition(
				input.version === row.version,
				'STUDY_VERSION_CONFLICT',
				409,
			);
			if (row.archived && !archived) {
				await capacity(
					tx,
					userId,
					kind,
					kind === 'tasks'
						? !row.completed
						: kind === 'distractions'
							? !data.resolved
							: true,
				);
			}
			if (
				kind === 'distractions' &&
				!archived &&
				!row.archived &&
				row.resolved &&
				!data.resolved
			) {
				const count = Number(
					(
						await tx.query(
							'SELECT COUNT(*) AS n FROM halastudy.study_distractions WHERE user_id=$1 AND archived=false AND resolved=false',
							[userId],
						)
					).rows[0].n,
				);
				requireCondition(count < limits.distractions, 'STUDY_LIMIT', 409);
			}
			if (kind === 'tasks') await validateProject(tx, userId, data.project_id);
			const columns = [...fields[kind], 'archived'];
			const values = [
				userId,
				id,
				...columns.map((field) =>
					field === 'archived'
						? archived
						: field === 'steps'
							? JSON.stringify(data[field])
							: data[field],
				),
			];
			const result = (
				await tx.query(
					`UPDATE ${table(kind)} SET ${columns.map((field, index) => `${field}=$${index + 3}`).join(',')},version=version+1 WHERE user_id=$1 AND id=$2 RETURNING *`,
					values,
				)
			).rows[0];
			if (kind === 'projects' && archived)
				await tx.query(
					'UPDATE halastudy.study_tasks SET project_id=NULL,version=version+1 WHERE user_id=$1 AND project_id=$2',
					[userId, id],
				);
			return publicRow(result);
		});
	}
	async function completeTask(userId, id, input) {
		object(input);
		requireCondition(
			typeof input.completed === 'boolean',
			'STUDY_VALUE_INVALID',
		);
		return db.transaction(async (tx) => {
			await lockUser(tx, userId);
			let row = (
				await tx.query(
					'SELECT * FROM halastudy.study_tasks WHERE user_id=$1 AND id=$2 AND archived=false FOR UPDATE',
					[userId, id],
				)
			).rows[0];
			requireCondition(row, 'STUDY_NOT_FOUND', 404);
			if (row.completed === input.completed) return publicRow(row);
			requireCondition(
				input.version === row.version,
				'STUDY_VERSION_CONFLICT',
				409,
			);
			if (!input.completed) {
				const count = Number(
					(
						await tx.query(
							'SELECT COUNT(*) AS n FROM halastudy.study_tasks WHERE user_id=$1 AND archived=false AND completed=false',
							[userId],
						)
					).rows[0].n,
				);
				requireCondition(count < limits.tasks, 'STUDY_LIMIT', 409);
			}
			row = (
				await tx.query(
					'UPDATE halastudy.study_tasks SET completed=$3,completed_at=$4,version=version+1 WHERE user_id=$1 AND id=$2 RETURNING *',
					[userId, id, input.completed, input.completed ? now() : null],
				)
			).rows[0];
			if (row.completed && row.recurrence !== 'none') {
				const next = new Date(
					`${row.due_date > dayKey(now()) ? row.due_date : dayKey(now())}T12:00:00Z`,
				);
				next.setUTCDate(
					next.getUTCDate() + (row.recurrence === 'weekly' ? 7 : 1),
				);
				if (row.recurrence === 'workdays')
					while ([5, 6].includes(next.getUTCDay()))
						next.setUTCDate(next.getUTCDate() + 1);
				const key = `repeat:${id}`;
				if (
					!(
						await tx.query(
							'SELECT id FROM halastudy.study_tasks WHERE user_id=$1 AND mutation_key=$2',
							[userId, key],
						)
					).rows.length
				) {
					await createIn(
						tx,
						userId,
						'tasks',
						{
							...row,
							due_date: next.toISOString().slice(0, 10),
							steps: row.steps.map((step) => ({ ...step, done: false })),
						},
						key,
					);
				}
			}
			return publicRow(row);
		});
	}
	async function convertDistraction(userId, id) {
		return db.transaction(async (tx) => {
			await lockUser(tx, userId);
			const note = (
				await tx.query(
					'SELECT * FROM halastudy.study_distractions WHERE id=$1 AND user_id=$2 AND archived=false FOR UPDATE',
					[id, userId],
				)
			).rows[0];
			requireCondition(note, 'STUDY_NOT_FOUND', 404);
			const key = `distraction:${id}`;
			const existing = (
				await tx.query(
					'SELECT * FROM halastudy.study_tasks WHERE user_id=$1 AND mutation_key=$2',
					[userId, key],
				)
			).rows[0];
			const task =
				existing ||
				(await createIn(
					tx,
					userId,
					'tasks',
					{
						title: note.text.slice(0, 120),
						note: note.text,
						priority: 'normal',
						recurrence: 'none',
						estimate_minutes: 25,
						steps: [],
					},
					key,
				));
			await tx.query(
				'UPDATE halastudy.study_distractions SET resolved=true,version=version+1 WHERE id=$1 AND user_id=$2 AND resolved=false',
				[id, userId],
			);
			return publicRow(task);
		});
	}
	async function linkFocus(userId, sessionId, input) {
		object(input);
		requireCondition(
			typeof input.taskId === 'string' && UUID.test(input.taskId),
			'STUDY_VALUE_INVALID',
		);
		return db.transaction(async (tx) => {
			await lockUser(tx, userId);
			const existing = (
				await tx.query(
					'SELECT * FROM halastudy.study_focus_links WHERE user_id=$1 AND session_id=$2',
					[userId, sessionId],
				)
			).rows[0];
			if (existing) {
				requireCondition(
					existing.task_id === input.taskId,
					'STUDY_FOCUS_CONFLICT',
					409,
				);
				return publicRow(existing);
			}
			const focus = (
				await tx.query(
					"SELECT id FROM halastudy.focus_sessions WHERE id=$1 AND user_id=$2 AND state IN ('active','paused')",
					[sessionId, userId],
				)
			).rows[0];
			const task = (
				await tx.query(
					'SELECT t.*,p.name AS project_name FROM halastudy.study_tasks t LEFT JOIN halastudy.study_projects p ON p.id=t.project_id AND p.user_id=t.user_id WHERE t.id=$1 AND t.user_id=$2 AND t.archived=false AND t.completed=false',
					[input.taskId, userId],
				)
			).rows[0];
			requireCondition(focus && task, 'STUDY_NOT_FOUND', 404);
			return publicRow(
				(
					await tx.query(
						'INSERT INTO halastudy.study_focus_links(session_id,user_id,task_id,project_id,task_title,project_name) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
						[
							sessionId,
							userId,
							task.id,
							task.project_id,
							task.title,
							task.project_name,
						],
					)
				).rows[0],
			);
		});
	}
	const defaults = {
		daily_target: 0,
		weekly_target: 0,
		reminders: false,
		reminder_minutes: 5,
		version: 0,
	};
	async function preferences(userId, input) {
		if (input === undefined)
			return (
				publicRow(
					(
						await db.query(
							'SELECT * FROM halastudy.study_preferences WHERE user_id=$1',
							[userId],
						)
					).rows[0],
				) || { ...defaults }
			);
		object(input);
		requireCondition(
			typeof input.reminders === 'boolean' &&
				[1, 5, 10, 15].includes(Number(input.reminder_minutes)),
			'STUDY_VALUE_INVALID',
		);
		const values = [
			integer(input.daily_target, 0, 240),
			integer(input.weekly_target, 0, 1680),
			input.reminders,
			Number(input.reminder_minutes),
		];
		return db.transaction(async (tx) => {
			await lockUser(tx, userId);
			const old =
				(
					await tx.query(
						'SELECT * FROM halastudy.study_preferences WHERE user_id=$1',
						[userId],
					)
				).rows[0] || defaults;
			if (
				[
					'daily_target',
					'weekly_target',
					'reminders',
					'reminder_minutes',
				].every((key, i) => old[key] === values[i])
			)
				return publicRow(old);
			requireCondition(
				input.version === old.version,
				'STUDY_VERSION_CONFLICT',
				409,
			);
			return publicRow(
				(
					await tx.query(
						`INSERT INTO halastudy.study_preferences(user_id,daily_target,weekly_target,reminders,reminder_minutes) VALUES($1,$2,$3,$4,$5)
                ON CONFLICT(user_id) DO UPDATE SET daily_target=$2,weekly_target=$3,reminders=$4,reminder_minutes=$5,version=study_preferences.version+1 RETURNING *`,
						[userId, ...values],
					)
				).rows[0],
			);
		});
	}
	async function reflect(userId, sessionId, input) {
		object(input);
		requireCondition(
			['done', 'partial', 'continue'].includes(input.outcome),
			'STUDY_VALUE_INVALID',
		);
		const note = text(input.note || '', 1000, false);
		return db.transaction(async (tx) => {
			await lockUser(tx, userId);
			requireCondition(
				(
					await tx.query(
						"SELECT id FROM halastudy.focus_sessions WHERE id=$1 AND user_id=$2 AND state='completed'",
						[sessionId, userId],
					)
				).rows.length,
				'STUDY_NOT_FOUND',
				404,
			);
			const old = (
				await tx.query(
					'SELECT * FROM halastudy.study_reflections WHERE session_id=$1 AND user_id=$2',
					[sessionId, userId],
				)
			).rows[0];
			if (old?.outcome === input.outcome && old.note === note)
				return publicRow(old);
			requireCondition(
				input.version === (old?.version || 0),
				'STUDY_VERSION_CONFLICT',
				409,
			);
			return publicRow(
				(
					await tx.query(
						`INSERT INTO halastudy.study_reflections(session_id,user_id,outcome,note,updated_at) VALUES($1,$2,$3,$4,$5)
                ON CONFLICT(session_id) DO UPDATE SET outcome=$3,note=$4,updated_at=$5,version=study_reflections.version+1 RETURNING *`,
						[sessionId, userId, input.outcome, note, now()],
					)
				).rows[0],
			);
		});
	}
	async function overview(userId) {
		const [projects, tasks, distractions, routines, prefs, focusLink] =
			await Promise.all([
				db.query(
					'SELECT * FROM halastudy.study_projects WHERE user_id=$1 AND archived=false ORDER BY created_at LIMIT 20',
					[userId],
				),
				db.query(
					`SELECT t.*,COALESCE((SELECT SUM(f.credited_ms) FROM halastudy.study_focus_links l JOIN halastudy.focus_sessions f ON f.id=l.session_id WHERE l.task_id=t.id AND l.user_id=$1 AND f.state='completed'),0) AS actual_ms
                FROM halastudy.study_tasks t WHERE t.user_id=$1 AND t.archived=false ORDER BY t.completed,t.created_at DESC LIMIT 300`,
					[userId],
				),
				db.query(
					'SELECT * FROM halastudy.study_distractions WHERE user_id=$1 AND archived=false ORDER BY resolved,created_at DESC LIMIT 150',
					[userId],
				),
				db.query(
					'SELECT * FROM halastudy.study_routines WHERE user_id=$1 AND archived=false ORDER BY created_at LIMIT 20',
					[userId],
				),
				preferences(userId),
				db.query(
					"SELECT l.session_id,l.task_id,l.task_title FROM halastudy.study_focus_links l JOIN halastudy.focus_sessions f ON f.id=l.session_id AND f.user_id=l.user_id WHERE l.user_id=$1 AND f.state IN ('active','paused') LIMIT 1",
					[userId],
				),
			]);
		return {
			today: dayKey(now()),
			serverNow: now(),
			projects: projects.rows.map(publicRow),
			tasks: tasks.rows.map(publicRow),
			distractions: distractions.rows.map(publicRow),
			routines: routines.rows.map(publicRow),
			preferences: prefs,
			focusLink: focusLink.rows[0] || null,
		};
	}
	async function journal(userId, input, historyDays) {
		object(input);
		const values = [userId, now() - historyDays * 86400000];
		const where = ['f.user_id=$1', 'f.started_at >= $2'];
		const add = (clause, value) => {
			values.push(value);
			where.push(clause.replace('?', `$${values.length}`));
		};
		if (input.from)
			add(
				'f.started_at >= ?',
				Date.parse(`${date(input.from)}T00:00:00Z`) - 10800000,
			);
		if (input.to)
			add(
				'f.started_at < ?',
				Date.parse(`${date(input.to)}T00:00:00Z`) + 86400000 - 10800000,
			);
		if (input.state) {
			requireCondition(
				['active', 'paused', 'completed', 'abandoned'].includes(input.state),
				'STUDY_VALUE_INVALID',
			);
			add('f.state = ?', input.state);
		}
		if (input.projectId) {
			requireCondition(UUID.test(input.projectId), 'STUDY_VALUE_INVALID');
			add('l.project_id = ?', input.projectId);
		}
		if (input.q) {
			const query = text(input.q, 80);
			add(
				"(COALESCE(l.task_title,'') || ' ' || COALESCE(l.project_name,'') || ' ' || COALESCE(r.note,'')) ILIKE ?",
				`%${query}%`,
			);
		}
		if (input.before) {
			const before = integer(input.before, 1, Number.MAX_SAFE_INTEGER);
			requireCondition(
				typeof input.beforeId === 'string' && UUID.test(input.beforeId),
				'STUDY_VALUE_INVALID',
			);
			values.push(before, input.beforeId);
			where.push(
				`(f.started_at,f.id)<($${values.length - 1},$${values.length})`,
			);
		}
		const result = await db.query(
			`SELECT f.id,f.state,f.started_at,f.completed_at,f.credited_ms,f.xp,l.task_title,l.project_name,l.project_id,r.outcome,r.note,r.version AS reflection_version
            FROM halastudy.focus_sessions f LEFT JOIN halastudy.study_focus_links l ON l.session_id=f.id AND l.user_id=f.user_id
            LEFT JOIN halastudy.study_reflections r ON r.session_id=f.id AND r.user_id=f.user_id WHERE ${where.join(' AND ')} ORDER BY f.started_at DESC,f.id DESC LIMIT 51`,
			values,
		);
		const rows = result.rows.slice(0, 50);
		const last = rows.at(-1);
		return {
			sessions: rows,
			next:
				result.rows.length > 50
					? { before: Number(last.started_at), beforeId: last.id }
					: null,
			historyDays,
		};
	}
	async function insights(userId) {
		const today = dayKey(now());
		const [daily, projects, prefs] = await Promise.all([
			db.query(
				`SELECT d.key AS day,SUM(d.value::numeric) AS milliseconds FROM halastudy.focus_sessions f CROSS JOIN LATERAL jsonb_each_text(f.daily_ms) d
                WHERE f.user_id=$1 AND f.state='completed' AND d.key >= $2 AND d.key <= $3 GROUP BY d.key ORDER BY d.key`,
				[userId, dayKey(now() - 27 * 86400000), today],
			),
			db.query(
				`SELECT l.project_id,l.project_name,SUM(d.value::numeric) AS milliseconds,COUNT(DISTINCT f.id) AS sessions FROM halastudy.focus_sessions f
                LEFT JOIN halastudy.study_focus_links l ON f.id=l.session_id AND f.user_id=l.user_id CROSS JOIN LATERAL jsonb_each_text(f.daily_ms) d
                WHERE f.user_id=$1 AND f.state='completed' AND d.key >= $2 AND d.key <= $3
                GROUP BY l.project_id,l.project_name ORDER BY milliseconds DESC LIMIT 30`,
				[userId, dayKey(now() - 27 * 86400000), today],
			),
			preferences(userId),
		]);
		const days = Array.from({ length: 28 }, (_, i) => {
			const day = dayKey(now() - (27 - i) * 86400000);
			return {
				day,
				minutes: Math.floor(
					Number(daily.rows.find((r) => r.day === day)?.milliseconds || 0) /
						60000,
				),
			};
		});
		const weekStart = dayKey(
			now() - new Date(now() + 10800000).getUTCDay() * 86400000,
		);
		return {
			days,
			projects: projects.rows.map((row) => ({
				...row,
				minutes: Math.floor(Number(row.milliseconds) / 60000),
			})),
			todayMinutes: days.at(-1).minutes,
			weekMinutes: days
				.filter((d) => d.day >= weekStart)
				.reduce((sum, d) => sum + d.minutes, 0),
			weekStart,
			lastSeven: days.slice(-7).reduce((sum, d) => sum + d.minutes, 0),
			previousSeven: days.slice(-14, -7).reduce((sum, d) => sum + d.minutes, 0),
			preferences: prefs,
		};
	}
	return {
		create,
		update,
		completeTask,
		convertDistraction,
		linkFocus,
		preferences,
		reflect,
		overview,
		journal,
		insights,
	};
}
module.exports = { createStudyPlanner };
