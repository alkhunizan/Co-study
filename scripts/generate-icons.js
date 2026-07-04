// One-off icon generator: renders images/favicon.svg to the PWA/apple PNG
// sizes using Playwright's bundled Chromium (no extra dependencies). Output
// is committed — this never runs at build or deploy time.
// Usage: node scripts/generate-icons.js
const fs = require('node:fs');
const path = require('node:path');

const SIZES = [
    { file: 'icon-192.png', size: 192, padded: false },
    { file: 'icon-512.png', size: 512, padded: false },
    // Maskable icons need ~20% safe-zone padding around the mark.
    { file: 'icon-maskable-512.png', size: 512, padded: true },
    { file: 'apple-touch-icon.png', size: 180, padded: false }
];

async function main() {
    const { chromium } = require('@playwright/test');
    const svg = fs.readFileSync(path.join(__dirname, '..', 'images', 'favicon.svg'), 'utf8');
    const outDir = path.join(__dirname, '..', 'images', 'icons');
    fs.mkdirSync(outDir, { recursive: true });

    const browser = await chromium.launch();
    const page = await browser.newPage();
    for (const { file, size, padded } of SIZES) {
        const inner = padded ? Math.round(size * 0.6) : size;
        const html = `<!DOCTYPE html><body style="margin:0;width:${size}px;height:${size}px;`
            + 'display:grid;place-items:center;background:#E0B08B;">'
            + `<div style="width:${inner}px;height:${inner}px;">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>`
            + '</body>';
        await page.setViewportSize({ width: size, height: size });
        await page.setContent(html);
        await page.screenshot({ path: path.join(outDir, file), clip: { x: 0, y: 0, width: size, height: size } });
        console.log(`wrote images/icons/${file}`);
    }
    await browser.close();
}

main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
});
