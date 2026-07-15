const { verifyDeployment } = require('./deploy-verifier');

async function main() {
    const baseUrl = process.argv[2];
    if (!baseUrl) {
        throw new Error('Usage: npm run verify:deploy -- <baseUrl>');
    }

    const result = await verifyDeployment(baseUrl);
    console.log(`Health OK: ${result.mode}, build ${result.version}`);
    console.log(`Readiness OK: ${result.readinessChecks.join(', ')}`);
    console.log(`Metrics OK: ${result.roomCount} rooms, ${result.participantCount} participants, rss ${result.memoryRssMb}MB`);
    console.log(`Runtime OK: ${result.videoProvider}, Socket.IO ${result.socketTransport}`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
