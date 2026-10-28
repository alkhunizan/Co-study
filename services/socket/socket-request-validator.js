const ROOM_NAME_MAX_LENGTH = 48;
const ROOM_PASSWORD_MAX_LENGTH = 64;
const ROOM_ID_MAX_LENGTH = 64;
const NICKNAME_MAX_LENGTH = 20;
const CLIENT_ID_MAX_LENGTH = 64;
const CHAT_MESSAGE_MAX_LENGTH = 500;
const BOARD_GOAL_MAX_LENGTH = 80;
const BOARD_TASK_MAX_BYTES = 500;
const BOARD_TASK_LIMIT = 100;
const BOARD_TASK_ID_MAX_LENGTH = 128;
const SOCKET_ID_MAX_LENGTH = 128;
const REPORT_DETAIL_MAX_LENGTH = 200;
const SDP_MAX_BYTES = 64 * 1024;
const ICE_CANDIDATE_MAX_BYTES = 8 * 1024;
const ICE_FIELD_MAX_LENGTH = 256;

const MEDIA_MODES = new Set(['mesh', 'sfu']);
const SCHEDULE_CADENCES = new Set(['once', 'daily', 'weekdays', 'weekly']);
const BOARD_PRIORITIES = new Set([1, 2, 3]);
const STATUS_PRESETS = new Set(['meal', 'away', 'studying', 'working']);
const AMBIENT_TYPES = new Set(['rain', 'forest', 'fire', 'cafe', 'ocean']);
const TIMER_MODES = new Set(['focus', 'break']);
const REPORT_REASONS = new Set(['spam', 'harassment', 'inappropriate', 'other']);

function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function hasOwn(value, key) {
    return Object.hasOwn(value, key);
}

function hasOnlyKeys(value, allowedKeys) {
    return Object.keys(value).every((key) => allowedKeys.has(key));
}

function codePointLength(value) {
    return Array.from(value).length;
}

function isBoundedString(value, maxLength, options = {}) {
    if (typeof value !== 'string') return false;
    const length = codePointLength(value);
    const minimum = options.allowEmpty === false ? 1 : 0;
    return length >= minimum && length <= maxLength;
}

function isBoundedUtf8(value, maxBytes, options = {}) {
    if (typeof value !== 'string') return false;
    if (options.allowEmpty === false && value.length === 0) return false;
    return Buffer.byteLength(value, 'utf8') <= maxBytes;
}

function optional(value, key, validator) {
    return !hasOwn(value, key) || validator(value[key]);
}

function nullable(value, validator) {
    return value === null || validator(value);
}

function isIntegerLikeInRange(value, minimum, maximum) {
    if (Number.isInteger(value)) return value >= minimum && value <= maximum;
    if (typeof value !== 'string' || !/^\d{1,3}$/.test(value)) return false;
    const parsed = Number(value);
    return parsed >= minimum && parsed <= maximum;
}

function validateSchedule(schedule) {
    if (!isPlainObject(schedule)) return false;
    const allowedKeys = new Set([
        'title',
        'startDate',
        'startTime',
        'endDate',
        'cadence',
        'timezone',
        'focusMinutes',
        'breakMinutes',
        'boardGoalTemplate'
    ]);
    if (!hasOnlyKeys(schedule, allowedKeys)) return false;
    if (!hasOwn(schedule, 'startDate')
        || typeof schedule.startDate !== 'string'
        || !/^\d{4}-\d{2}-\d{2}$/.test(schedule.startDate)) return false;
    if (!hasOwn(schedule, 'startTime')
        || typeof schedule.startTime !== 'string'
        || !/^\d{2}:\d{2}$/.test(schedule.startTime)) return false;
    return optional(schedule, 'title', (value) => isBoundedString(value, ROOM_NAME_MAX_LENGTH))
        && optional(schedule, 'endDate', (value) => nullable(
            value,
            (candidate) => typeof candidate === 'string'
                && (candidate === '' || /^\d{4}-\d{2}-\d{2}$/.test(candidate))
        ))
        && optional(schedule, 'cadence', (value) => SCHEDULE_CADENCES.has(value))
        && optional(schedule, 'timezone', (value) => isBoundedString(value, 64, { allowEmpty: false }))
        && optional(schedule, 'focusMinutes', (value) => isIntegerLikeInRange(value, 1, 240))
        && optional(schedule, 'breakMinutes', (value) => isIntegerLikeInRange(value, 1, 240))
        && optional(schedule, 'boardGoalTemplate', (value) => isBoundedString(value, BOARD_GOAL_MAX_LENGTH));
}

function validateCreateRoom(payload) {
    const allowedKeys = new Set(['roomName', 'password', 'requirePassword', 'mediaMode', 'schedule']);
    if (!hasOnlyKeys(payload, allowedKeys)) return false;
    if (!hasOwn(payload, 'roomName') || !isBoundedString(payload.roomName, ROOM_NAME_MAX_LENGTH)) return false;
    return optional(payload, 'password', (value) => isBoundedString(value, ROOM_PASSWORD_MAX_LENGTH))
        && optional(payload, 'requirePassword', (value) => typeof value === 'boolean')
        && optional(payload, 'mediaMode', (value) => MEDIA_MODES.has(value))
        && optional(payload, 'schedule', (value) => nullable(value, validateSchedule));
}

function validateJoinRoom(payload) {
    const allowedKeys = new Set(['roomId', 'username', 'clientId', 'password']);
    if (!hasOnlyKeys(payload, allowedKeys)) return false;
    if (!hasOwn(payload, 'roomId') || !isBoundedString(payload.roomId, ROOM_ID_MAX_LENGTH, { allowEmpty: false })) {
        return false;
    }
    if (!hasOwn(payload, 'username') || !isBoundedString(payload.username, NICKNAME_MAX_LENGTH)) return false;
    return optional(payload, 'clientId', (value) => isBoundedString(value, CLIENT_ID_MAX_LENGTH))
        && optional(payload, 'password', (value) => isBoundedString(value, ROOM_PASSWORD_MAX_LENGTH));
}

function validateSendMessage(payload) {
    const allowedKeys = new Set(['roomId', 'text']);
    if (!hasOnlyKeys(payload, allowedKeys)) return false;
    if (!hasOwn(payload, 'text') || !isBoundedString(payload.text, CHAT_MESSAGE_MAX_LENGTH)) return false;
    return optional(payload, 'roomId', (value) => isBoundedString(value, ROOM_ID_MAX_LENGTH, { allowEmpty: false }));
}

function validateBoardGoal(payload) {
    return hasOnlyKeys(payload, new Set(['goal']))
        && hasOwn(payload, 'goal')
        && isBoundedString(payload.goal, BOARD_GOAL_MAX_LENGTH);
}

function validateBoardAddTask(payload) {
    const allowedKeys = new Set(['text', 'priority']);
    return hasOnlyKeys(payload, allowedKeys)
        && hasOwn(payload, 'text')
        && isBoundedUtf8(payload.text, BOARD_TASK_MAX_BYTES)
        && optional(payload, 'priority', (value) => BOARD_PRIORITIES.has(value));
}

function validateTaskId(value) {
    return isBoundedString(value, BOARD_TASK_ID_MAX_LENGTH, { allowEmpty: false });
}

function validateBoardToggleTask(payload) {
    return hasOnlyKeys(payload, new Set(['taskId', 'done']))
        && hasOwn(payload, 'taskId')
        && validateTaskId(payload.taskId)
        && hasOwn(payload, 'done')
        && typeof payload.done === 'boolean';
}

function validateBoardDeleteTask(payload) {
    return hasOnlyKeys(payload, new Set(['taskId']))
        && hasOwn(payload, 'taskId')
        && validateTaskId(payload.taskId);
}

function validateBoardReorderTasks(payload) {
    if (!hasOnlyKeys(payload, new Set(['taskIds'])) || !Array.isArray(payload.taskIds)) return false;
    if (payload.taskIds.length > BOARD_TASK_LIMIT) return false;
    if (!payload.taskIds.every(validateTaskId)) return false;
    return new Set(payload.taskIds).size === payload.taskIds.length;
}

function validateCameraStatus(payload) {
    return hasOnlyKeys(payload, new Set(['camera']))
        && hasOwn(payload, 'camera')
        && typeof payload.camera === 'boolean';
}

function validateSessionDescription(value, expectedType) {
    return isPlainObject(value)
        && hasOnlyKeys(value, new Set(['type', 'sdp']))
        && value.type === expectedType
        && hasOwn(value, 'sdp')
        && isBoundedUtf8(value.sdp, SDP_MAX_BYTES, { allowEmpty: false });
}

function validateRtcDescription(payload, expectedType) {
    return hasOnlyKeys(payload, new Set(['targetId', 'sdp']))
        && hasOwn(payload, 'targetId')
        && isBoundedString(payload.targetId, SOCKET_ID_MAX_LENGTH, { allowEmpty: false })
        && hasOwn(payload, 'sdp')
        && validateSessionDescription(payload.sdp, expectedType);
}

function validateIceCandidate(candidate) {
    if (!isPlainObject(candidate)) return false;
    const allowedKeys = new Set(['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment']);
    if (!hasOnlyKeys(candidate, allowedKeys)) return false;
    if (!hasOwn(candidate, 'candidate') || !isBoundedUtf8(candidate.candidate, ICE_CANDIDATE_MAX_BYTES)) {
        return false;
    }
    return optional(candidate, 'sdpMid', (value) => nullable(
        value,
        (candidateValue) => isBoundedString(candidateValue, ICE_FIELD_MAX_LENGTH)
    ))
        && optional(candidate, 'sdpMLineIndex', (value) => nullable(
            value,
            (candidateValue) => Number.isInteger(candidateValue) && candidateValue >= 0 && candidateValue <= 65_535
        ))
        && optional(candidate, 'usernameFragment', (value) => nullable(
            value,
            (candidateValue) => isBoundedString(candidateValue, ICE_FIELD_MAX_LENGTH)
        ));
}

function validateRtcIce(payload) {
    return hasOnlyKeys(payload, new Set(['targetId', 'candidate']))
        && hasOwn(payload, 'targetId')
        && isBoundedString(payload.targetId, SOCKET_ID_MAX_LENGTH, { allowEmpty: false })
        && hasOwn(payload, 'candidate')
        && validateIceCandidate(payload.candidate);
}

function validateStatus(status) {
    if (!isPlainObject(status)) return false;
    const allowedKeys = new Set([
        'text',
        'visible',
        'goal',
        'manual',
        'manualPreset',
        'autoSync',
        'ambientType',
        'timerMode',
        // Kept for the 14-day client transition. The server authors the value
        // it broadcasts and never trusts this timestamp.
        'updatedAt'
    ]);
    if (!hasOnlyKeys(status, allowedKeys)) return false;
    return optional(status, 'text', (value) => isBoundedString(value, 80))
        && optional(status, 'visible', (value) => typeof value === 'boolean')
        && optional(status, 'goal', (value) => isBoundedString(value, BOARD_GOAL_MAX_LENGTH))
        && optional(status, 'manual', (value) => isBoundedString(value, 40))
        && optional(status, 'manualPreset', (value) => nullable(value, (candidate) => STATUS_PRESETS.has(candidate)))
        && optional(status, 'autoSync', (value) => typeof value === 'boolean')
        && optional(status, 'ambientType', (value) => nullable(value, (candidate) => AMBIENT_TYPES.has(candidate)))
        && optional(status, 'timerMode', (value) => nullable(value, (candidate) => TIMER_MODES.has(candidate)))
        && optional(status, 'updatedAt', (value) => Number.isFinite(value) && value >= 0);
}

function validateUserStatus(payload) {
    return hasOnlyKeys(payload, new Set(['status']))
        && hasOwn(payload, 'status')
        && validateStatus(payload.status);
}

function validateReportUser(payload) {
    const allowedKeys = new Set(['targetId', 'reason', 'detail']);
    return hasOnlyKeys(payload, allowedKeys)
        && hasOwn(payload, 'targetId')
        && isBoundedString(payload.targetId, SOCKET_ID_MAX_LENGTH, { allowEmpty: false })
        && optional(payload, 'reason', (value) => REPORT_REASONS.has(value))
        && optional(payload, 'detail', (value) => isBoundedString(value, REPORT_DETAIL_MAX_LENGTH));
}

const validators = Object.freeze({
    'create-room': validateCreateRoom,
    'join-room': validateJoinRoom,
    'send-message': validateSendMessage,
    'board-set-goal': validateBoardGoal,
    'board-add-task': validateBoardAddTask,
    'board-toggle-task': validateBoardToggleTask,
    'board-delete-task': validateBoardDeleteTask,
    'board-reorder-tasks': validateBoardReorderTasks,
    'camera-status': validateCameraStatus,
    'rtc-offer': (payload) => validateRtcDescription(payload, 'offer'),
    'rtc-answer': (payload) => validateRtcDescription(payload, 'answer'),
    'rtc-ice': validateRtcIce,
    'user-status': validateUserStatus,
    'report-user': validateReportUser
});

const SOCKET_REQUEST_EVENTS = Object.freeze(Object.keys(validators));

function validateSocketRequest(eventName, payload) {
    try {
        if (!isPlainObject(payload)) return false;
        const validator = validators[eventName];
        if (typeof validator !== 'function') return false;
        return validator(payload) === true;
    } catch (_error) {
        return false;
    }
}

module.exports = {
    SOCKET_REQUEST_EVENTS,
    validateSocketRequest
};
