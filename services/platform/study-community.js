const crypto = require('node:crypto');
const { sanitizeUserText } = require('../auth');
const { requireCondition, lockUser, hash } = require('./common');

function clean(value, max, required = true) {
	requireCondition(
		typeof value === 'string' && value.length <= max,
		'STUDY_VALUE_INVALID',
	);
	const result = sanitizeUserText(value, max);
	requireCondition(!required || result.length, 'STUDY_VALUE_INVALID');
	return result;
}
function createStudyCommunity(db, cohorts, now = Date.now) {
	async function bookmarks(user, rooms, canJoin) {
		const rows = (
			await db.query(
				'SELECT id,room_id FROM halastudy.study_bookmarks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
				[user.id],
			)
		).rows;
		return Promise.all(
			rows.map(async (row) => {
				const room = rooms.get(row.room_id);
				return room && (await canJoin(row.room_id, user))
					? {
							id: row.id,
							roomId: row.room_id,
							name: room.name,
							available: true,
						}
					: { id: row.id, available: false };
			}),
		);
	}
	async function bookmark(user, roomId, rooms, canJoin) {
		requireCondition(
			typeof roomId === 'string' && roomId.length <= 50 && rooms.has(roomId),
			'ROOM_NOT_FOUND',
			404,
		);
		requireCondition(await canJoin(roomId, user), 'ROOM_NOT_FOUND', 404);
		return db.transaction(async (tx) => {
			// Room before account, matching schedule's room -> creator FK order.
			requireCondition(
				(
					await tx.query(
						'SELECT id FROM halastudy.rooms WHERE id=$1 FOR KEY SHARE',
						[roomId],
					)
				).rows.length,
				'ROOM_NOT_FOUND',
				404,
			);
			await lockUser(tx, user.id);
			requireCondition(await canJoin(roomId, user, tx), 'ROOM_NOT_FOUND', 404);
			const existing = (
				await tx.query(
					'SELECT id FROM halastudy.study_bookmarks WHERE user_id=$1 AND room_id=$2',
					[user.id, roomId],
				)
			).rows[0];
			if (existing) return existing;
			requireCondition(
				Number(
					(
						await tx.query(
							'SELECT COUNT(*) AS n FROM halastudy.study_bookmarks WHERE user_id=$1',
							[user.id],
						)
					).rows[0].n,
				) < 50,
				'STUDY_LIMIT',
				409,
			);
			return (
				await tx.query(
					'INSERT INTO halastudy.study_bookmarks(id,user_id,room_id,created_at) VALUES($1,$2,$3,$4) RETURNING id',
					[crypto.randomUUID(), user.id, roomId, now()],
				)
			).rows[0];
		});
	}
	async function removeBookmark(userId, id) {
		await db.query(
			'DELETE FROM halastudy.study_bookmarks WHERE id=$1 AND user_id=$2',
			[id, userId],
		);
	}
	async function agenda(userId) {
		const rows = await db.query(
			`SELECT s.id,s.cohort_id,s.room_id,s.title,s.starts_at,s.duration_minutes,c.name AS circle_name,r.status,
            (SELECT COUNT(*) FROM halastudy.study_rsvps r2 JOIN halastudy.cohort_members m2 ON m2.cohort_id=s.cohort_id AND m2.user_id=r2.user_id WHERE r2.session_id=s.id AND r2.status='going') AS going
            FROM halastudy.scheduled_sessions s JOIN halastudy.cohorts c ON c.id=s.cohort_id AND c.archived=false
            JOIN halastudy.cohort_members m ON m.cohort_id=c.id AND m.user_id=$1
            LEFT JOIN halastudy.study_rsvps r ON r.session_id=s.id AND r.user_id=$1
            WHERE s.starts_at+s.duration_minutes::bigint*60000>=$2 AND s.starts_at<=$3 ORDER BY s.starts_at LIMIT 200`,
			[userId, now(), now() + 366 * 86400000],
		);
		return rows.rows;
	}
	async function rsvp(userId, sessionId, status) {
		requireCondition(
			['going', 'maybe', 'declined'].includes(status),
			'STUDY_VALUE_INVALID',
		);
		return db.transaction(async (tx) => {
			const found = (
				await tx.query(
					'SELECT cohort_id FROM halastudy.scheduled_sessions WHERE id=$1',
					[sessionId],
				)
			).rows[0];
			requireCondition(found, 'SESSION_NOT_FOUND', 404);
			await tx.query(
				'SELECT id FROM halastudy.cohorts WHERE id=$1 FOR UPDATE',
				[found.cohort_id],
			);
			await cohorts.membership(userId, found.cohort_id, tx);
			requireCondition(
				(
					await tx.query(
						'SELECT id FROM halastudy.scheduled_sessions WHERE id=$1 AND starts_at+duration_minutes::bigint*60000>$2',
						[sessionId, now()],
					)
				).rows.length,
				'SESSION_NOT_FOUND',
				404,
			);
			await tx.query(
				`INSERT INTO halastudy.study_rsvps(session_id,user_id,status,updated_at) VALUES($1,$2,$3,$4)
                ON CONFLICT(session_id,user_id) DO UPDATE SET status=$3,updated_at=$4`,
				[sessionId, userId, status, now()],
			);
			return { status };
		});
	}
	async function resources(userId, cohortId) {
		return db.transaction(async (tx) => {
			await tx.query('SELECT id FROM halastudy.cohorts WHERE id=$1 FOR SHARE', [
				cohortId,
			]);
			const member = await cohorts.membership(userId, cohortId, tx);
			const rows = (
				await tx.query(
					'SELECT id,title,url,note,created_at FROM halastudy.study_resources WHERE cohort_id=$1 AND archived=false ORDER BY created_at DESC LIMIT 50',
					[cohortId],
				)
			).rows;
			return { resources: rows, canManage: member.canSupervise };
		});
	}
	async function addResource(userId, cohortId, input) {
		requireCondition(
			input && typeof input === 'object' && !Array.isArray(input),
			'STUDY_VALUE_INVALID',
		);
		const title = clean(input.title, 100),
			note = clean(input.note || '', 1000, false);
		requireCondition(
			typeof input.url === 'string' && input.url.length <= 2048,
			'STUDY_URL_INVALID',
		);
		let url;
		try {
			url = new URL(input.url);
		} catch {
			requireCondition(false, 'STUDY_URL_INVALID');
		}
		requireCondition(
			url.protocol === 'https:' && !url.username && !url.password,
			'STUDY_URL_INVALID',
		);
		requireCondition(
			typeof input.requestId === 'string' &&
				/^[0-9a-f-]{36}$/i.test(input.requestId),
			'STUDY_VALUE_INVALID',
		);
		const digest = hash(JSON.stringify([title, url.href, note]));
		return db.transaction(async (tx) => {
			await tx.query(
				'SELECT id FROM halastudy.cohorts WHERE id=$1 FOR UPDATE',
				[cohortId],
			);
			requireCondition(
				(await cohorts.membership(userId, cohortId, tx)).canSupervise,
				'FORBIDDEN',
				403,
			);
			const old = (
				await tx.query(
					'SELECT id,request_hash FROM halastudy.study_resources WHERE cohort_id=$1 AND mutation_key=$2',
					[cohortId, input.requestId],
				)
			).rows[0];
			if (old) {
				requireCondition(
					old.request_hash === digest,
					'STUDY_RETRY_CONFLICT',
					409,
				);
				return { id: old.id };
			}
			requireCondition(
				Number(
					(
						await tx.query(
							'SELECT COUNT(*) AS n FROM halastudy.study_resources WHERE cohort_id=$1 AND archived=false',
							[cohortId],
						)
					).rows[0].n,
				) < 50,
				'STUDY_LIMIT',
				409,
			);
			return (
				await tx.query(
					'INSERT INTO halastudy.study_resources(id,cohort_id,created_by,title,url,note,mutation_key,request_hash,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
					[
						crypto.randomUUID(),
						cohortId,
						userId,
						title,
						url.href,
						note,
						input.requestId,
						digest,
						now(),
					],
				)
			).rows[0];
		});
	}
	async function archiveResource(userId, cohortId, id) {
		await db.transaction(async (tx) => {
			await tx.query(
				'SELECT id FROM halastudy.cohorts WHERE id=$1 FOR UPDATE',
				[cohortId],
			);
			requireCondition(
				(await cohorts.membership(userId, cohortId, tx)).canSupervise,
				'FORBIDDEN',
				403,
			);
			requireCondition(
				(
					await tx.query(
						'UPDATE halastudy.study_resources SET archived=true WHERE id=$1 AND cohort_id=$2 RETURNING id',
						[id, cohortId],
					)
				).rows.length,
				'STUDY_NOT_FOUND',
				404,
			);
		});
	}
	return {
		bookmarks,
		bookmark,
		removeBookmark,
		agenda,
		rsvp,
		resources,
		addResource,
		archiveResource,
	};
}

// RFC 5545: UTF-8 octet folding, TEXT escaping, CRLF lines, stable event UIDs.
function agendaCalendar(sessions, now = Date.now()) {
	const escapeText = (value) =>
		String(value)
			.replace(/\\/g, '\\\\')
			.replace(/\r\n|\r|\n/g, '\\n')
			.replace(/;/g, '\\;')
			.replace(/,/g, '\\,');
	const stamp = (value) =>
		new Date(Number(value))
			.toISOString()
			.replace(/[-:]/g, '')
			.replace(/\.\d{3}Z$/, 'Z');
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Halastudy//Personal agenda//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
	];
	for (const s of sessions.filter((s) => s.status !== 'declined'))
		lines.push(
			'BEGIN:VEVENT',
			`UID:${s.id}@halastudy`,
			`DTSTAMP:${stamp(now)}`,
			`DTSTART:${stamp(s.starts_at)}`,
			`DTEND:${stamp(Number(s.starts_at) + s.duration_minutes * 60000)}`,
			`SUMMARY:${escapeText(s.title)}`,
			`DESCRIPTION:${escapeText(s.circle_name)}`,
			'END:VEVENT',
		);
	lines.push('END:VCALENDAR');
	return (
		lines
			.map((line) => {
				let result = '',
					bytes = 0;
				for (const char of line) {
					const size = Buffer.byteLength(char);
					if (bytes + size > 75) {
						result += '\r\n ';
						bytes = 1;
					}
					result += char;
					bytes += size;
				}
				return result;
			})
			.join('\r\n')
	).concat('\r\n');
}
module.exports = { createStudyCommunity, agendaCalendar };
