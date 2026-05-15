const DEFAULT_SCHEDULE_TIMEZONE = 'Asia/Riyadh';
const DEFAULT_SCHEDULE_CADENCE = 'weekdays';
const DEFAULT_FOCUS_MINUTES = 25;
const DEFAULT_BREAK_MINUTES = 5;
const DEFAULT_JOIN_EARLY_WINDOW_MINUTES = 15;
const DEFAULT_ON_TIME_GRACE_MINUTES = 10;
const DEFAULT_MIN_SESSION_WINDOW_MINUTES = 30;
const MAX_ATTENDANCE_HISTORY = 180;

const CADENCE_ONCE = 'once';
const CADENCE_DAILY = 'daily';
const CADENCE_WEEKDAYS = 'weekdays';
const CADENCE_WEEKLY = 'weekly';
const SUPPORTED_CADENCES = [
    CADENCE_ONCE,
    CADENCE_DAILY,
    CADENCE_WEEKDAYS,
    CADENCE_WEEKLY
];

const ATTENDANCE_ON_TIME = 'on_time';
const ATTENDANCE_LATE = 'late';
const ATTENDANCE_MISSED = 'missed';
const ATTENDANCE_PRIORITY = {
    [ATTENDANCE_MISSED]: 0,
    [ATTENDANCE_LATE]: 1,
    [ATTENDANCE_ON_TIME]: 2
};

const DAY_MS = 24 * 60 * 60 * 1000;
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const MAX_OCCURRENCE_ITERATIONS = 5000;

function sanitizeText(value, maxLength, fallback = '') {
    if (typeof value !== 'string') {
        return fallback;
    }
    const trimmed = value.trim().slice(0, maxLength);
    return trimmed || fallback;
}

function parseDateString(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const year = Number.parseInt(match[1], 10);
    const month = Number.parseInt(match[2], 10);
    const day = Number.parseInt(match[3], 10);
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (
        probe.getUTCFullYear() !== year
        || probe.getUTCMonth() !== month - 1
        || probe.getUTCDate() !== day
    ) {
        return null;
    }

    return {
        year,
        month,
        day,
        key: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    };
}

function parseTimeString(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;

    const hour = Number.parseInt(match[1], 10);
    const minute = Number.parseInt(match[2], 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return null;
    }

    return {
        hour,
        minute,
        key: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    };
}

function normalizeCadence(value) {
    if (typeof value !== 'string') {
        return DEFAULT_SCHEDULE_CADENCE;
    }
    const normalized = value.trim().toLowerCase();
    return SUPPORTED_CADENCES.includes(normalized) ? normalized : DEFAULT_SCHEDULE_CADENCE;
}

function normalizePositiveInteger(value, fallback, min = 1, max = 240) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isInteger(parsed)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, parsed));
}

function isSaudiWeekday(dayOfWeek) {
    return dayOfWeek >= 0 && dayOfWeek <= 4;
}

function getRiyadhPartsFromTimestamp(timestamp) {
    const date = new Date(timestamp + RIYADH_OFFSET_MS);
    return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        hour: date.getUTCHours(),
        minute: date.getUTCMinutes(),
        dayOfWeek: date.getUTCDay()
    };
}

function getRiyadhDatePartsFromTimestamp(timestamp) {
    const parts = getRiyadhPartsFromTimestamp(timestamp);
    return {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        dayOfWeek: parts.dayOfWeek
    };
}

function timestampFromRiyadhParts(parts) {
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour - 3, parts.minute, 0, 0);
}

function shiftRiyadhDate(parts, days) {
    const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + (days * DAY_MS));
    return {
        year: probe.getUTCFullYear(),
        month: probe.getUTCMonth() + 1,
        day: probe.getUTCDate(),
        dayOfWeek: probe.getUTCDay()
    };
}

function formatOccurrenceId(timestamp) {
    const parts = getRiyadhPartsFromTimestamp(timestamp);
    return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function getScheduleStartTimestamp(schedule) {
    const dateParts = parseDateString(schedule?.startDate);
    const timeParts = parseTimeString(schedule?.startTime);
    if (!dateParts || !timeParts) return null;
    return timestampFromRiyadhParts({
        year: dateParts.year,
        month: dateParts.month,
        day: dateParts.day,
        hour: timeParts.hour,
        minute: timeParts.minute
    });
}

function getScheduleWindowMs(schedule) {
    const focusMinutes = normalizePositiveInteger(schedule?.focusMinutes, DEFAULT_FOCUS_MINUTES);
    const breakMinutes = normalizePositiveInteger(schedule?.breakMinutes, DEFAULT_BREAK_MINUTES);
    return Math.max(DEFAULT_MIN_SESSION_WINDOW_MINUTES, focusMinutes + breakMinutes) * 60 * 1000;
}

function nextOccurrenceTimestamp(schedule, currentTimestamp) {
    if (!schedule || currentTimestamp === null || currentTimestamp === undefined) {
        return null;
    }

    const cadence = normalizeCadence(schedule.cadence);
    if (cadence === CADENCE_ONCE) {
        return null;
    }

    const currentDate = getRiyadhDatePartsFromTimestamp(currentTimestamp);
    const timeParts = parseTimeString(schedule.startTime);
    if (!timeParts) {
        return null;
    }

    if (cadence === CADENCE_DAILY) {
        const nextDate = shiftRiyadhDate(currentDate, 1);
        return timestampFromRiyadhParts({
            ...nextDate,
            hour: timeParts.hour,
            minute: timeParts.minute
        });
    }

    if (cadence === CADENCE_WEEKLY) {
        const nextDate = shiftRiyadhDate(currentDate, 7);
        return timestampFromRiyadhParts({
            ...nextDate,
            hour: timeParts.hour,
            minute: timeParts.minute
        });
    }

    let nextDate = shiftRiyadhDate(currentDate, 1);
    while (!isSaudiWeekday(nextDate.dayOfWeek)) {
        nextDate = shiftRiyadhDate(nextDate, 1);
    }
    return timestampFromRiyadhParts({
        ...nextDate,
        hour: timeParts.hour,
        minute: timeParts.minute
    });
}

function normalizeAttendanceEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
    }

    const occurrenceId = typeof entry.occurrenceId === 'string' && entry.occurrenceId.trim()
        ? entry.occurrenceId.trim()
        : null;
    const scheduledAt = typeof entry.scheduledAt === 'number' ? entry.scheduledAt : null;
    const status = typeof entry.status === 'string' && ATTENDANCE_PRIORITY[entry.status] !== undefined
        ? entry.status
        : null;

    if (!occurrenceId || !scheduledAt || !status) {
        return null;
    }

    const normalized = {
        occurrenceId,
        scheduledAt,
        status
    };
    if (typeof entry.joinedAt === 'number') {
        normalized.joinedAt = entry.joinedAt;
    }
    return normalized;
}

function normalizeAttendanceHistory(entries = []) {
    const history = Array.isArray(entries) ? entries : [];
    const merged = new Map();

    history.forEach((entry) => {
        const normalized = normalizeAttendanceEntry(entry);
        if (!normalized) return;

        const existing = merged.get(normalized.occurrenceId);
        if (!existing) {
            merged.set(normalized.occurrenceId, normalized);
            return;
        }

        if ((ATTENDANCE_PRIORITY[normalized.status] || 0) > (ATTENDANCE_PRIORITY[existing.status] || 0)) {
            merged.set(normalized.occurrenceId, normalized);
            return;
        }

        if (normalized.status === existing.status && typeof normalized.joinedAt === 'number') {
            const bestJoinedAt = typeof existing.joinedAt === 'number'
                ? Math.min(existing.joinedAt, normalized.joinedAt)
                : normalized.joinedAt;
            existing.joinedAt = bestJoinedAt;
        }
    });

    return Array.from(merged.values())
        .sort((left, right) => left.scheduledAt - right.scheduledAt)
        .slice(-MAX_ATTENDANCE_HISTORY);
}

/**
 * @param {Record<string, any>} schedule
 * @param {Record<string, any>} [options]
 */
function normalizeSchedule(schedule = {}, options = {}) {
    if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
        return null;
    }

    const {
        titleFallback = '',
        strict = false,
        now = Date.now(),
        titleMaxLength = 48,
        goalMaxLength = 80
    } = options;

    const dateParts = parseDateString(schedule.startDate);
    const timeParts = parseTimeString(schedule.startTime);
    if (!dateParts || !timeParts) {
        return null;
    }

    const cadence = normalizeCadence(schedule.cadence);
    const startTimestamp = timestampFromRiyadhParts({
        year: dateParts.year,
        month: dateParts.month,
        day: dateParts.day,
        hour: timeParts.hour,
        minute: timeParts.minute
    });

    if (strict && cadence === CADENCE_ONCE && startTimestamp < now) {
        return null;
    }

    return {
        timezone: DEFAULT_SCHEDULE_TIMEZONE,
        title: sanitizeText(schedule.title, titleMaxLength, titleFallback),
        startDate: dateParts.key,
        startTime: timeParts.key,
        cadence,
        focusMinutes: normalizePositiveInteger(schedule.focusMinutes, DEFAULT_FOCUS_MINUTES),
        breakMinutes: normalizePositiveInteger(schedule.breakMinutes, DEFAULT_BREAK_MINUTES),
        boardGoalTemplate: sanitizeText(schedule.boardGoalTemplate, goalMaxLength),
        attendance: normalizeAttendanceHistory(schedule.attendance)
    };
}

function iterateOccurrences(schedule, callback, options = {}) {
    const startedAt = getScheduleStartTimestamp(schedule);
    if (startedAt === null) return;

    let occurrence = startedAt;
    let iterations = 0;
    while (occurrence !== null && iterations < (options.maxIterations || MAX_OCCURRENCE_ITERATIONS)) {
        const nextOccurrence = nextOccurrenceTimestamp(schedule, occurrence);
        const shouldContinue = callback(occurrence, nextOccurrence);
        if (shouldContinue === false) {
            break;
        }
        if (typeof options.until === 'number' && occurrence > options.until) {
            break;
        }
        occurrence = nextOccurrence;
        iterations += 1;
    }
}

function findOpenOccurrence(schedule, now = Date.now()) {
    const earlyWindowMs = DEFAULT_JOIN_EARLY_WINDOW_MINUTES * 60 * 1000;
    const sessionWindowMs = getScheduleWindowMs(schedule);
    let result = {
        currentOccurrenceAt: null,
        nextOccurrenceAt: null,
        isLiveNow: false
    };

    iterateOccurrences(schedule, (occurrenceAt, nextOccurrenceAt) => {
        if (result.currentOccurrenceAt !== null && result.nextOccurrenceAt !== null) {
            return false;
        }

        const closeAt = nextOccurrenceAt || (occurrenceAt + sessionWindowMs);
        if (result.currentOccurrenceAt === null && now >= occurrenceAt - earlyWindowMs && now < closeAt) {
            result = {
                currentOccurrenceAt: occurrenceAt,
                nextOccurrenceAt: nextOccurrenceAt || null,
                isLiveNow: now >= occurrenceAt && now < occurrenceAt + sessionWindowMs
            };
        }

        if (result.nextOccurrenceAt === null && occurrenceAt > now) {
            result.nextOccurrenceAt = occurrenceAt;
            return false;
        }
        return true;
    }, { until: now + (370 * DAY_MS) });

    return result;
}

function rollScheduleAttendance(schedule, now = Date.now()) {
    if (!schedule) return false;

    const historyMap = new Map(normalizeAttendanceHistory(schedule.attendance).map((entry) => [entry.occurrenceId, entry]));
    const sessionWindowMs = getScheduleWindowMs(schedule);
    let changed = false;

    iterateOccurrences(schedule, (occurrenceAt, nextOccurrenceAt) => {
        const closeAt = nextOccurrenceAt || (occurrenceAt + sessionWindowMs);
        if (closeAt > now) {
            return false;
        }

        const occurrenceId = formatOccurrenceId(occurrenceAt);
        if (historyMap.has(occurrenceId)) {
            return true;
        }

        historyMap.set(occurrenceId, {
            occurrenceId,
            scheduledAt: occurrenceAt,
            status: ATTENDANCE_MISSED
        });
        changed = true;
        return true;
    }, { until: now });

    if (changed) {
        schedule.attendance = normalizeAttendanceHistory(Array.from(historyMap.values()));
    }
    return changed;
}

function recordScheduleJoin(schedule, now = Date.now()) {
    if (!schedule) return false;

    const changedFromRollup = rollScheduleAttendance(schedule, now);
    const { currentOccurrenceAt } = findOpenOccurrence(schedule, now);
    if (currentOccurrenceAt === null) {
        return changedFromRollup;
    }

    const occurrenceId = formatOccurrenceId(currentOccurrenceAt);
    const attendance = normalizeAttendanceHistory(schedule.attendance);
    const existing = attendance.find((entry) => entry.occurrenceId === occurrenceId);
    if (existing) {
        return changedFromRollup;
    }

    attendance.push({
        occurrenceId,
        scheduledAt: currentOccurrenceAt,
        status: now <= currentOccurrenceAt + (DEFAULT_ON_TIME_GRACE_MINUTES * 60 * 1000)
            ? ATTENDANCE_ON_TIME
            : ATTENDANCE_LATE,
        joinedAt: now
    });
    schedule.attendance = normalizeAttendanceHistory(attendance);
    return true;
}

function buildAttendanceSummary(schedule) {
    const history = normalizeAttendanceHistory(schedule?.attendance);
    const summary = {
        joinedOnTimeCount: 0,
        lateCount: 0,
        missedCount: 0,
        totalSessions: history.length,
        currentStreak: 0
    };

    history.forEach((entry) => {
        if (entry.status === ATTENDANCE_ON_TIME) summary.joinedOnTimeCount += 1;
        if (entry.status === ATTENDANCE_LATE) summary.lateCount += 1;
        if (entry.status === ATTENDANCE_MISSED) summary.missedCount += 1;
    });

    for (let index = history.length - 1; index >= 0; index -= 1) {
        if (history[index].status !== ATTENDANCE_ON_TIME) {
            break;
        }
        summary.currentStreak += 1;
    }

    summary.consistencyRate = summary.totalSessions
        ? Math.round((summary.joinedOnTimeCount / summary.totalSessions) * 100)
        : 0;

    return summary;
}

function buildScheduleSummary(schedule, now = Date.now()) {
    if (!schedule) return null;

    const normalized = normalizeSchedule(schedule, {
        titleFallback: schedule.title || '',
        strict: false,
        now
    });
    if (!normalized) {
        return null;
    }

    const sessionWindowMs = getScheduleWindowMs(normalized);
    const attendance = buildAttendanceSummary(normalized);
    const { currentOccurrenceAt, nextOccurrenceAt, isLiveNow } = findOpenOccurrence(normalized, now);
    const countdownTargetAt = currentOccurrenceAt !== null && now < currentOccurrenceAt
        ? currentOccurrenceAt
        : nextOccurrenceAt;

    return {
        timezone: normalized.timezone,
        title: normalized.title,
        startDate: normalized.startDate,
        startTime: normalized.startTime,
        cadence: normalized.cadence,
        focusMinutes: normalized.focusMinutes,
        breakMinutes: normalized.breakMinutes,
        boardGoalTemplate: normalized.boardGoalTemplate,
        nextOccurrenceAt,
        currentOccurrenceAt,
        countdownTargetAt,
        isLiveNow,
        sessionWindowMinutes: Math.round(sessionWindowMs / 60000),
        attendance
    };
}

module.exports = {
    buildScheduleSummary,
    normalizeSchedule,
    recordScheduleJoin,
    rollScheduleAttendance
};
