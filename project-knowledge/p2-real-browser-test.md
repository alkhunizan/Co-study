# P2 Real-Browser Two-Tab Video Confirmation — 60-second test

> **Purpose:** Close the only open P2 gap from Day 2. Headless Playwright proved the WebRTC plumbing works (remote MediaStreamTrack attached, `readyState: "live"`), but Chromium's fake-media stream doesn't transport actual frames through mediasoup. This test confirms real frames flow with a real camera.

## Prereqs (already running from earlier session)

- Co-study HTTPS server on `https://127.0.0.1:3443` (boot: `HTTPS_PORT=3443 SFU_BASE_URL=https://127.0.0.1:3010 node server-https.js`).
- `halastudy-sfu` Docker container up. Verify: `docker ps --filter name=halastudy-sfu` shows "Up …".
- A working webcam.

If either server is down, restart per [spike-log.md](spike-log.md) Day 2 entry boot commands.

## Steps

1. **Open Chrome (or Edge)** at `https://127.0.0.1:3443`.
   - You'll see a cert warning. Click **Advanced → Proceed to 127.0.0.1 (unsafe)**.
   - Page should render the Halastudy landing.

2. **Create an SFU room.**
   - Pick "Large room" / SFU media mode (the option only appears because `SFU_BASE_URL` is set).
   - Note the 6-letter room code.

3. **Open the same URL in a second tab — incognito.**
   - Also click through the cert warning.
   - Join the same room code, use a different display name.

4. **Allow camera in both tabs** (Chrome will prompt twice — once per tab/profile).

## What to look for

After ~5-10 seconds, each tab should show **two video feeds**: your own (mirrored) + the other tab's. The video grid is inside the MiroTalk iframe — it owns the layout.

## Report back (one of three)

- ✅ **"Saw both videos"** → P2 fully green. Update [spike-log.md](spike-log.md) Day 4 entry to drop the "open gap" note.
- 🟡 **"Saw only my own"** → media is not transporting between peers. Likely `announcedIp` / ICE issue in the SFU container. Check `docker logs halastudy-sfu --tail 100` for ICE candidate errors; the container is using `ANNOUNCED_IP=127.0.0.1`, which works for same-host but is fragile.
- 🔴 **"Saw neither"** → cert warning probably wasn't clicked through on the inner MiroTalk iframe. Open `https://127.0.0.1:3010/` directly in one tab, click through the MiroTalk cert warning, then re-run the test.

## Troubleshooting one-liners

| Symptom | Check |
|---|---|
| Iframe is blank (no MiroTalk page) | `curl -k https://127.0.0.1:3010/` should return 200. If not, container died — `docker start halastudy-sfu`. |
| Page is blank (no co-study) | `curl -k https://127.0.0.1:3443/api/runtime-config` should return JSON with `"sfuAvailable":true`. If not, server died. |
| Camera permission stuck | Chrome → `chrome://settings/content/camera` → ensure `https://127.0.0.1:3443` and `https://127.0.0.1:3010` are not blocked. |
| Other tab's video shows but black | Real-browser-only — frames are flowing but the other tab covered the camera. Wave at it. |

## Why this matters
P2 in the Day-7 go/no-go is the only proof currently graded **green**. If real frames don't transport, P2 demotes to yellow and the spike's overall risk story is more fragile than the spike-log claims. 60 seconds is a cheap price for that confidence.
