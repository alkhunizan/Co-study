const {
    VIDEO_PROVIDER_MESH,
    VIDEO_PROVIDER_REALTIMEKIT
} = require('../../server-config');
const { createMeshProvider } = require('./mesh-provider');
const { createRealtimeKitProvider } = require('./realtimekit-provider');

/**
 * @param {{ config?: Record<string, any>, logger?: any, fetchImpl?: typeof fetch }} [options]
 */
function createVideoProvider({ config, logger, fetchImpl } = {}) {
    const providerName = config?.provider || VIDEO_PROVIDER_REALTIMEKIT;
    if (providerName === VIDEO_PROVIDER_MESH) {
        return createMeshProvider();
    }
    if (providerName === VIDEO_PROVIDER_REALTIMEKIT) {
        return createRealtimeKitProvider({ config, logger, fetchImpl });
    }
    throw new Error(`Unsupported video provider: ${providerName}`);
}

module.exports = {
    createVideoProvider
};
