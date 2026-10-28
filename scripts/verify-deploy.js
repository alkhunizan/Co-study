const fs = require('node:fs');
const path = require('node:path');

const { verifyDeployment } = require('./deploy-verifier');

const MAX_ENV_FILE_BYTES = 256 * 1024;
const VERIFICATION_ENV_KEYS = new Set([
    'NODE_ENV',
    'CLOUDFLARE_ACCOUNT_ID',
    'CLOUDFLARE_REALTIMEKIT_APP_ID',
    'CLOUDFLARE_REALTIMEKIT_API_TOKEN',
    'CLOUDFLARE_REALTIMEKIT_API_BASE_URL',
    'VIDEO_DEFAULT_PRESET_NAME',
    'VIDEO_VIEWER_PRESET_NAME',
    'ROOM_STATE_BACKUP_DIR',
    'BACKUP_ENCRYPTION_KEY',
    'DEPLOY_VERIFY_MAX_BACKUP_AGE_HOURS'
]);

function parseEnvValue(rawValue) {
    const value = String(rawValue || '').trim();
    if (value.length >= 2) {
        const first = value[0];
        const last = value[value.length - 1];
        if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
            return value.slice(1, -1);
        }
    }
    return value;
}

function selectVerificationEnv(source = {}) {
    const selected = {};
    for (const key of VERIFICATION_ENV_KEYS) {
        if (source[key] !== undefined) selected[key] = String(source[key]);
    }
    return selected;
}

function loadVerificationEnvFile(filePath, baseEnv = process.env) {
    const resolved = path.resolve(String(filePath || ''));
    let stat;
    try {
        stat = fs.statSync(resolved);
    } catch (_error) {
        throw new Error(`Deployment verification env file is unavailable: ${resolved}.`);
    }
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_ENV_FILE_BYTES) {
        throw new Error('Deployment verification env file has an invalid size.');
    }
    const selected = selectVerificationEnv(baseEnv);
    const contents = fs.readFileSync(resolved, 'utf8').replace(/^\uFEFF/, '');
    for (const [index, rawLine] of contents.split(/\r?\n/).entries()) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const separator = line.indexOf('=');
        if (separator < 1) {
            throw new Error(`Deployment verification env file has an invalid line at ${index + 1}.`);
        }
        const key = line.slice(0, separator).trim();
        if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
            throw new Error(`Deployment verification env file has an invalid key at line ${index + 1}.`);
        }
        if (!VERIFICATION_ENV_KEYS.has(key) || selected[key] !== undefined) continue;
        selected[key] = parseEnvValue(line.slice(separator + 1));
    }
    return selected;
}

function parseArguments(argv) {
    const args = Array.isArray(argv) ? [...argv] : [];
    let baseUrl = '';
    let envFile = '';
    let maxBackupAgeHours = '';
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (argument === '--env-file') {
            envFile = args[index + 1] || '';
            index += 1;
            if (!envFile) throw new Error('--env-file requires a path.');
            continue;
        }
        if (argument.startsWith('--env-file=')) {
            envFile = argument.slice('--env-file='.length);
            if (!envFile) throw new Error('--env-file requires a path.');
            continue;
        }
        if (argument === '--max-backup-age-hours') {
            maxBackupAgeHours = args[index + 1] || '';
            index += 1;
            if (!maxBackupAgeHours) throw new Error('--max-backup-age-hours requires a value.');
            continue;
        }
        if (argument.startsWith('--max-backup-age-hours=')) {
            maxBackupAgeHours = argument.slice('--max-backup-age-hours='.length);
            if (!maxBackupAgeHours) throw new Error('--max-backup-age-hours requires a value.');
            continue;
        }
        if (argument.startsWith('-')) throw new Error(`Unknown deployment verification option: ${argument}.`);
        if (baseUrl) throw new Error(`Unexpected deployment verification argument: ${argument}.`);
        baseUrl = argument;
    }
    if (!baseUrl) {
        throw new Error(
            'Usage: npm run verify:deploy -- <baseUrl> [--env-file <service.env>] [--max-backup-age-hours <hours>]'
        );
    }
    return { baseUrl, envFile, maxBackupAgeHours };
}

async function main(argv = process.argv.slice(2), baseEnv = process.env, logger = console) {
    const args = parseArguments(argv);
    const configuredEnvFile = args.envFile || String(baseEnv.DEPLOY_VERIFY_ENV_FILE || '').trim();
    const env = configuredEnvFile
        ? loadVerificationEnvFile(configuredEnvFile, baseEnv)
        : selectVerificationEnv(baseEnv);
    if (args.maxBackupAgeHours) {
        env.DEPLOY_VERIFY_MAX_BACKUP_AGE_HOURS = args.maxBackupAgeHours;
    }

    const result = await verifyDeployment(args.baseUrl, { env });
    logger.log(`Health OK: ${result.mode}, build ${result.version}`);
    logger.log(`Readiness OK: ${result.readinessChecks.join(', ')}`);
    logger.log(`Metrics OK: ${result.roomCount} rooms, ${result.participantCount} participants, rss ${result.memoryRssMb}MB`);
    logger.log(`Runtime OK: ${result.videoProvider}, Socket.IO ${result.socketTransport}`);
    if (result.realtimeKit) {
        logger.log(`RealtimeKit OK: presets ${result.realtimeKit.presets.join(', ')}, webhook ${result.realtimeKit.webhook}`);
    }
    if (result.backup) {
        logger.log(
            `Backup OK: ${result.backup.fileName}, age ${result.backup.ageHours}h (maximum ${result.backup.maxAgeHours}h)`
        );
    }
    return result;
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    loadVerificationEnvFile,
    main,
    parseArguments,
    selectVerificationEnv
};
