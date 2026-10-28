const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const { repoRoot } = require('../helpers/test-env');

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

function runMigration(args, env) {
    return spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'migrate-rooms.js'), ...args], {
        cwd: repoRoot,
        env: commandEnvironment(env),
        encoding: 'utf8',
        timeout: 15_000
    });
}

function fixture(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-room-migration-cli-'));
    const roomFile = path.join(directory, 'rooms.json');
    const userFile = path.join(directory, 'users.json');
    const backupDir = path.join(directory, 'backups');
    const rooms = [
        {
            id: ' sentinel-join-code-7x ',
            passwordHash: 'sensitive-password-hash',
            messages: [{ text: 'private-message' }],
            schedule: {
                timezone: 'Asia/Riyadh',
                startDate: '2026-07-20',
                startTime: '10:00',
                cadence: 'once'
            },
            board: {
                goal: '',
                tasks: Array.from({ length: 101 }, (_, index) => ({
                    id: `task-${index}`,
                    text: index === 100 ? 'private-overflow-task-body-sentinel' : `Task ${index}`,
                    priority: 2,
                    done: false
                }))
            }
        }
    ];
    fs.writeFileSync(roomFile, `${JSON.stringify(rooms, null, 2)}\n`, 'utf8');
    fs.writeFileSync(userFile, `${JSON.stringify([
        { id: 'owner-id', myRooms: [{ roomId: 'SENTINEL-JOIN-CODE-7X', role: 'created' }] }
    ])}\n`, 'utf8');
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    return {
        directory,
        roomFile,
        userFile,
        backupDir,
        env: {
            ROOM_STATE_FILE: roomFile,
            USER_STATE_FILE: userFile,
            ROOM_STATE_BACKUP_DIR: backupDir
        }
    };
}

test('room migration CLI defaults to a metadata-only dry-run and writes nothing', (t) => {
    const state = fixture(t);
    const beforeRoom = fs.readFileSync(state.roomFile, 'utf8');
    const beforeUser = fs.readFileSync(state.userFile, 'utf8');

    const result = runMigration([], state.env);

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.mode, 'dry-run');
    assert.equal(report.mutationsPerformed, false);
    assert.equal(report.applied, false);
    assert.equal(report.summary.ownership.unique, 1);
    assert.equal(report.summary.expiryAdded, 1);
    assert.equal(report.summary.overflowRooms, 1);
    assert.equal(report.rooms[0].roomId, undefined);
    assert.equal(
        report.rooms[0].roomIdSha256,
        crypto.createHash('sha256').update('SENTINEL-JOIN-CODE-7X').digest('hex')
    );
    assert.equal(report.rooms[0].ownership.candidateCount, 1);
    assert.deepEqual(report.rooms[0].ownership.candidateUserIdSha256, [
        crypto.createHash('sha256').update('owner-id').digest('hex')
    ]);
    assert.equal(report.rooms[0].ownership.toOwnerUserId, undefined);
    assert.equal(report.migratedRooms, undefined);
    assert.equal(report.overflowArchive, undefined);
    assert.doesNotMatch(
        result.stdout,
        /sensitive-password-hash|private-message|private-overflow-task-body-sentinel|SENTINEL-JOIN-CODE-7X/
    );
    assert.equal(fs.readFileSync(state.roomFile, 'utf8'), beforeRoom);
    assert.equal(fs.readFileSync(state.userFile, 'utf8'), beforeUser);
    assert.equal(fs.existsSync(state.backupDir), false);
});

test('room migration CLI enforces both apply guards, creates an exclusive checksummed backup, and reruns idempotently', (t) => {
    const state = fixture(t);
    const original = fs.readFileSync(state.roomFile, 'utf8');

    const applyOnly = runMigration(['--apply'], state.env);
    assert.notEqual(applyOnly.status, 0);
    assert.match(applyOnly.stderr, /--writer-stopped/);
    assert.equal(fs.readFileSync(state.roomFile, 'utf8'), original);

    const writerOnly = runMigration(['--writer-stopped'], state.env);
    assert.notEqual(writerOnly.status, 0);
    assert.match(writerOnly.stderr, /--apply/);
    assert.equal(fs.readFileSync(state.roomFile, 'utf8'), original);

    fs.mkdirSync(state.backupDir, { recursive: true });
    const sentinel = path.join(state.backupDir, 'existing-backup.json');
    fs.writeFileSync(sentinel, 'do-not-overwrite', 'utf8');
    const applied = runMigration(['--apply', '--writer-stopped'], state.env);
    assert.equal(applied.status, 0, applied.stderr);
    const report = JSON.parse(applied.stdout);
    assert.equal(report.applied, true);
    assert.equal(report.mutationsPerformed, true);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'do-not-overwrite');

    const migrated = JSON.parse(fs.readFileSync(state.roomFile, 'utf8'));
    assert.equal(migrated[0].schemaVersion, 2);
    assert.equal(migrated[0].id, 'SENTINEL-JOIN-CODE-7X');
    assert.equal(migrated[0].ownerUserId, 'owner-id');
    assert.ok(Number.isFinite(migrated[0].expiresAt));
    assert.equal(migrated[0].board.tasks.length, 100);

    const backupFiles = fs.readdirSync(state.backupDir).filter((name) => name.includes('.pre-room-v2.'));
    assert.equal(backupFiles.length, 1);
    const backupPath = path.join(state.backupDir, backupFiles[0]);
    const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    assert.equal(backup.sourceSha256, crypto.createHash('sha256').update(original).digest('hex'));
    assert.equal(Buffer.from(backup.sourceBase64, 'base64').toString('utf8'), original);
    if (process.platform !== 'win32') assert.equal(fs.statSync(backupPath).mode & 0o777, 0o600);

    const migratedText = fs.readFileSync(state.roomFile, 'utf8');
    const rerun = runMigration(['--apply', '--writer-stopped'], state.env);
    assert.equal(rerun.status, 0, rerun.stderr);
    const rerunReport = JSON.parse(rerun.stdout);
    assert.equal(rerunReport.changesRequired, false);
    assert.equal(rerunReport.applied, false);
    assert.equal(rerunReport.mutationsPerformed, false);
    assert.equal(fs.readFileSync(state.roomFile, 'utf8'), migratedText);
    assert.equal(
        fs.readdirSync(state.backupDir).filter((name) => name.includes('.pre-room-v2.')).length,
        1
    );
});

test('production room migration CLI fails closed before reading local users when Supabase is incomplete', (t) => {
    const state = fixture(t);
    const result = runMigration([], {
        ...state.env,
        NODE_ENV: 'production'
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /complete Supabase.*required/i);
    assert.equal(fs.existsSync(state.backupDir), false);
});

test('blocking reports and apply errors fingerprint join codes instead of logging them', (t) => {
    const state = fixture(t);
    const blockedCode = 'PRIVATE-BLOCKED-CODE-9Q';
    fs.writeFileSync(state.roomFile, `${JSON.stringify([{
        id: blockedCode,
        schedule: { startDate: 'not-a-date', startTime: '10:00', cadence: 'once' }
    }])}\n`, 'utf8');

    const dryRun = runMigration([], state.env);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    const report = JSON.parse(dryRun.stdout);
    assert.equal(report.blockingIssueCount, 1);
    assert.match(report.blockingIssues[0].issueSha256, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(dryRun.stdout, new RegExp(blockedCode));

    const apply = runMigration(['--apply', '--writer-stopped'], state.env);
    assert.notEqual(apply.status, 0);
    assert.match(apply.stderr, /blocked by 1 issue/i);
    assert.doesNotMatch(apply.stderr, new RegExp(blockedCode));
    assert.equal(fs.existsSync(state.backupDir), false);
});
