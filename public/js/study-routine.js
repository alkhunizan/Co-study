(() => {
	// Guidance only: this state machine never grants time or rewards.
	function create(routine) {
		return {
			routine: { ...routine },
			round: 1,
			phase: 'focus',
			status: 'ready',
			remaining: routine.focus_minutes * 60000,
			stamp: 0,
			sessionId: null,
		};
	}
	function tick(state, now) {
		if (state.status !== 'running') return { ...state };
		const elapsed = Math.max(0, now - state.stamp),
			remaining = Math.max(0, state.remaining - elapsed);
		return {
			...state,
			remaining,
			stamp: now,
			status: remaining === 0 ? 'awaiting' : 'running',
		};
	}
	function transition(state, action, now) {
		const next = tick(state, now),
			r = next.routine;
		if (action === 'pause' && next.status === 'running')
			return { ...next, status: 'paused' };
		if (action === 'start' && ['ready', 'paused'].includes(next.status))
			return { ...next, status: 'running', stamp: now };
		if (action === 'next' && next.status === 'awaiting') {
			if (next.phase === 'focus') {
				if (next.round >= r.cycles)
					return { ...next, status: 'done', sessionId: null };
				const long = next.round % r.long_every === 0;
				return {
					...next,
					phase: long ? 'long' : 'break',
					status: 'running',
					remaining: (long ? r.long_break_minutes : r.break_minutes) * 60000,
					stamp: now,
					sessionId: null,
				};
			}
			return {
				...next,
				round: next.round + 1,
				phase: 'focus',
				status: 'ready',
				remaining: r.focus_minutes * 60000,
				stamp: 0,
				sessionId: null,
			};
		}
		return next;
	}
	const global = /** @type {any} */ (globalThis);
	global.HalaRoutine = { create, tick, transition };
})();
