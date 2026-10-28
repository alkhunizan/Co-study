const DEFAULT_SCHEDULE_TIMEZONE = 'Asia/Riyadh';
const DEFAULT_SCHEDULE_CADENCE = 'weekdays';
const DEFAULT_FOCUS_MINUTES = 25;
const DEFAULT_BREAK_MINUTES = 5;
const DEFAULT_JOIN_EARLY_WINDOW_MINUTES = 15;
const DEFAULT_ON_TIME_GRACE_MINUTES = 10;
const DEFAULT_MIN_SESSION_WINDOW_MINUTES = 30;
const DEFAULT_RECURRING_DURATION_DAYS = 90;
const MAX_RECURRING_DURATION_DAYS = 365;
const SCHEDULE_EXPIRY_GRACE_MINUTES = 30;
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
const MAX_OCCURRENCE_ITERATIONS = 5000;
const zonedFormatterCache = new Map();

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

function normalizeCadence(value, strict = false) {
    if (typeof value !== 'string') {
        return DEFAULT_SCHEDULE_CADENCE;
    }
    const normalized = value.trim().toLowerCase();
    if (SUPPORTED_CADENCES.includes(normalized)) return normalized;
    return strict ? null : DEFAULT_SCHEDULE_CADENCE;
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

function normalizeTimezone(value) {
    const candidate = typeof value === 'string' && value.trim()
        ? value.trim()
        : DEFAULT_SCHEDULE_TIMEZONE;
    if (candidate.length > 64) return null;
    try {
        return new Intl.DateTimeFormat('en-US', { timeZone: candidate }).resolvedOptions().timeZone;
    } catch (_error) {
        return null;
    }
}

function getZonedFormatter(timezone) {
    if (!zonedFormatterCache.has(timezone)) {
        zonedFormatterCache.set(timezone, new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23'
        }));
    }
    return zonedFormatterCache.get(timezone);
}

function getZonedPartsFromTimestamp(timestamp, timezone) {
    if (!Number.isFinite(timestamp) || !timezone) return null;
    const values = {};
    getZonedFormatter(timezone).formatToParts(new Date(timestamp)).forEach((part) => {
        if (part.type !== 'literal') values[part.type] = Number.parseInt(part.value, 10);
    });
    if (![values.year, values.month, values.day, values.hour, values.minute, values.second].every(Number.isInteger)) {
        return null;
    }
    return {
        year: values.year,
        month: values.month,
        day: values.day,
        hour: values.hour,
        minute: values.minute,
        second: values.second,
        dayOfWeek: new Date(Date.UTC(values.year, values.month - 1, values.day)).getUTCDay()
    };
}

function getZonedDatePartsFromTimestamp(timestamp, timezone) {
    const parts = getZonedPartsFromTimestamp(timestamp, timezone);
    if (!parts) return null;
    return {
        year: parts.year,
        month: parts.month,
        day: parts.day,
        dayOfWeek: parts.dayOfWeek
    };
}

function localPartsMatch(left, right) {
    return left
        && left.year === right.year
        && left.month === right.month
        && left.day === right.day
        && left.hour === right.hour
        && left.minute === right.minute;
}

function getTimezoneOffsetMs(timestamp, timezone) {
    const roundedTimestamp = Math.floor(timestamp / 60000) * 60000;
    const parts = getZonedPartsFromTimestamp(roundedTimestamp, timezone);
    if (!parts) return null;
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0) - roundedTimestamp;
}

// Convert a wall-clock date/time to an instant. Returning null for zero or
// multiple matches deliberately rejects DST gaps and repeated wall times.
function timestampFromZonedParts(parts, timezone) {
    const naiveTimestamp = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
    const offsets = new Set();
    for (const probeHours of [-36, -12, 0, 12, 36]) {
        const offset = getTimezoneOffsetMs(naiveTimestamp + (probeHours * 60 * 60 * 1000), timezone);
        if (Number.isFinite(offset)) offsets.add(offset);
    }

    const matches = [];
    offsets.forEach((offset) => {
        const candidate = naiveTimestamp - offset;
        if (localPartsMatch(getZonedPartsFromTimestamp(candidate, timezone), parts)) {
            matches.push(candidate);
        }
    });
    return matches.length === 1 ? matches[0] : null;
}

function shiftCalendarDate(parts, days) {
    const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + (days * DAY_MS));
    return {
        year: probe.getUTCFullYear(),
        month: probe.getUTCMonth() + 1,
        day: probe.getUTCDate(),
        dayOfWeek: probe.getUTCDay()
    };
}

function formatDateKey(parts) {
    return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function formatOccurrenceId(timestamp) {
    return new Date(timestamp).toISOString();
}

function getScheduleStartTimestamp(schedule) {
    const dateParts = parseDateString(schedule?.startDate);
    const timeParts = parseTimeString(schedule?.startTime);
    if (!dateParts || !timeParts) return null;
    const timezone = normalizeTimezone(schedule?.timezone);
    if (!timezone) return null;
    return timestampFromZonedParts({
        year: dateParts.year,
        month: dateParts.month,
        day: dateParts.day,
        hour: timeParts.hour,
        minute: timeParts.minute
    }, timezone);
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

    const timezone = normalizeTimezone(schedule.timezone);
    const currentDate = getZonedDatePartsFromTimestamp(currentTimestamp, timezone);
    const timeParts = parseTimeString(schedule.startTime);
    if (!currentDate || !timeParts) {
        return null;
    }

    let nextDate;
    if (cadence === CADENCE_DAILY) {
        nextDate = shiftCalendarDate(currentDate, 1);
    } else if (cadence === CADENCE_WEEKLY) {
        nextDate = shiftCalendarDate(currentDate, 7);
    } else {
        nextDate = shiftCalendarDate(currentDate, 1);
        while (!isSaudiWeekday(nextDate.dayOfWeek)) {
            nextDate = shiftCalendarDate(nextDate, 1);
        }
    }

    if (schedule.endDate && formatDateKey(nextDate) > schedule.endDate) return null;
    return timestampFromZonedParts({
        ...nextDate,
        hour: timeParts.hour,
        minute: timeParts.minute
    }, timezone);
}

function normalizeAttendanceEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return null;
    }

    const scheduledAt = typeof entry.scheduledAt === 'number' ? entry.scheduledAt : null;
    const status = typeof entry.status === 'string' && ATTENDANCE_PRIORITY[entry.status] !== undefined
        ? entry.status
        : null;

    if (!Number.isFinite(scheduledAt) || !status) {
        return null;
    }

    const normalized = {
        // scheduledAt is the canonical source. Converting legacy local-time
        // IDs here prevents duplicate attendance when a v1 room reconnects.
        occurrenceId: formatOccurrenceId(scheduledAt),
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

    const cadence = normalizeCadence(schedule.cadence, strict);
    const timezone = normalizeTimezone(schedule.timezone);
    if (!cadence || !timezone) return null;

    const startTimestamp = timestampFromZonedParts({
        year: dateParts.year,
        month: dateParts.month,
        day: dateParts.day,
        hour: timeParts.hour,
        minute: timeParts.minute
    }, timezone);
    if (startTimestamp === null) return null;

    if (strict && cadence === CADENCE_ONCE && startTimestamp < now) {
        return null;
    }

    let endDate;
    if (cadence === CADENCE_ONCE) {
        if (strict && schedule.endDate !== undefined && schedule.endDate !== dateParts.key) return null;
        endDate = dateParts.key;
    } else {
        const explicitEndDate = schedule.endDate === undefined || schedule.endDate === null || schedule.endDate === ''
            ? null
            : parseDateString(schedule.endDate);
        if (schedule.endDate && !explicitEndDate) return null;
        const defaultEnd = shiftCalendarDate(dateParts, DEFAULT_RECURRING_DURATION_DAYS);
        endDate = explicitEndDate?.key || formatDateKey(defaultEnd);
        const endParts = explicitEndDate || defaultEnd;
        const durationDays = Math.round(
            (Date.UTC(endParts.year, endParts.month - 1, endParts.day)
                - Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day)) / DAY_MS
        );
        if (durationDays < 0 || durationDays > MAX_RECURRING_DURATION_DAYS) return null;
    }

    const normalized = {
        timezone,
        title: sanitizeText(schedule.title, titleMaxLength, titleFallback),
        startDate: dateParts.key,
        startTime: timeParts.key,
        endDate,
        cadence,
        focusMinutes: normalizePositiveInteger(schedule.focusMinutes, DEFAULT_FOCUS_MINUTES),
        breakMinutes: normalizePositiveInteger(schedule.breakMinutes, DEFAULT_BREAK_MINUTES),
        boardGoalTemplate: sanitizeText(schedule.boardGoalTemplate, goalMaxLength),
        attendance: normalizeAttendanceHistory(schedule.attendance)
    };

    // Validate every wall-clock occurrence in the bounded schedule. This is
    // what turns invalid IANA zones, DST gaps and repeated local times into the
    // public SCHEDULE_INVALID response instead of silently shifting a session.
    let occurrence = startTimestamp;
    let iterations = 0;
    while (occurrence !== null && iterations < MAX_OCCURRENCE_ITERATIONS) {
        const next = nextOccurrenceTimestamp(normalized, occurrence);
        if (next === null) {
            if (cadence === CADENCE_ONCE) break;
            const occurrenceDate = getZonedDatePartsFromTimestamp(occurrence, timezone);
            if (!occurrenceDate) return null;
            let nextDate;
            if (cadence === CADENCE_DAILY) nextDate = shiftCalendarDate(occurrenceDate, 1);
            else if (cadence === CADENCE_WEEKLY) nextDate = shiftCalendarDate(occurrenceDate, 7);
            else {
                nextDate = shiftCalendarDate(occurrenceDate, 1);
                while (!isSaudiWeekday(nextDate.dayOfWeek)) nextDate = shiftCalendarDate(nextDate, 1);
            }
            if (formatDateKey(nextDate) <= endDate) return null;
            break;
        }
        occurrence = next;
        iterations += 1;
    }
    if (iterations >= MAX_OCCURRENCE_ITERATIONS) return null;
    return normalized;
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

        const closeAt = occurrenceAt + sessionWindowMs;
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

    iterateOccurrences(schedule, (occurrenceAt) => {
        const closeAt = occurrenceAt + sessionWindowMs;
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

function getScheduleExpiryAt(schedule) {
    if (!schedule) return null;
    let finalOccurrenceAt = null;
    iterateOccurrences(schedule, (occurrenceAt) => {
        finalOccurrenceAt = occurrenceAt;
        return true;
    });
    if (finalOccurrenceAt === null) return null;
    return /** @type {number} */ (finalOccurrenceAt)
        + getScheduleWindowMs(schedule)
        + (SCHEDULE_EXPIRY_GRACE_MINUTES * 60 * 1000);
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
        endDate: normalized.endDate,
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
    findOpenOccurrence,
    getScheduleExpiryAt,
    normalizeSchedule,
    recordScheduleJoin,
    rollScheduleAttendance
};
