const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
test('F09 routine is finite, pauses, survives serialization, requires deliberate transitions and never awards credit', () => {
	const context = {};
	vm.runInNewContext(
		fs.readFileSync(path.resolve('public/js/study-routine.js'), 'utf8'),
		context,
	);
	const api = context.HalaRoutine,
		r = {
			id: 'r',
			focus_minutes: 25,
			break_minutes: 5,
			long_break_minutes: 15,
			cycles: 4,
			long_every: 2,
		};
	let state = api.create(r);
	assert.equal(state.status, 'ready');
	state = api.transition(state, 'start', 1000);
	state = api.tick(state, 61000);
	assert.equal(state.remaining, 24 * 60000);
	state = api.transition(state, 'pause', 61000);
	assert.equal(api.tick(state, 1000000).remaining, 24 * 60000);
	state = JSON.parse(JSON.stringify(state));
	state = api.transition(state, 'start', 1000000);
	state = api.tick(state, 1000000 + 24 * 60000);
	assert.equal(state.status, 'awaiting');
	assert.equal(state.phase, 'focus');
	assert.equal(
		api.tick(state, 900000000).phase,
		'focus',
		'no unattended next round',
	);
	state = api.transition(state, 'next', 900000000);
	assert.equal(state.phase, 'break');
	assert.equal(state.remaining, 5 * 60000);
	state = api.tick(state, 900300000);
	state = api.transition(state, 'next', 900300000);
	assert.equal(state.round, 2);
	assert.equal(state.status, 'ready');
	state = api.transition(state, 'start', 900300000);
	state = api.tick(state, 901800000);
	state = api.transition(state, 'next', 901800000);
	assert.equal(state.phase, 'long');
	assert.equal(state.remaining, 15 * 60000);
	state = {
		...state,
		round: 4,
		phase: 'focus',
		status: 'awaiting',
		remaining: 0,
	};
	state = api.transition(state, 'next', 1);
	assert.equal(state.status, 'done');
	assert.equal(state.round, 4);
	assert.equal('credited_ms' in state, false);
	assert.equal('xp' in state, false);
});
