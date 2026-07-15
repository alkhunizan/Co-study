const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createR2ReadOnlyClient } = require('../../scripts/cloudflare/r2-client');
const {
    LEGACY_USER_PREFIX,
    parseArgs,
    runR2LegacyUserInventory
} = require('../../scripts/inventory-r2-legacy-users');

function tempReportPath(t) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'halastudy-r2-inventory-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    return path.join(directory, 'r2-report.json');
}

test('R2 legacy user inventory lists only users metadata and redacts identifier-bearing object keys', async (t) => {
    const calls = [];
    const client = Object.freeze({
        host: 'account.r2.cloudflarestorage.com',
        async listObjectsDetailed(bucket, prefix) {
            calls.push({ bucket, prefix });
            return [
                {
                    key: 'users/users.20260715T034500Z.json',
                    lastModified: '2026-07-15T03:45:01.000Z',
                    etag: 'safe-etag',
                    size: 2048,
                    storageClass: 'STANDARD'
                },
                {
                    key: 'users/private.student@example.com.json',
                    lastModified: '2026-07-15T03:50:00.000Z',
                    etag: 'private-etag',
                    size: 512,
                    storageClass: 'STANDARD'
                }
            ];
        }
    });
    const outputPath = tempReportPath(t);

    const result = await runR2LegacyUserInventory({
        bucket: 'halastudy-backups',
        client,
        outputPath,
        now: new Date('2026-07-15T06:30:00.000Z')
    });

    assert.deepEqual(calls, [{ bucket: 'halastudy-backups', prefix: LEGACY_USER_PREFIX }]);
    assert.equal(result.report.dryRun, true);
    assert.equal(result.report.metadataOnly, true);
    assert.equal(result.report.objectBodiesRead, false);
    assert.equal(result.report.mutationsPerformed, false);
    assert.equal(result.report.deletionPossible, false);
    assert.equal(result.report.candidateCount, 2);
    assert.equal(result.report.totalBytes, 2560);
    const candidates = /** @type {any[]} */ (result.report.candidates);
    assert.equal(candidates[0].key, 'users/users.20260715T034500Z.json');
    assert.equal(candidates[0].keyRedacted, false);
    assert.equal(candidates[1].key, undefined);
    assert.equal(candidates[1].keyRedacted, true);
    assert.equal(candidates[1].keyHint, 'users/[redacted].json');
    assert.match(candidates[1].keySha256, /^[a-f0-9]{64}$/);

    const serialized = fs.readFileSync(outputPath, 'utf8');
    assert.doesNotMatch(serialized, /private\.student@example\.com/);
    assert.doesNotMatch(serialized, /private-etag/);
});

test('R2 read-only client paginates metadata using GET and exposes no object mutation/body methods', async () => {
    const requests = [];
    const responses = [
        `<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult>
          <IsTruncated>true</IsTruncated>
          <Contents>
            <Key>users/users.20260715T034500Z.json</Key>
            <LastModified>2026-07-15T03:45:01.000Z</LastModified>
            <ETag>&quot;etag-one&quot;</ETag>
            <Size>2048</Size>
            <StorageClass>STANDARD</StorageClass>
          </Contents>
          <NextContinuationToken>next/token+one=</NextContinuationToken>
        </ListBucketResult>`,
        `<?xml version="1.0" encoding="UTF-8"?>
        <ListBucketResult>
          <IsTruncated>false</IsTruncated>
          <Contents>
            <Key>users/private&amp;name.json</Key>
            <LastModified>2026-07-15T03:50:00.000Z</LastModified>
            <ETag>&quot;etag-two&quot;</ETag>
            <Size>512</Size>
            <StorageClass>STANDARD</StorageClass>
          </Contents>
        </ListBucketResult>`
    ];
    const client = createR2ReadOnlyClient({
        endpoint: 'https://account.r2.cloudflarestorage.com',
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        fetchImpl: async (url, options) => {
            requests.push({ url, method: options.method });
            const text = responses.shift();
            return { ok: true, status: 200, text: async () => text };
        }
    });

    assert.equal(Object.isFrozen(client), true);
    assert.deepEqual(Object.keys(client).sort(), ['host', 'listObjectsDetailed']);
    for (const unavailable of ['deleteObject', 'putObject', 'getObject', 'createBucket']) {
        assert.equal(unavailable in client, false);
    }
    const objects = await client.listObjectsDetailed('halastudy-backups', LEGACY_USER_PREFIX);

    assert.equal(objects.length, 2);
    assert.equal(objects[0].etag, 'etag-one');
    assert.equal(objects[1].key, 'users/private&name.json');
    assert.deepEqual(requests.map((request) => request.method), ['GET', 'GET']);
    assert.match(requests[0].url, /prefix=users%2F/);
    assert.match(requests[1].url, /continuation-token=next%2Ftoken%2Bone%3D/);
});

test('R2 legacy user inventory CLI is prefix-locked and has no apply/delete mode', () => {
    assert.deepEqual(parseArgs(['--dry-run', '--output', 'report.json']), {
        dryRun: true,
        help: false,
        outputPath: 'report.json'
    });
    for (const args of [
        ['--delete'],
        ['--apply'],
        ['--prefix', 'rooms/'],
        ['--bucket', 'other-bucket']
    ]) {
        assert.throws(() => parseArgs(args), /unsupported argument/i);
    }

    const source = fs.readFileSync(
        path.join(__dirname, '..', '..', 'scripts', 'inventory-r2-legacy-users.js'),
        'utf8'
    );
    assert.doesNotMatch(source, /\.deleteObject\s*\(|\.putObject\s*\(|\.getObject\s*\(|\.createBucket\s*\(/);
    assert.doesNotMatch(source, /method\s*:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/i);
});
