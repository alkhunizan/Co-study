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

function createR2Client(config = {}) {
    const {
        endpoint = process.env.R2_ENDPOINT,
        accessKeyId = process.env.R2_ACCESS_KEY_ID,
        secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
    } = config;

    if (!endpoint || !accessKeyId || !secretAccessKey) {
        throw new Error('R2 client requires R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.');
    }
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
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(`https://${host}${canonicalPath}`, {
                method,
                headers,
                body: method === 'GET' || method === 'HEAD' ? undefined : body,
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
        async listObjects(bucket, prefix = '') {
            // list-type=2 needs a query string; keep it simple with a raw path +
            // query and re-sign including the query in the canonical request.
            const res = await signedRequestWithQuery('GET', bucketPath(bucket), `list-type=2&prefix=${encodeSegment(prefix)}`);
            if (!res.ok) {
                throw new Error(`listObjects failed (HTTP ${res.status}).`);
            }
            return [...res.text.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1]);
        }
    };

    // Variant that includes a canonical query string (for list-type=2).
    async function signedRequestWithQuery(method, canonicalPath, rawQuery) {
        const now = new Date();
        const amz = amzDate(now);
        const datestamp = amz.slice(0, 8);
        const payloadHash = sha256Hex(Buffer.alloc(0));
        const headers = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amz };
        const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
        const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amz}\n`;
        // Canonical query: sort by key.
        const canonicalQuery = rawQuery.split('&').sort().join('&');
        const canonicalRequest = [method, canonicalPath, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
        const scope = `${datestamp}/${REGION}/${SERVICE}/aws4_request`;
        const stringToSign = ['AWS4-HMAC-SHA256', amz, scope, sha256Hex(canonicalRequest)].join('\n');
        const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, datestamp), REGION), SERVICE), 'aws4_request');
        const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
        const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
        try {
            const response = await fetch(`https://${host}${canonicalPath}?${canonicalQuery}`, {
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

module.exports = { createR2Client };
