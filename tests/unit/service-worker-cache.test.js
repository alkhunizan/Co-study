const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const WORKER_SOURCE = fs.readFileSync(
    path.join(__dirname, '..', '..', 'public', 'js', 'service-worker.js'),
    'utf8'
);
const ORIGIN = 'https://halastudy.test';

function requestUrl(request) {
    const value = typeof request === 'string' ? request : request.url;
    return new URL(value, ORIGIN).href;
}

class FakeCache {
    constructor() {
        this.entries = new Map();
        this.failPutsRemaining = 0;
        this.failPutWhen = null;
    }

    async match(request) {
        const response = this.entries.get(requestUrl(request));
        return response ? response.clone() : undefined;
    }

    async put(request, response) {
        if (this.failPutsRemaining > 0) {
            this.failPutsRemaining -= 1;
            throw new Error('simulated cache quota failure');
        }
        if (this.failPutWhen && await this.failPutWhen(request, response)) {
            throw new Error('simulated metadata commit failure');
        }
        this.entries.set(requestUrl(request), response.clone());
    }

    async delete(request) {
        return this.entries.delete(requestUrl(request));
    }

    async keys() {
        return [...this.entries.keys()].map((url) => new Request(url));
    }
}

class FakeCacheStorage {
    constructor() {
        this.caches = new Map();
    }

    async open(name) {
        if (!this.caches.has(name)) this.caches.set(name, new FakeCache());
        return this.caches.get(name);
    }

    async keys() {
        return [...this.caches.keys()];
    }

    async delete(name) {
        return this.caches.delete(name);
    }
}

class SizedAudioResponse {
    constructor(label, byteLength) {
        this.label = label;
        this.byteLength = byteLength;
        this.ok = true;
        this.status = 200;
        this.statusText = 'OK';
        this.headers = new Headers({ 'content-type': 'audio/mpeg' });
    }

    clone() {
        return new SizedAudioResponse(this.label, this.byteLength);
    }

    async arrayBuffer() {
        return { byteLength: this.byteLength };
    }
}

function createHarness() {
    const cacheStorage = new FakeCacheStorage();
    const networkBodies = new Map();
    const networkRequests = [];
    const listeners = new Map();
    let networkEnabled = true;
    let claimedClients = false;
    let skippedWaiting = false;
    const self = {
        location: new URL(`${ORIGIN}/service-worker.js`),
        clients: {
            async claim() {
                claimedClients = true;
            }
        },
        async skipWaiting() {
            skippedWaiting = true;
        },
        addEventListener(type, listener) {
            listeners.set(type, listener);
        }
    };

    vm.runInNewContext(WORKER_SOURCE, {
        self,
        caches: cacheStorage,
        Headers,
        Request,
        Response,
        URL,
        Date,
        console,
        async fetch(request, options) {
            if (!networkEnabled) throw new Error('offline');
            const url = new URL(requestUrl(request));
            networkRequests.push({ url: url.href, options });
            return new Response(networkBodies.get(url.pathname) ?? `fresh:${url.pathname}`, {
                status: 200,
                headers: {
                    'content-type': url.pathname.endsWith('.js')
                        ? 'text/javascript; charset=utf-8'
                        : 'text/html; charset=utf-8'
                }
            });
        }
    }, { filename: 'public/js/service-worker.js' });

    return {
        api: self.__HALASTUDY_SW_TEST__,
        cacheStorage,
        listeners,
        networkBodies,
        networkRequests,
        setNetworkEnabled(value) {
            networkEnabled = value;
        },
        lifecycle() {
            return { claimedClients, skippedWaiting };
        }
    };
}

test('install and activate replace stale Halastudy caches with a versioned legal/client cache', async () => {
    const harness = createHarness();
    const { api, cacheStorage } = harness;
    await cacheStorage.open('halastudy-static-obsolete');
    await cacheStorage.open('halastudy-ambient-obsolete');
    await cacheStorage.open('third-party-cache');

    await api.install();
    const staticCache = await cacheStorage.open(api.STATIC_CACHE_NAME);
    for (const assetPath of ['/privacy', '/terms', '/js/halastudy-core.js', '/js/ui.js']) {
        assert.ok(await staticCache.match(`${ORIGIN}${assetPath}`), `${assetPath} should be precached`);
    }
    assert.ok(harness.networkRequests.every((request) => request.options?.cache === 'reload'));

    await api.activate();
    const cacheNames = await cacheStorage.keys();
    assert.ok(cacheNames.includes(api.STATIC_CACHE_NAME));
    assert.ok(cacheNames.includes('third-party-cache'));
    assert.ok(!cacheNames.includes('halastudy-static-obsolete'));
    assert.ok(!cacheNames.includes('halastudy-ambient-obsolete'));
    assert.deepEqual(harness.lifecycle(), { claimedClients: true, skippedWaiting: true });
});

test('network-first legal and client requests replace stale cached bodies and remain available offline', async () => {
    const harness = createHarness();
    const { api, cacheStorage, networkBodies } = harness;
    const cache = await cacheStorage.open(api.STATIC_CACHE_NAME);

    for (const assetPath of ['/privacy', '/js/halastudy-core.js']) {
        const request = new Request(`${ORIGIN}${assetPath}?deployment=next`);
        const cacheRequest = new Request(`${ORIGIN}${assetPath}`);
        await cache.put(cacheRequest, new Response(`stale:${assetPath}`));
        networkBodies.set(assetPath, `current:${assetPath}`);

        const networkResponse = await api.handleStaticRequest(request);
        assert.equal(await networkResponse.text(), `current:${assetPath}`);
        assert.equal(await (await cache.match(cacheRequest)).text(), `current:${assetPath}`);
    }
    assert.ok(harness.networkRequests.every((request) => request.options?.cache === 'no-cache'));

    harness.setNetworkEnabled(false);
    for (const assetPath of ['/privacy', '/js/halastudy-core.js']) {
        const cachedResponse = await api.handleStaticRequest(
            new Request(`${ORIGIN}${assetPath}?deployment=offline`)
        );
        assert.equal(await cachedResponse.text(), `current:${assetPath}`);
    }
});

test('fresh legal response is returned even when quota pressure prevents updating its fallback', async () => {
    const harness = createHarness();
    const { api, cacheStorage, networkBodies } = harness;
    const cache = await cacheStorage.open(api.STATIC_CACHE_NAME);
    const request = new Request(`${ORIGIN}/privacy`);
    await cache.put(request, new Response('stale privacy'));
    cache.failPutsRemaining = 1;
    networkBodies.set('/privacy', 'fresh privacy');

    const response = await api.handleStaticRequest(request);

    assert.equal(await response.text(), 'fresh privacy');
    assert.equal(await (await cache.match(request)).text(), 'stale privacy');
});

test('ambient audio cache never exceeds 50 MiB and evicts the least recently used body', async () => {
    const harness = createHarness();
    const { api, cacheStorage } = harness;
    const MiB = 1024 * 1024;
    const requestA = new Request(`${ORIGIN}/audio/rain.mp3`);
    const requestB = new Request(`${ORIGIN}/audio/forest.mp3`);
    const requestC = new Request(`${ORIGIN}/audio/chimney-fire.wav`);
    const requestD = new Request(`${ORIGIN}/audio/cafe.wav`);

    await api.storeAmbientResponse(requestA, new SizedAudioResponse('rain', 30 * MiB), 1);
    await api.storeAmbientResponse(requestB, new SizedAudioResponse('forest', 30 * MiB), 2);

    const audioCache = await cacheStorage.open(api.AMBIENT_CACHE_NAME);
    assert.equal(await audioCache.match(requestA), undefined);
    assert.ok(await audioCache.match(requestB));

    await api.storeAmbientResponse(requestC, new SizedAudioResponse('fire', 15 * MiB), 3);
    await api.touchAmbientEntry(requestB, 4);
    await api.storeAmbientResponse(requestD, new SizedAudioResponse('cafe', 20 * MiB), 5);

    assert.ok(await audioCache.match(requestB), 'recently touched forest entry should remain');
    assert.equal(await audioCache.match(requestC), undefined, 'least recently used fire entry should be evicted');
    assert.ok(await audioCache.match(requestD));

    const usage = await api.inspectAmbientUsage();
    assert.equal(usage.bytes, 50 * MiB);
    assert.ok(usage.bytes <= api.AMBIENT_CACHE_LIMIT_BYTES);

    const oversized = new Request(`${ORIGIN}/audio/waves.wav`);
    const cached = await api.storeAmbientResponse(
        oversized,
        new SizedAudioResponse('waves', (50 * MiB) + 1),
        6
    );
    assert.equal(cached, false);
    assert.equal(await audioCache.match(oversized), undefined);
    assert.equal((await api.inspectAmbientUsage()).bytes, 50 * MiB);
});

test('cached ambient playback survives an LRU metadata write failure', async () => {
    const harness = createHarness();
    const { api, cacheStorage } = harness;
    const request = new Request(`${ORIGIN}/audio/rain.mp3`);
    await api.storeAmbientResponse(request, new SizedAudioResponse('rain', 1024), 1);
    const metadataCache = await cacheStorage.open(api.AMBIENT_METADATA_CACHE_NAME);
    metadataCache.failPutsRemaining = 1;
    harness.setNetworkEnabled(false);

    const response = await api.handleAmbientRequest(request);

    assert.equal(response.label, 'rain');
});

test('authoritative body sizes prevent stale metadata from breaking the hard cache bound', async () => {
    const harness = createHarness();
    const { api, cacheStorage } = harness;
    const MiB = 1024 * 1024;
    const requestA = new Request(`${ORIGIN}/audio/rain.mp3`);
    const requestB = new Request(`${ORIGIN}/audio/forest.mp3`);
    await api.storeAmbientResponse(requestA, new SizedAudioResponse('old-rain', 1 * MiB), 1);

    const audioCache = await cacheStorage.open(api.AMBIENT_CACHE_NAME);
    await audioCache.put(requestA, new SizedAudioResponse('replacement-rain', 40 * MiB));
    await api.storeAmbientResponse(requestB, new SizedAudioResponse('forest', 20 * MiB), 2);

    let actualBytes = 0;
    for (const request of await audioCache.keys()) {
        const response = await audioCache.match(request);
        actualBytes += (await response.arrayBuffer()).byteLength;
    }
    assert.ok(actualBytes <= api.AMBIENT_CACHE_LIMIT_BYTES);
    assert.equal(await audioCache.match(requestA), undefined);
    assert.ok(await audioCache.match(requestB));
});

test('a failed replacement metadata commit cannot leave an under-counted body', async () => {
    const harness = createHarness();
    const { api, cacheStorage } = harness;
    const MiB = 1024 * 1024;
    const requestA = new Request(`${ORIGIN}/audio/rain.mp3`);
    const requestB = new Request(`${ORIGIN}/audio/forest.mp3`);
    await api.storeAmbientResponse(requestA, new SizedAudioResponse('old-rain', 10 * MiB), 1);

    const metadataCache = await cacheStorage.open(api.AMBIENT_METADATA_CACHE_NAME);
    metadataCache.failPutWhen = async (_request, response) => {
        const metadata = await response.clone().json();
        return metadata.entries?.[requestA.url]?.size === (40 * MiB);
    };
    assert.equal(
        await api.storeAmbientResponse(requestA, new SizedAudioResponse('replacement-rain', 40 * MiB), 2),
        true
    );
    metadataCache.failPutWhen = null;

    await api.storeAmbientResponse(requestB, new SizedAudioResponse('forest', 20 * MiB), 3);
    const audioCache = await cacheStorage.open(api.AMBIENT_CACHE_NAME);
    let actualBytes = 0;
    for (const request of await audioCache.keys()) {
        actualBytes += (await (await audioCache.match(request)).arrayBuffer()).byteLength;
    }
    assert.ok(actualBytes <= api.AMBIENT_CACHE_LIMIT_BYTES);
    assert.equal(await audioCache.match(requestA), undefined);
    assert.ok(await audioCache.match(requestB));
});

test('concurrent ambient insertions are serialized under the byte ceiling', async () => {
    const harness = createHarness();
    const { api, cacheStorage } = harness;
    const MiB = 1024 * 1024;
    const requests = ['one', 'two', 'three', 'four'].map((name) => {
        return new Request(`${ORIGIN}/audio/${name}.mp3`);
    });

    await Promise.all(requests.map((request, index) => {
        return api.storeAmbientResponse(request, new SizedAudioResponse(`body-${index}`, 20 * MiB), index + 1);
    }));

    const audioCache = await cacheStorage.open(api.AMBIENT_CACHE_NAME);
    let actualBytes = 0;
    for (const request of await audioCache.keys()) {
        actualBytes += (await (await audioCache.match(request)).arrayBuffer()).byteLength;
    }
    assert.equal(actualBytes, 40 * MiB);
    assert.equal(await audioCache.match(requests[0]), undefined);
    assert.equal(await audioCache.match(requests[1]), undefined);
    assert.ok(await audioCache.match(requests[2]));
    assert.ok(await audioCache.match(requests[3]));
});

test('ambient WAV request map points at browser-compatible compressed MP3 assets', () => {
    const { api } = createHarness();

    assert.equal(api.AMBIENT_SOURCE_MAP['/audio/chimney-fire.wav'], '/audio/chimney-fire.mp3');
    assert.equal(api.AMBIENT_SOURCE_MAP['/audio/cafe.wav'], '/audio/cafe.mp3');
    assert.equal(api.AMBIENT_SOURCE_MAP['/audio/waves.wav'], '/audio/waves.mp3');
});

test('compressed ambient targets are valid MP3 payloads and materially smaller than their WAV sources', () => {
    for (const baseName of ['chimney-fire', 'cafe', 'waves']) {
        const wavPath = path.join(__dirname, '..', '..', 'audio', `${baseName}.wav`);
        const mp3Path = path.join(__dirname, '..', '..', 'audio', `${baseName}.mp3`);
        const wavSize = fs.statSync(wavPath).size;
        const mp3Size = fs.statSync(mp3Path).size;
        const header = fs.readFileSync(mp3Path).subarray(0, 3);
        const hasId3Header = header.toString('ascii') === 'ID3';
        const hasMpegFrameSync = header[0] === 0xff && (header[1] & 0xe0) === 0xe0;

        assert.ok(hasId3Header || hasMpegFrameSync, `${baseName}.mp3 must contain MPEG audio`);
        assert.ok(mp3Size < (wavSize * 0.1), `${baseName}.mp3 must be at least 90% smaller`);
    }
});
