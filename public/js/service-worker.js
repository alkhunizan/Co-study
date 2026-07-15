/* Halastudy offline cache worker.
 *
 * Legal pages and browser clients are network-first so a live deployment can
 * replace stale bytes immediately, with the versioned cache as an offline
 * fallback. Ambient loops are cache-first and byte-accounted separately. */

const CACHE_PREFIX = 'halastudy-';
const CACHE_VERSION = '2026-07-15-01';
const STATIC_CACHE_NAME = `${CACHE_PREFIX}static-${CACHE_VERSION}`;
const AMBIENT_CACHE_NAME = `${CACHE_PREFIX}ambient-v1`;
const AMBIENT_METADATA_CACHE_NAME = `${CACHE_PREFIX}ambient-metadata-v1`;
const AMBIENT_CACHE_LIMIT_BYTES = 50 * 1024 * 1024;
/** @type {any} */
const workerScope = self;
const ORIGIN = workerScope.location.origin;
const AMBIENT_METADATA_URL = `${ORIGIN}/__halastudy__/ambient-cache-metadata`;

const PRECACHE_PATHS = Object.freeze([
    '/privacy',
    '/privacy.html',
    '/terms',
    '/terms.html',
    '/design-system/colors_and_type.css',
    '/manifest.webmanifest',
    '/js/halastudy-core.js',
    '/js/index-app.js',
    '/js/ui.js',
    '/js/video/realtimekit-client.js',
    '/js/video/video-client.js'
]);
const MANAGED_STATIC_PATHS = new Set(PRECACHE_PATHS);
const AMBIENT_SOURCE_MAP = Object.freeze({
    '/audio/rain.mp3': '/audio/rain.mp3',
    '/audio/forest.mp3': '/audio/forest.mp3',
    '/audio/chimney-fire.wav': '/audio/chimney-fire.mp3',
    '/audio/cafe.wav': '/audio/cafe.mp3',
    '/audio/waves.wav': '/audio/waves.mp3'
});
const ACTIVE_CACHE_NAMES = new Set([
    STATIC_CACHE_NAME,
    AMBIENT_CACHE_NAME,
    AMBIENT_METADATA_CACHE_NAME
]);

/** @type {Promise<any>} */
let ambientMutationQueue = Promise.resolve();

function absoluteRequest(pathname) {
    return new Request(new URL(pathname, ORIGIN).href, {
        credentials: 'same-origin'
    });
}

function canonicalAmbientRequest(request) {
    const url = new URL(request.url, ORIGIN);
    url.search = '';
    url.hash = '';
    return absoluteRequest(url.pathname);
}

function canonicalStaticRequest(request) {
    const url = new URL(request.url, ORIGIN);
    return absoluteRequest(url.pathname);
}

function ambientSourceRequest(request) {
    const pathname = new URL(request.url, ORIGIN).pathname;
    return absoluteRequest(AMBIENT_SOURCE_MAP[pathname] || pathname);
}

function isManagedStaticRequest(request) {
    if (request.method !== 'GET') return false;
    const url = new URL(request.url, ORIGIN);
    return url.origin === ORIGIN && MANAGED_STATIC_PATHS.has(url.pathname);
}

function isAmbientRequest(request) {
    if (request.method !== 'GET') return false;
    const url = new URL(request.url, ORIGIN);
    return url.origin === ORIGIN && Object.hasOwn(AMBIENT_SOURCE_MAP, url.pathname);
}

function enqueueAmbientMutation(task) {
    const result = ambientMutationQueue.then(task, task);
    ambientMutationQueue = result.catch(() => undefined);
    return result;
}

async function install() {
    const cache = await caches.open(STATIC_CACHE_NAME);
    await Promise.all(PRECACHE_PATHS.map(async (assetPath) => {
        const request = absoluteRequest(assetPath);
        const response = await fetch(request, { cache: 'reload' });
        if (!response.ok) {
            throw new Error(`Unable to precache ${assetPath}: ${response.status}`);
        }
        await cache.put(request, response);
    }));
    await workerScope.skipWaiting();
}

async function activate() {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => {
        if (!cacheName.startsWith(CACHE_PREFIX) || ACTIVE_CACHE_NAMES.has(cacheName)) {
            return undefined;
        }
        return caches.delete(cacheName);
    }));
    await workerScope.clients.claim();
}

async function handleStaticRequest(request) {
    const cache = await caches.open(STATIC_CACHE_NAME);
    const cacheRequest = canonicalStaticRequest(request);
    let networkError;
    try {
        const response = await fetch(request, { cache: 'no-cache' });
        if (response.ok) {
            try {
                await cache.put(cacheRequest, response.clone());
            } catch (_error) {
                // A full origin quota must not replace usable network bytes
                // with a stale fallback.
            }
            return response;
        }
        networkError = new Error(`Static request failed: ${response.status}`);
    } catch (error) {
        networkError = error;
    }

    const cached = await cache.match(cacheRequest);
    if (cached) return cached;
    throw networkError;
}

function emptyAmbientMetadata() {
    return { entries: {} };
}

function normalizeAmbientMetadata(value) {
    const normalized = emptyAmbientMetadata();
    if (!value || typeof value !== 'object' || !value.entries || typeof value.entries !== 'object') {
        return normalized;
    }
    for (const [url, entry] of Object.entries(value.entries)) {
        const size = Number(entry?.size);
        const lastAccessed = Number(entry?.lastAccessed);
        if (Number.isFinite(size) && size >= 0 && Number.isFinite(lastAccessed)) {
            normalized.entries[url] = { size, lastAccessed };
        }
    }
    return normalized;
}

async function loadAmbientMetadata(audioCache, metadataCache, verifySizes = false) {
    let metadata = emptyAmbientMetadata();
    const stored = await metadataCache.match(AMBIENT_METADATA_URL);
    if (stored) {
        try {
            metadata = normalizeAmbientMetadata(await stored.json());
        } catch (_error) {
            metadata = emptyAmbientMetadata();
        }
    }

    const cachedRequests = await audioCache.keys();
    const cachedUrls = new Set(cachedRequests.map((request) => request.url));
    for (const url of Object.keys(metadata.entries)) {
        if (!cachedUrls.has(url)) delete metadata.entries[url];
    }
    for (const request of cachedRequests) {
        const existing = metadata.entries[request.url];
        if (existing && !verifySizes) continue;
        const response = await audioCache.match(request);
        if (!response) continue;
        const body = await response.clone().arrayBuffer();
        metadata.entries[request.url] = {
            size: body.byteLength,
            lastAccessed: existing?.lastAccessed ?? 0
        };
    }
    return metadata;
}

async function saveAmbientMetadata(metadataCache, metadata) {
    const response = new Response(JSON.stringify(metadata), {
        headers: {
            'cache-control': 'no-store',
            'content-type': 'application/json; charset=utf-8'
        }
    });
    await metadataCache.put(AMBIENT_METADATA_URL, response);
}

async function storeAmbientResponseUnlocked(request, response, now) {
    if (!response?.ok || response.status !== 200) return false;
    const body = await response.clone().arrayBuffer();
    const byteLength = Number(body.byteLength);
    if (!Number.isFinite(byteLength) || byteLength < 0 || byteLength > AMBIENT_CACHE_LIMIT_BYTES) {
        return false;
    }

    const audioCache = await caches.open(AMBIENT_CACHE_NAME);
    const metadataCache = await caches.open(AMBIENT_METADATA_CACHE_NAME);
    const metadata = await loadAmbientMetadata(audioCache, metadataCache, true);
    const cacheRequest = canonicalAmbientRequest(request);
    const cacheUrl = cacheRequest.url;
    let removedEntries = false;

    if (metadata.entries[cacheUrl]) {
        await audioCache.delete(cacheRequest);
        delete metadata.entries[cacheUrl];
        removedEntries = true;
    }

    let currentBytes = Object.values(metadata.entries)
        .reduce((total, entry) => total + entry.size, 0);
    const evictionOrder = Object.entries(metadata.entries)
        .sort(([leftUrl, left], [rightUrl, right]) => {
            return (left.lastAccessed - right.lastAccessed) || leftUrl.localeCompare(rightUrl);
        });

    for (const [url, entry] of evictionOrder) {
        if ((currentBytes + byteLength) <= AMBIENT_CACHE_LIMIT_BYTES) break;
        await audioCache.delete(url);
        delete metadata.entries[url];
        currentBytes -= entry.size;
        removedEntries = true;
    }

    if (removedEntries) {
        try {
            // Commit removals before inserting a replacement. If a later
            // write is interrupted, persisted metadata cannot describe an
            // older, smaller body at the same URL.
            await saveAmbientMetadata(metadataCache, metadata);
        } catch (_error) {
            return false;
        }
    }

    try {
        await audioCache.put(cacheRequest, response.clone());
    } catch (_error) {
        return false;
    }
    metadata.entries[cacheUrl] = {
        size: byteLength,
        lastAccessed: now
    };
    try {
        await saveAmbientMetadata(metadataCache, metadata);
    } catch (_error) {
        // The body remains bounded. The next metadata load discovers this
        // unindexed URL and derives its byte length from the cached body.
    }
    return true;
}

function storeAmbientResponse(request, response, now = Date.now()) {
    return enqueueAmbientMutation(() => storeAmbientResponseUnlocked(request, response, now));
}

async function touchAmbientEntryUnlocked(request, now) {
    const audioCache = await caches.open(AMBIENT_CACHE_NAME);
    const metadataCache = await caches.open(AMBIENT_METADATA_CACHE_NAME);
    const metadata = await loadAmbientMetadata(audioCache, metadataCache);
    const cacheRequest = canonicalAmbientRequest(request);
    if (!metadata.entries[cacheRequest.url]) return false;
    metadata.entries[cacheRequest.url].lastAccessed = now;
    await saveAmbientMetadata(metadataCache, metadata);
    return true;
}

function touchAmbientEntry(request, now = Date.now()) {
    return enqueueAmbientMutation(() => touchAmbientEntryUnlocked(request, now));
}

async function inspectAmbientUsageUnlocked() {
    const audioCache = await caches.open(AMBIENT_CACHE_NAME);
    const metadataCache = await caches.open(AMBIENT_METADATA_CACHE_NAME);
    const metadata = await loadAmbientMetadata(audioCache, metadataCache, true);
    const entries = Object.entries(metadata.entries)
        .map(([url, entry]) => ({ url, size: entry.size, lastAccessed: entry.lastAccessed }))
        .sort((left, right) => left.url.localeCompare(right.url));
    return {
        bytes: entries.reduce((total, entry) => total + entry.size, 0),
        entries
    };
}

function inspectAmbientUsage() {
    return enqueueAmbientMutation(inspectAmbientUsageUnlocked);
}

async function handleAmbientRequest(request) {
    const cacheRequest = canonicalAmbientRequest(request);
    const audioCache = await caches.open(AMBIENT_CACHE_NAME);
    const cached = await audioCache.match(cacheRequest);
    if (cached) {
        try {
            await touchAmbientEntry(cacheRequest);
        } catch (_error) {
            // LRU bookkeeping is best-effort; a valid cached body wins.
        }
        return cached;
    }

    const response = await fetch(ambientSourceRequest(request));
    if (!response.ok || response.status !== 200) return response;
    const responseForClient = response.clone();
    try {
        await storeAmbientResponse(cacheRequest, response);
    } catch (_error) {
        // Quota pressure must not prevent online playback.
    }
    return responseForClient;
}

workerScope.addEventListener('install', (event) => {
    event.waitUntil(install());
});

workerScope.addEventListener('activate', (event) => {
    event.waitUntil(activate());
});

workerScope.addEventListener('fetch', (event) => {
    if (isManagedStaticRequest(event.request)) {
        event.respondWith(handleStaticRequest(event.request));
        return;
    }
    if (isAmbientRequest(event.request)) {
        event.respondWith(handleAmbientRequest(event.request));
    }
});

// Kept deliberately small and side-effect free so the Node contract tests can
// exercise the exact worker implementation without a second copy of the logic.
workerScope.__HALASTUDY_SW_TEST__ = Object.freeze({
    STATIC_CACHE_NAME,
    AMBIENT_CACHE_NAME,
    AMBIENT_METADATA_CACHE_NAME,
    AMBIENT_CACHE_LIMIT_BYTES,
    AMBIENT_SOURCE_MAP,
    PRECACHE_PATHS,
    install,
    activate,
    handleStaticRequest,
    handleAmbientRequest,
    storeAmbientResponse,
    touchAmbientEntry,
    inspectAmbientUsage
});
