const { dayKey } = require('./common');

// Read-only suggestions. Room entry still performs its normal access/password checks.
async function dashboard(platform, rooms, user, timestamp = Date.now()) {
    const recent = [...(user.myRooms || [])].sort((a, b) => b.lastJoinedAt - a.lastJoinedAt);
    let recentRoom = null;
    for (const entry of recent.slice(0, 50)) {
        const room = rooms.get(entry.roomId);
        if (room && await platform.canJoin(entry.roomId, user)) {
            recentRoom = { id: room.id, name: room.name, passwordProtected: !!room.passwordHash };
            break;
        }
    }
    const day = dayKey(timestamp);
    const [appointments, focus] = await Promise.all([
        platform.db.query(`SELECT s.id,s.title,s.room_id,s.starts_at,s.duration_minutes FROM halastudy.scheduled_sessions s
            JOIN halastudy.cohort_members m ON m.cohort_id=s.cohort_id AND m.user_id=$1
            JOIN halastudy.cohorts c ON c.id=s.cohort_id AND c.archived=false
            WHERE s.starts_at >= $2 ORDER BY s.starts_at LIMIT 100`, [user.id, timestamp]),
        platform.db.query(`SELECT COALESCE(SUM(COALESCE((daily_ms->>$2)::bigint,0)),0) AS milliseconds
            FROM halastudy.focus_sessions WHERE user_id=$1 AND state='completed'`, [user.id, day])
    ]);
    let nextSession = null;
    for (const session of appointments.rows) {
        if (rooms.has(session.room_id) && await platform.canJoin(session.room_id, user)) {
            nextSession = session;
            break;
        }
    }
    const milliseconds = Number(focus.rows[0].milliseconds);
    return { recentRoom, nextSession, today: { day, timeZone: 'Asia/Riyadh', minutes: Math.floor(milliseconds / 60000) } };
}

module.exports = { dashboard };
