const assert = require('node:assert/strict');
const test = require('node:test');

const {
    findOpenOccurrence,
    getScheduleExpiryAt,
    normalizeSchedule,
    recordScheduleJoin
} = require('../../schedule-utils');

test('a recurring occurrence closes after its own focus and break window', () => {
    const schedule = normalizeSchedule({
        timezone: 'Asia/Riyadh',
        startDate: '2026-07-15',
        startTime: '10:00',
        cadence: 'daily',
        focusMinutes: 25,
        breakMinutes: 5,
        endDate: '2026-07-20'
    }, { strict: true, now: Date.UTC(2026, 6, 14) });

    assert.ok(schedule);
    const afterWindow = Date.UTC(2026, 6, 15, 7, 31);
    const occurrence = findOpenOccurrence(schedule, afterWindow);
    assert.equal(occurrence.currentOccurrenceAt, null);
    assert.equal(occurrence.isLiveNow, false);
    assert.equal(occurrence.nextOccurrenceAt, Date.UTC(2026, 6, 16, 7, 0));
});

test('recurring schedules default to 90 days and reject horizons over 365 days', () => {
    const defaulted = normalizeSchedule({
        startDate: '2026-07-15',
        startTime: '10:00',
        cadence: 'daily'
    }, { strict: true, now: Date.UTC(2026, 6, 14) });

    assert.equal(defaulted.endDate, '2026-10-13');
    assert.equal(normalizeSchedule({
        startDate: '2026-07-15',
        startTime: '10:00',
        cadence: 'daily',
        endDate: '2027-07-16'
    }, { strict: true, now: Date.UTC(2026, 6, 14) }), null);
});

test('nonexistent and ambiguous local DST times fail schedule validation', () => {
    const nonexistent = normalizeSchedule({
        timezone: 'America/New_York',
        startDate: '2026-03-08',
        startTime: '02:30',
        cadence: 'once'
    }, { strict: true, now: Date.UTC(2026, 2, 1) });
    const ambiguous = normalizeSchedule({
        timezone: 'America/New_York',
        startDate: '2026-11-01',
        startTime: '01:30',
        cadence: 'once'
    }, { strict: true, now: Date.UTC(2026, 9, 1) });

    assert.equal(nonexistent, null);
    assert.equal(ambiguous, null);
});

test('attendance uses stable occurrence IDs and reconnects deduplicate', () => {
    const schedule = normalizeSchedule({
        startDate: '2026-07-15',
        startTime: '10:00',
        cadence: 'once'
    }, { strict: true, now: Date.UTC(2026, 6, 14) });
    const joinedAt = Date.UTC(2026, 6, 15, 6, 55);

    assert.equal(recordScheduleJoin(schedule, joinedAt), true);
    assert.equal(recordScheduleJoin(schedule, joinedAt + 1000), false);
    assert.equal(schedule.attendance.length, 1);
    assert.equal(schedule.attendance[0].occurrenceId, '2026-07-15T07:00:00.000Z');
    assert.equal(
        getScheduleExpiryAt(schedule),
        Date.UTC(2026, 6, 15, 8, 0)
    );
});
