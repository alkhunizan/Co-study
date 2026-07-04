// Generate Cloudflare Realtime TURN credentials and print a ready-to-paste
// ICE_SERVERS_JSON line for the app's .env.
//
// Cloudflare TURN (part of Cloudflare Realtime) issues short-lived credentials
// from a TURN key. Create the key in the Cloudflare dashboard (Realtime → TURN),
// then set in .env:
//   CLOUDFLARE_TURN_KEY_ID=<the TURN key id>
//   CLOUDFLARE_TURN_API_TOKEN=<API token with Realtime TURN edit permission>
// Optional:
//   CLOUDFLARE_TURN_TTL_SECONDS=86400   (default 24h; max per Cloudflare's limits)
//
// Usage: npm run cloudflare:turn
//
// SECURITY: the API token and generated credential are secrets. This script
// prints only the resulting ICE_SERVERS_JSON (username + credential are meant
// for the browser via /api/runtime-config, so they are not high-value), and
// scrubs the API token from any error output. It never logs the token.
const {
    loadCloudflareRealtimeKitEnv,
    requireEnv,
    assertNoSecretsInText
} = require('./realtimekit-common');

const TURN_API_BASE = 'https://rtc.live.cloudflare.com/v1/turn/keys';
const REQUEST_TIMEOUT_MS = 15000;
const DEFAULT_TTL_SECONDS = 86400;

async function main() {
    loadCloudflareRealtimeKitEnv();
    const keyId = requireEnv('CLOUDFLARE_TURN_KEY_ID');
    const apiToken = requireEnv('CLOUDFLARE_TURN_API_TOKEN');
    const ttl = Number.parseInt(process.env.CLOUDFLARE_TURN_TTL_SECONDS || '', 10) || DEFAULT_TTL_SECONDS;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
        response = await fetch(`${TURN_API_BASE}/${encodeURIComponent(keyId)}/credentials/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiToken}`
            },
            body: JSON.stringify({ ttl }),
            signal: controller.signal
        });
    } catch (error) {
        const aborted = error && error.name === 'AbortError';
        throw new Error(aborted ? 'Cloudflare TURN request timed out.' : 'Network request to Cloudflare TURN failed.');
    } finally {
        clearTimeout(timer);
    }

    const text = await response.text();
    if (!response.ok) {
        // Scrub the token before surfacing any error body.
        throw new Error(assertNoSecretsInText(text) && `Cloudflare TURN request failed (HTTP ${response.status}): ${text.slice(0, 300)}`);
    }

    let payload;
    try {
        payload = JSON.parse(text);
    } catch (_error) {
        throw new Error('Cloudflare TURN returned a non-JSON response.');
    }

    // Cloudflare returns { iceServers: { urls: [...], username, credential } }.
    const ice = payload.iceServers || payload;
    if (!ice || !ice.urls || !ice.username || !ice.credential) {
        throw new Error('Unexpected Cloudflare TURN response shape (no iceServers.urls/username/credential).');
    }

    // Shape into the app's ICE_SERVERS_JSON contract (array of entries, STUN
    // first then the TURN entry). sanitizeIceServerEntry accepts this verbatim.
    const iceServersJson = JSON.stringify([
        { urls: ['stun:stun.cloudflare.com:3478'] },
        { urls: ice.urls, username: ice.username, credential: ice.credential }
    ]);

    console.log(`# Cloudflare TURN credentials, valid ~${Math.round(ttl / 3600)}h. Paste into .env:`);
    console.log(`ICE_SERVERS_JSON=${iceServersJson}`);
}

main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
});
