// Shared helpers for the Halastudy Cloudflare RealtimeKit terminal scripts.
//
// SECURITY: everything in here is server-only. The Cloudflare API token, any
// participant authToken, and Authorization headers must never be printed. Use
// redact()/assertNoSecretsInText() before logging anything that could contain a
// secret. No third-party dependencies are added — .env is parsed by hand so the
// scripts work whether or not dotenv is installed.

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ENV_FILE = path.join(REPO_ROOT, '.env');
const DEFAULT_API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const DEFAULT_PRESET_NAME = 'halastudy_student';
const REQUEST_TIMEOUT_MS = 15000;
const REDACTED = '***REDACTED***';
const SECRET_KEY_HINTS = ['token', 'secret', 'key', 'authorization', 'password', 'cookie', 'credential'];

/** Literal secret values collected at runtime so they can be scrubbed from any output. */
const knownSecrets = new Set();

function registerSecret(value) {
    if (typeof value === 'string' && value.trim().length >= 6) {
        knownSecrets.add(value.trim());
    }
}

function parseBoolean(value) {
    return ['1', 'true', 'yes', 'on'].includes(String(value === undefined || value === null ? '' : value).trim().toLowerCase());
}

function normalizeBaseUrl(raw) {
    if (!raw) return '';
    try {
        const url = new URL(String(raw).trim());
        if (!['http:', 'https:'].includes(url.protocol)) return '';
        url.hash = '';
        url.search = '';
        return url.toString().replace(/\/$/, '');
    } catch (_error) {
        return '';
    }
}

// Minimal, dependency-free .env loader. Only sets vars that are not already
// present in the environment, so real shell/CI env always wins.
function loadDotEnvIntoProcess() {
    let contents;
    try {
        contents = fs.readFileSync(ENV_FILE, 'utf8');
    } catch (_error) {
        return false;
    }
    for (const rawLine of contents.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        if (!key || key in process.env) continue;
        let val = line.slice(eq + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
        }
        process.env[key] = val;
    }
    return true;
}

/**
 * Load .env (if present) and return the resolved RealtimeKit config. Does not
 * throw on missing values — callers use requireEnv() for the ones they need.
 */
function loadCloudflareRealtimeKitEnv() {
    loadDotEnvIntoProcess();
    const env = process.env;
    const resolved = {
        accountId: String(env.CLOUDFLARE_ACCOUNT_ID || '').trim(),
        appId: String(env.CLOUDFLARE_REALTIMEKIT_APP_ID || '').trim(),
        apiToken: String(env.CLOUDFLARE_REALTIMEKIT_API_TOKEN || '').trim(),
        apiBaseUrl: normalizeBaseUrl(env.CLOUDFLARE_REALTIMEKIT_API_BASE_URL) || DEFAULT_API_BASE_URL,
        presetName: String(env.VIDEO_DEFAULT_PRESET_NAME || DEFAULT_PRESET_NAME).trim() || DEFAULT_PRESET_NAME,
        createApp: parseBoolean(env.CLOUDFLARE_REALTIMEKIT_CREATE_APP),
        createPreset: parseBoolean(env.CLOUDFLARE_REALTIMEKIT_CREATE_PRESET)
    };
    registerSecret(resolved.apiToken);
    return resolved;
}

function requireEnv(name) {
    const value = String(process.env[name] || '').trim();
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    if (name.toLowerCase().includes('token')) registerSecret(value);
    return value;
}

function isSecretKey(key) {
    const lower = String(key).toLowerCase();
    return SECRET_KEY_HINTS.some((hint) => lower.includes(hint));
}

function redactString(text) {
    let out = String(text);
    for (const secret of knownSecrets) {
        if (secret && out.includes(secret)) {
            out = out.split(secret).join(REDACTED);
        }
    }
    return out;
}

/** Deep-redact a value: secret-named keys become ***REDACTED*** and any known secret literal is scrubbed. */
function redact(value) {
    if (typeof value === 'string') return redactString(value);
    if (Array.isArray(value)) return value.map((item) => redact(item));
    if (value && typeof value === 'object') {
        /** @type {Record<string, any>} */
        const out = {};
        for (const [key, val] of Object.entries(value)) {
            out[key] = isSecretKey(key) ? REDACTED : redact(val);
        }
        return out;
    }
    return value;
}

/** Throw if text contains a known secret literal — a guard before printing anything. */
function assertNoSecretsInText(text) {
    const str = String(text);
    for (const secret of knownSecrets) {
        if (secret && str.includes(secret)) {
            throw new Error('Refusing to print output: it contains a secret value.');
        }
    }
    return true;
}

function getRealtimeKitBaseUrl(env = process.env) {
    const apiBaseUrl = normalizeBaseUrl(env.CLOUDFLARE_REALTIMEKIT_API_BASE_URL) || DEFAULT_API_BASE_URL;
    const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || '').trim();
    const appId = String(env.CLOUDFLARE_REALTIMEKIT_APP_ID || '').trim();
    const account = `${apiBaseUrl}/accounts/${encodeURIComponent(accountId)}/realtime/kit`;
    const app = `${account}/${encodeURIComponent(appId)}`;
    return { apiBaseUrl, accountId, appId, account, app };
}

function extractResult(payload) {
    if (!payload || typeof payload !== 'object') return null;
    if (payload.result && typeof payload.result === 'object') return payload.result;
    if (payload.data && typeof payload.data === 'object') return payload.data;
    return payload;
}

function sanitizeCloudflareError(payload, status) {
    if (payload && Array.isArray(payload.errors) && payload.errors.length) {
        const message = payload.errors
            .map((error) => (error && (error.message || error.code)) || '')
            .filter(Boolean)
            .join('; ');
        if (message) return redactString(message).slice(0, 300);
    }
    return `Cloudflare request failed with HTTP ${status}.`;
}

/**
 * Authenticated request to the Cloudflare RealtimeKit API. `pathname` is either
 * an absolute URL or a path relative to `/accounts/{id}/realtime/kit`. Never
 * throws on HTTP errors — returns { ok, status, result, payload, error } with a
 * redacted error string. Never logs.
 * @param {string} pathname
 * @param {{ method?: string, body?: any }} [options]
 */
async function cfFetch(pathname, options = {}) {
    const apiToken = requireEnv('CLOUDFLARE_REALTIMEKIT_API_TOKEN');
    const { account } = getRealtimeKitBaseUrl();
    const url = /^https?:/i.test(pathname) ? pathname : `${account}${pathname}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiToken}`
            },
            body: options.body === undefined ? undefined : JSON.stringify(options.body),
            signal: controller.signal
        });

        const text = await response.text();
        let payload = null;
        if (text) {
            try {
                payload = JSON.parse(text);
            } catch (_error) {
                payload = { raw: '[non-JSON response omitted]' };
            }
        }

        const ok = response.ok && payload?.success !== false;
        return {
            ok,
            status: response.status,
            result: extractResult(payload),
            payload,
            error: ok ? null : sanitizeCloudflareError(payload, response.status)
        };
    } catch (error) {
        const aborted = error && error.name === 'AbortError';
        return {
            ok: false,
            status: 0,
            result: null,
            payload: null,
            error: aborted ? 'Cloudflare request timed out.' : 'Network request to Cloudflare failed.'
        };
    } finally {
        clearTimeout(timer);
    }
}

/** Tiny PASS/FAIL reporter shared by every script for consistent output. */
function createReporter(title) {
    console.log(title);
    /** @type {{ label: string, ok: boolean, note: string }[]} */
    const results = [];
    return {
        check(label, ok, note = '') {
            const passed = !!ok;
            results.push({ label, ok: passed, note });
            console.log(`${label}: ${passed ? 'PASS' : 'FAIL'}${note ? ` — ${note}` : ''}`);
            return passed;
        },
        info(message) {
            console.log(message);
        },
        get failed() {
            return results.some((entry) => !entry.ok);
        },
        summary(prefix = 'Overall') {
            const overall = results.some((entry) => !entry.ok) ? 'FAIL' : 'PASS';
            console.log(`${prefix}: ${overall}`);
            return overall;
        }
    };
}

module.exports = {
    loadCloudflareRealtimeKitEnv,
    redact,
    cfFetch,
    requireEnv,
    getRealtimeKitBaseUrl,
    assertNoSecretsInText,
    createReporter
};
