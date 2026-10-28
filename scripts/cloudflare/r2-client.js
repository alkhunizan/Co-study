// Minimal, dependency-free S3-compatible client for Cloudflare R2.
//
// Signs requests with AWS Signature V4 using only node:crypto — no aws-sdk, in
// keeping with the repo's zero-runtime-dependency rule. Path-style addressing
// (https://<account>.r2.cloudflarestorage.com/<bucket>/<key>), region "auto".
//
// Only the S3 data-plane operations we need: headBucket, createBucket,
// putObject, getObject, listObjects, deleteObject. Uses the R2 Access Key ID +
// Secret Access Key (NOT the cfat_ Bearer token — that's for the REST API).
const crypto = require('node:crypto');

const REGION = 'auto';
const SERVICE = 's3';
const REQUEST_TIMEOUT_MS = 20000;

function sha256Hex(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
    return crypto.createHmac('sha256', key).update(data).digest();
}

// Encode a path segment per AWS (unreserved chars stay; everything else %XX).
function encodeSegment(segment) {
    return encodeURIComponent(segment).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function amzDate(now) {
    return now.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function decodeXml(value) {
    return String(value || '')
        .replace(/&#(\d+);/g, (match, code) => decodeXmlCodePoint(match, code, 10))
        .replace(/&#x([0-9a-f]+);/gi, (match, code) => decodeXmlCodePoint(match, code, 16))
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
}

function decodeXmlCodePoint(original, rawCode, radix) {
    const code = Number.parseInt(rawCode, radix);
    if (!Number.isInteger(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) {
        return original;
    }
    return String.fromCodePoint(code);
}

function xmlTag(block, name) {
    const match = String(block).match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`));
    return match ? decodeXml(match[1]) : '';
}

function parseListObjectsXml(xml) {
    const objects = [];
    for (const match of String(xml).matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const block = match[1];
        const size = Number(xmlTag(block, 'Size'));
        objects.push({
            key: xmlTag(block, 'Key'),
            lastModified: xmlTag(block, 'LastModified') || null,
            etag: xmlTag(block, 'ETag').replace(/^"|"$/g, '') || null,
            size: Number.isSafeInteger(size) && size >= 0 ? size : null,
            storageClass: xmlTag(block, 'StorageClass') || null
        });
    }
    return {
        objects,
        isTruncated: xmlTag(xml, 'IsTruncated').toLowerCase() === 'true',
        nextContinuationToken: xmlTag(xml, 'NextContinuationToken') || null
    };
}

function encodeCanonicalQuery(entries) {
    return entries
        .map(([key, value]) => [encodeSegment(String(key)), encodeSegment(String(value))])
        .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
            if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1;
            if (leftValue === rightValue) return 0;
            return leftValue < rightValue ? -1 : 1;
        })
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
}

function createR2Client(config = {}) {
    const {
        endpoint = process.env.R2_ENDPOINT,
        accessKeyId = process.env.R2_ACCESS_KEY_ID,
        secretAccessKey = process.env.R2_SECRET_ACCESS_KEY,
        fetchImpl = globalThis.fetch,
        timeoutMs = REQUEST_TIMEOUT_MS
    } = config;

    if (!endpoint || !accessKeyId || !secretAccessKey) {
        throw new Error('R2 client requires R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.');
    }
    if (typeof fetchImpl !== 'function') throw new Error('R2 client requires a fetch implementation.');
    const host = new URL(endpoint).host;

    /**
     * @param {string} method
     * @param {string} canonicalPath  already-encoded path beginning with "/"
     * @param {Buffer} body
     * @param {Record<string,string>} [extraHeaders]
     */
    async function signedRequest(method, canonicalPath, body = Buffer.alloc(0), extraHeaders = {}) {
        const now = new Date();
        const amz = amzDate(now);
        const datestamp = amz.slice(0, 8);
        const payloadHash = sha256Hex(body);

        /** @type {Record<string, string>} */
        const headers = {
            host,
            'x-amz-content-sha256': payloadHash,
            'x-amz-date': amz,
            ...extraHeaders
        };
        const signedHeaderNames = Object.keys(headers).map((h) => h.toLowerCase()).sort();
        const canonicalHeaders = signedHeaderNames.map((h) => {
            const actualKey = Object.keys(headers).find((k) => k.toLowerCase() === h);
            return `${h}:${String(headers[actualKey]).trim()}\n`;
        }).join('');
        const signedHeaders = signedHeaderNames.join(';');

        const canonicalRequest = [
            method,
            canonicalPath,
            '', // no query string
            canonicalHeaders,
            signedHeaders,
            payloadHash
        ].join('\n');

        const scope = `${datestamp}/${REGION}/${SERVICE}/aws4_request`;
        const stringToSign = [
            'AWS4-HMAC-SHA256',
            amz,
            scope,
            sha256Hex(canonicalRequest)
        ].join('\n');

        const kDate = hmac(`AWS4${secretAccessKey}`, datestamp);
        const kRegion = hmac(kDate, REGION);
        const kService = hmac(kRegion, SERVICE);
        const kSigning = hmac(kService, 'aws4_request');
        const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

        headers.Authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, `
            + `SignedHeaders=${signedHeaders}, Signature=${signature}`;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(`https://${host}${canonicalPath}`, {
                method,
                headers,
                // Node's fetch accepts a Buffer body; TS's DOM BodyInit doesn't list it.
                body: method === 'GET' || method === 'HEAD' ? undefined : /** @type {any} */ (body),
                signal: controller.signal
            });
            const text = await response.text();
            return { status: response.status, ok: response.ok, text, headers: response.headers };
        } catch (error) {
            const aborted = error && error.name === 'AbortError';
            throw new Error(aborted ? 'R2 request timed out.' : `R2 network error: ${error.message}`);
        } finally {
            clearTimeout(timer);
        }
    }

    function bucketPath(bucket) {
        return `/${encodeSegment(bucket)}`;
    }
    function objectPath(bucket, key) {
        const encodedKey = key.split('/').map(encodeSegment).join('/');
        return `/${encodeSegment(bucket)}/${encodedKey}`;
    }

    return {
        host,
        async headBucket(bucket) {
            const res = await signedRequest('HEAD', bucketPath(bucket));
            return res.status === 200;
        },
        async createBucket(bucket) {
            const res = await signedRequest('PUT', bucketPath(bucket));
            // 200 created; some S3 impls return 409 if it already exists.
            if (!res.ok && res.status !== 409) {
                throw new Error(`createBucket failed (HTTP ${res.status}): ${res.text.slice(0, 200)}`);
            }
            return true;
        },
        async putObject(bucket, key, body, contentType = 'application/octet-stream') {
            const buf = Buffer.isBuffer(body) ? body : Buffer.from(body);
            const res = await signedRequest('PUT', objectPath(bucket, key), buf, { 'content-type': contentType });
            if (!res.ok) {
                throw new Error(`putObject ${key} failed (HTTP ${res.status}): ${res.text.slice(0, 200)}`);
            }
            return true;
        },
        async getObject(bucket, key) {
            const res = await signedRequest('GET', objectPath(bucket, key));
            if (!res.ok) {
                throw new Error(`getObject ${key} failed (HTTP ${res.status}).`);
            }
            return res.text;
        },
        async deleteObject(bucket, key) {
            const res = await signedRequest('DELETE', objectPath(bucket, key));
            if (!res.ok && res.status !== 404) {
                throw new Error(`deleteObject ${key} failed (HTTP ${res.status}).`);
            }
            return true;
        },
        async listObjectsDetailed(bucket, prefix = '') {
            const objects = [];
            let continuationToken = null;
            const seenTokens = new Set();
            for (let page = 0; page < 10_000; page += 1) {
                const query = [['list-type', '2'], ['prefix', prefix]];
                if (continuationToken) query.push(['continuation-token', continuationToken]);
                const res = await signedRequestWithQuery('GET', bucketPath(bucket), query);
                if (!res.ok) throw new Error(`listObjects failed (HTTP ${res.status}).`);
                const parsed = parseListObjectsXml(res.text);
                objects.push(...parsed.objects);
                if (!parsed.isTruncated) return objects;
                if (!parsed.nextContinuationToken || seenTokens.has(parsed.nextContinuationToken)) {
                    throw new Error('listObjects pagination returned an invalid continuation token.');
                }
                continuationToken = parsed.nextContinuationToken;
                seenTokens.add(continuationToken);
            }
            throw new Error('listObjects exceeded the pagination safety limit.');
        },
        async listObjects(bucket, prefix = '') {
            const objects = await this.listObjectsDetailed(bucket, prefix);
            return objects.map((object) => object.key);
        }
    };

    // Variant that includes a canonical query string (for list-type=2).
    async function signedRequestWithQuery(method, canonicalPath, queryEntries) {
        const now = new Date();
        const amz = amzDate(now);
        const datestamp = amz.slice(0, 8);
        const payloadHash = sha256Hex(Buffer.alloc(0));
        const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amz };
        const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
        const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amz}\n`;
        const canonicalQuery = encodeCanonicalQuery(queryEntries);
        const canonicalRequest = [method, canonicalPath, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
        const scope = `${datestamp}/${REGION}/${SERVICE}/aws4_request`;
        const stringToSign = ['AWS4-HMAC-SHA256', amz, scope, sha256Hex(canonicalRequest)].join('\n');
        const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, datestamp), REGION), SERVICE), 'aws4_request');
        const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
        const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(`https://${host}${canonicalPath}?${canonicalQuery}`, {
                method,
                headers: { ...headers, Authorization: authorization },
                signal: controller.signal
            });
            const text = await response.text();
            return { status: response.status, ok: response.ok, text };
        } finally {
            clearTimeout(timer);
        }
    }
}

function createR2ReadOnlyClient(config = {}) {
    const client = createR2Client(config);
    return Object.freeze({ host: client.host, listObjectsDetailed: client.listObjectsDetailed.bind(client) });
}

module.exports = { createR2Client, createR2ReadOnlyClient };
