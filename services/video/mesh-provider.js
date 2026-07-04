const { VIDEO_PROVIDER_MESH } = require('../../server-config');

function createMeshProvider() {
    return {
        getProviderName() {
            return VIDEO_PROVIDER_MESH;
        },
        async ensureRoomMeeting({ roomId }) {
            return {
                provider: VIDEO_PROVIDER_MESH,
                meetingId: `mesh:${roomId}`,
                reused: true
            };
        },
        async createParticipantToken({ roomId, userId }) {
            return {
                provider: VIDEO_PROVIDER_MESH,
                meetingId: `mesh:${roomId}`,
                participantId: userId,
                authToken: '',
                expiresAt: null
            };
        },
        async closeRoomMeeting() {
            return { ok: true };
        }
    };
}

module.exports = {
    createMeshProvider
};
