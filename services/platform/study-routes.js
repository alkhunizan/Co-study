const express = require('express');
const { agendaCalendar } = require('./study-community');

function createStudyRouter({ platform, rooms, logger }) {
	const router = express.Router();
	router.use((req, res, next) => {
		const expected = req.get('X-Halastudy-Account');
		if (expected && expected !== req.user.id)
			return res.status(401).json({ errorCode: 'AUTH_ACCOUNT_CHANGED' });
		next();
	});
	const handle = (fn) => async (req, res) => {
		try {
			await fn(req, res);
		} catch (error) {
			const known = typeof error.errorCode === 'string';
			if (!known)
				logger.error({ event: 'study_request_failed', path: req.path });
			res
				.status(known ? error.status : 503)
				.json({ errorCode: known ? error.errorCode : 'SERVICE_UNAVAILABLE' });
		}
	};
	const id = (req) => req.user.id;
	router.get(
		'/overview',
		handle(async (req, res) =>
			res.json(await platform.study.overview(id(req))),
		),
	);
	router.get(
		'/insights',
		handle(async (req, res) =>
			res.json(await platform.study.insights(id(req))),
		),
	);
	router.get(
		'/journal',
		handle(async (req, res) => {
			const { features } = await platform.entitlements.resolve(id(req));
			res.json(
				await platform.study.journal(
					id(req),
					req.query,
					features['progress.history_days'],
				),
			);
		}),
	);
	router.put(
		'/preferences',
		handle(async (req, res) =>
			res.json(await platform.study.preferences(id(req), req.body)),
		),
	);
	router.get(
		'/preferences',
		handle(async (req, res) =>
			res.json(await platform.study.preferences(id(req))),
		),
	);
	router.put(
		'/focus/:id/task',
		handle(async (req, res) =>
			res.json(
				await platform.study.linkFocus(id(req), req.params.id, req.body),
			),
		),
	);
	router.put(
		'/focus/:id/reflection',
		handle(async (req, res) =>
			res.json(await platform.study.reflect(id(req), req.params.id, req.body)),
		),
	);
	router.post(
		'/tasks/:id/complete',
		handle(async (req, res) =>
			res.json(
				await platform.study.completeTask(id(req), req.params.id, req.body),
			),
		),
	);
	router.post(
		'/distractions/:id/convert',
		handle(async (req, res) =>
			res.json(await platform.study.convertDistraction(id(req), req.params.id)),
		),
	);
	for (const kind of ['projects', 'tasks', 'distractions', 'routines']) {
		router.post(
			`/${kind}`,
			handle(async (req, res) =>
				res.json(await platform.study.create(id(req), kind, req.body)),
			),
		);
		router.patch(
			`/${kind}/:id`,
			handle(async (req, res) =>
				res.json(
					await platform.study.update(id(req), kind, req.params.id, req.body),
				),
			),
		);
	}
	router.get(
		'/bookmarks',
		handle(async (req, res) =>
			res.json({
				bookmarks: await platform.studyCommunity.bookmarks(
					req.user,
					rooms,
					platform.canJoin,
				),
			}),
		),
	);
	router.post(
		'/bookmarks',
		handle(async (req, res) =>
			res.json(
				await platform.studyCommunity.bookmark(
					req.user,
					req.body?.roomId,
					rooms,
					platform.canJoin,
				),
			),
		),
	);
	router.delete(
		'/bookmarks/:id',
		handle(async (req, res) => {
			await platform.studyCommunity.removeBookmark(id(req), req.params.id);
			res.json({ ok: true });
		}),
	);
	router.get(
		'/agenda',
		handle(async (req, res) =>
			res.json({
				sessions: await platform.studyCommunity.agenda(id(req)),
				serverNow: Date.now(),
			}),
		),
	);
	router.get(
		'/calendar.ics',
		handle(async (req, res) => {
			res.setHeader(
				'Content-Disposition',
				'attachment; filename="halastudy-agenda.ics"',
			);
			res
				.type('text/calendar')
				.send(agendaCalendar(await platform.studyCommunity.agenda(id(req))));
		}),
	);
	router.put(
		'/agenda/:id/rsvp',
		handle(async (req, res) =>
			res.json(
				await platform.studyCommunity.rsvp(
					id(req),
					req.params.id,
					req.body?.status,
				),
			),
		),
	);
	router.get(
		'/circles/:id/resources',
		handle(async (req, res) =>
			res.json(await platform.studyCommunity.resources(id(req), req.params.id)),
		),
	);
	router.post(
		'/circles/:id/resources',
		handle(async (req, res) =>
			res.json(
				await platform.studyCommunity.addResource(
					id(req),
					req.params.id,
					req.body,
				),
			),
		),
	);
	router.delete(
		'/circles/:id/resources/:resource',
		handle(async (req, res) => {
			await platform.studyCommunity.archiveResource(
				id(req),
				req.params.id,
				req.params.resource,
			);
			res.json({ ok: true });
		}),
	);
	return router;
}
module.exports = { createStudyRouter };
