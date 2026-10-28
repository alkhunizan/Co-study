const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { repoRoot } = require('../helpers/test-env');

const BACKUP_KEY = Buffer.alloc(32, 5).toString('base64');

function commandEnvironment(overrides = {}) {
    return {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
        NODE_ENV: 'test',
        ...overrides
    };
}

function runScript(relativePath, args, env) {
    return spawnSync(process.execPath, [path.join(repoRoot, relativePath), ...args], {
        cwd: repoRoot,
        env: commandEnvironment(env),
        encoding: 'utf8',
        timeout: 15_000
    });
}

test('encrypted backup CLI defaults restore to dry-run and requires both apply guards', (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-backup-cli-'));
    const roomStateFile = path.join(workDir, 'rooms.json');
    const backupDir = path.join(workDir, 'backups');
    fs.writeFileSync(roomStateFile, `${JSON.stringify([{ id: 'SAFE1', name: 'Secret Room' }])}\n`, 'utf8');
    t.after(() => fs.rmSync(workDir, { recursive: true, force: true }));
    const env = {
        BACKUP_ENCRYPTION_KEY: BACKUP_KEY,
        ROOM_STATE_FILE: roomStateFile,
        ROOM_STATE_BACKUP_DIR: backupDir
    };

    const backup = runScript('scripts/backup-state.js', [], env);
    assert.equal(backup.status, 0, backup.stderr);
    const artifacts = fs.readdirSync(backupDir).filter((name) => name.endsWith('.hsbackup'));
    assert.equal(artifacts.length, 1);
    const artifactPath = path.join(backupDir, artifacts[0]);
    assert.doesNotMatch(fs.readFileSync(artifactPath, 'utf8'), /Secret Room/);

    fs.writeFileSync(roomStateFile, '[]\n', 'utf8');
    const dryRun = runScript('scripts/restore-state.js', [artifactPath], env);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /DRY RUN/i);
    assert.deepEqual(JSON.parse(fs.readFileSync(roomStateFile, 'utf8')), []);

    const unguarded = runScript('scripts/restore-state.js', [artifactPath, '--apply'], env);
    assert.notEqual(unguarded.status, 0);
    assert.match(unguarded.stderr, /--writer-stopped/i);

    const applied = runScript('scripts/restore-state.js', [artifactPath, '--apply', '--writer-stopped'], env);
    assert.equal(applied.status, 0, applied.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(roomStateFile, 'utf8')), [{ id: 'SAFE1', name: 'Secret Room' }]);
});

test('backup CLI fails when every configured source is unreadable', (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-backup-empty-'));
    const backupDir = path.join(workDir, 'backups');
    t.after(() => fs.rmSync(workDir, { recursive: true, force: true }));

    const result = runScript('scripts/backup-state.js', [], {
        BACKUP_ENCRYPTION_KEY: BACKUP_KEY,
        ROOM_STATE_FILE: path.join(workDir, 'missing-rooms.json'),
        ROOM_STATE_BACKUP_DIR: backupDir
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no readable backup sources/i);
    assert.equal(fs.existsSync(backupDir), false);
});

test('production backup refuses a room-only snapshot when Supabase is not configured', (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-backup-production-'));
    const roomStateFile = path.join(workDir, 'rooms.json');
    const backupDir = path.join(workDir, 'backups');
    fs.writeFileSync(roomStateFile, '[]\n');
    t.after(() => fs.rmSync(workDir, { recursive: true, force: true }));

    const result = runScript('scripts/backup-state.js', [], {
        NODE_ENV: 'production',
        BACKUP_ENCRYPTION_KEY: BACKUP_KEY,
        ROOM_STATE_FILE: roomStateFile,
        ROOM_STATE_BACKUP_DIR: backupDir
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Supabase.*required for production backups/i);
    assert.equal(fs.existsSync(backupDir), false);
});

test('pre-cutover pin refuses a partial artifact and leaves no pinned rollback file', (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-backup-pin-partial-'));
    const roomStateFile = path.join(workDir, 'rooms.json');
    const backupDir = path.join(workDir, 'backups');
    fs.writeFileSync(roomStateFile, '[]\n');
    t.after(() => fs.rmSync(workDir, { recursive: true, force: true }));

    const result = runScript('scripts/backup-state.js', ['--pin-pre-cutover'], {
        BACKUP_ENCRYPTION_KEY: BACKUP_KEY,
        ROOM_STATE_FILE: roomStateFile,
        ROOM_STATE_BACKUP_DIR: backupDir
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Pinned pre-cutover backup is incomplete.*profiles/i);
    assert.equal(fs.existsSync(path.join(backupDir, 'pinned')), false);
});

test('rooms-only restore fails closed without live tombstones when a room references an account', (t) => {
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-backup-owned-room-'));
    const roomStateFile = path.join(workDir, 'rooms.json');
    const backupDir = path.join(workDir, 'backups');
    fs.writeFileSync(roomStateFile, `${JSON.stringify([{ id: 'OWNED', ownerUserId: 'deleted-user' }])}\n`);
    t.after(() => fs.rmSync(workDir, { recursive: true, force: true }));
    const env = {
        BACKUP_ENCRYPTION_KEY: BACKUP_KEY,
        ROOM_STATE_FILE: roomStateFile,
        ROOM_STATE_BACKUP_DIR: backupDir
    };

    const backup = runScript('scripts/backup-state.js', [], env);
    assert.equal(backup.status, 0, backup.stderr);
    const artifactPath = path.join(
        backupDir,
        fs.readdirSync(backupDir).find((name) => name.endsWith('.hsbackup'))
    );
    const restore = runScript('scripts/restore-state.js', [artifactPath], env);

    assert.notEqual(restore.status, 0);
    assert.match(restore.stderr, /Supabase credentials are required.*filter deletion tombstones/i);
});

test('nightly templates run as the service account and load only its protected env file', () => {
    const wrapper = fs.readFileSync(path.join(repoRoot, 'scripts/deploy/backup.sh'), 'utf8');
    const restoreWrapper = fs.readFileSync(path.join(repoRoot, 'scripts/deploy/restore.sh'), 'utf8');
    const service = fs.readFileSync(path.join(repoRoot, 'scripts/deploy/halastudy-backup.service'), 'utf8');
    const timer = fs.readFileSync(path.join(repoRoot, 'scripts/deploy/halastudy-backup.timer'), 'utf8');
    const cron = fs.readFileSync(path.join(repoRoot, 'scripts/deploy/halastudy-backup.cron'), 'utf8');
    const bootstrap = fs.readFileSync(path.join(repoRoot, 'scripts/deploy/bootstrap.sh'), 'utf8');

    assert.match(wrapper, /SERVICE_USER="halastudy"/);
    assert.match(wrapper, /ENV_FILE="\/var\/lib\/halastudy\/\.env"/);
    assert.match(wrapper, /400\|600/);
    assert.match(wrapper, /umask 077/);
    assert.match(wrapper, /--with-r2/);
    assert.match(wrapper, /BACKUP_R2_ENABLED/);
    assert.match(wrapper, /backup_r2_enabled="\$\{BACKUP_R2_ENABLED:-false\}"/);
    assert.match(wrapper, /if \[\[ "\$\{backup_r2_enabled\}" == "true" \]\]; then/);
    assert.match(wrapper, /R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET/);
    assert.match(wrapper, /--pin-pre-cutover/);
    assert.match(wrapper, /--upload-pinned-pre-cutover/);
    assert.match(wrapper, /scripts\/backup-r2\.js --apply-retention/);
    assert.match(wrapper, /^set -euo pipefail$/m);
    assert.match(restoreWrapper, /SERVICE_USER="halastudy"/);
    assert.match(restoreWrapper, /ENV_FILE="\/var\/lib\/halastudy\/\.env"/);
    assert.match(restoreWrapper, /400\|600/);
    assert.match(restoreWrapper, /scripts\/restore-state\.js/);
    assert.match(restoreWrapper, /pm2 pid co-study/);
    assert.match(service, /^User=halastudy$/m);
    assert.match(service, /^Group=halastudy$/m);
    assert.match(service, /^UMask=0077$/m);
    assert.match(service, /ExecStart=\/opt\/halastudy\/scripts\/deploy\/backup\.sh/);
    assert.doesNotMatch(service, /--with-r2/);
    assert.match(service, /^ProtectSystem=strict$/m);
    assert.match(service, /^ReadWritePaths=\/var\/lib\/halastudy\/backups$/m);
    assert.match(timer, /^OnCalendar=.*02:15:00 UTC$/m);
    assert.match(cron, /^CRON_TZ=UTC$/m);
    assert.match(cron, /^15 2 \* \* \* halastudy \/opt\/halastudy\/scripts\/deploy\/backup\.sh$/m);
    assert.doesNotMatch(cron, /--with-r2/);
    assert.match(bootstrap, /install -m 0644 .*halastudy-backup\.service/);
    assert.match(bootstrap, /systemctl daemon-reload/);
    assert.doesNotMatch(service, /^User=root$/m);
});
