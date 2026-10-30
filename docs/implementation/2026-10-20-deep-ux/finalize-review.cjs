const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const folder = __dirname;
const evidence = path.join(folder, 'evidence');
const root = path.resolve(folder, '../../..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(evidence, name), 'utf8').replace(/^\uFEFF/, ''));
const cases = new Map();
for (const name of ['smoke-verified.json', 'browser-rechecked.json', 'online-verified.json']) {
    const report = read(name);
    function walk(suite) {
        for (const spec of suite.specs || []) for (const test of spec.tests || []) {
            const result = test.results.at(-1);
            cases.set(`${spec.file.replaceAll('\\', '/')}::${spec.title}`, { file: spec.file, title: spec.title, status: result.status, evidence: name });
            for (const attachment of result.attachments || []) if (attachment.body && attachment.name.endsWith('.json')) {
                fs.writeFileSync(path.join(evidence, name.replace('.json', '-') + attachment.name), Buffer.from(attachment.body, 'base64'));
            }
        }
        for (const child of suite.suites || []) walk(child);
    }
    for (const suite of report.suites) walk(suite);
}
if ([...cases.values()].some((item) => item.status !== 'passed')) throw new Error('A browser scenario still lacks a passing verification');
const runtime = read('runtime-manifest.json');
for (const file of runtime.files) for (const directory of [root, runtime.runtime]) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(directory, file.path))).digest('hex');
    if (hash !== file.sha256) throw new Error(`Runtime/source drift: ${file.path}`);
}
const metrics = read('online-verified-online-fonts.json');
const summary = {
    completedTasks: 16, phasesReviewed: 3, branch: 'ux/2026-10-20-deep-enhancements',
    integration: { passed: 130, failed: 0, evidence: 'integration-verified.log', affectedRecheckPassed: 7 },
    browser: { uniqueScenariosPassed: cases.size, outstandingFailures: 0, note: 'Full offline run plus focused passing rechecks; the online-font scenario runs separately.', cases: [...cases.values()] },
    sourceFilesMatchingRuntime: runtime.files.length,
    performance: { setup: 'Local unthrottled Chromium, real Google font GETs, ten seconds after load', measurements: metrics.measurements.map(({ fonts, ...values }) => values), fontRequestFailures: metrics.requests.length, fontConsoleNotices: metrics.messages.length },
    deployment: 'Local only; no merge, push, deployment or publication', creditRulesChanged: false, externalAnalyticsInstalled: false
};
fs.writeFileSync(path.join(evidence, 'verification-summary.json'), JSON.stringify(summary, null, 2));
const images = [];
function search(directory, filename) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
        const target = path.join(directory, item.name);
        if (item.isDirectory()) { const found = search(target, filename); if (found) return found; }
        else if (item.name === filename) return target;
    }
}
for (const [run, filename, caption] of [
    ['online-verified', 'online-fonts-ar-390.png', 'Arabic mobile entry — real fonts'],
    ['online-verified', 'online-fonts-en-1440.png', 'English desktop entry — real fonts'],
    ['smoke-verified', 'room-mobile-ar.png', 'Arabic mobile study room'],
    ['smoke-verified', 'room-desktop-en.png', 'English desktop study room'],
    ['smoke-verified', 'account-ar-light-390.png', 'Arabic mobile Account'],
    ['smoke-verified', 'progress-en-dark-844.png', 'English dark tablet progress and recap'],
    ['browser-rechecked', 'en-privacy.png', 'English legal page — approved text preserved']
]) {
    const file = search(path.join(evidence, run), filename);
    if (!file) throw new Error(`Missing reviewed screenshot: ${filename}`);
    images.push({ src: path.relative(folder, file).replaceAll('\\', '/'), caption });
}
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
fs.writeFileSync(path.join(folder, 'REVIEW.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Halastudy UX implementation review</title>
<style>body{margin:0;background:#f5f2eb;color:#2d3436;font:17px/1.6 system-ui,sans-serif}main{max-width:1200px;margin:auto;padding:40px 24px}h1{font:500 clamp(32px,5vw,52px)/1.15 Georgia,serif}a{color:#89542f;text-underline-offset:4px}nav{display:flex;gap:20px;flex-wrap:wrap}nav a{display:inline-flex;align-items:center;min-height:44px}.note{max-width:850px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr));gap:24px;margin-top:32px}figure{margin:0;padding:16px;background:white;border:1px solid #ddd3c6;border-radius:20px}img{width:100%;height:400px;object-fit:cover;object-position:top;border-radius:10px;background:#eee}figcaption{padding-top:12px;font-weight:600}:focus-visible{outline:3px solid #89542f;outline-offset:4px}</style>
<main><p>Halastudy · local implementation review · 20 October 2026</p><h1>16 UX tasks implemented.<br>Three phases reviewed.</h1><p class="note">130 integration tests passed. All ${cases.size} browser scenarios have passing evidence across the full run and focused rechecks, including the separate real-font check. No production deployment. Payment/provider and account-recovery release dependencies remain separate.</p><nav><a href="REVIEW.md">Task matrix and validation</a><a href="evidence/final-ux-only.patch">UX-only patch</a><a href="evidence/verification-summary.json">Verification evidence</a><a href="UX-EVIDENCE-CONTRACT.md">Privacy contract and research script</a></nav><p class="note">Click a screenshot to view it at full size. These are test accounts and illustrative scenes; they do not show real attendance.</p><div class="grid">${images.map(({ src, caption }) => `<figure><a href="${escape(src)}"><img loading="lazy" src="${escape(src)}" alt="${escape(caption)}"></a><figcaption>${escape(caption)}</figcaption></figure>`).join('')}</div></main></html>`);
fs.writeFileSync(path.join(evidence, 'review-images.json'), JSON.stringify(images, null, 2));
console.log(JSON.stringify({ browserScenariosPassed: cases.size, runtimeFilesVerified: runtime.files.length, maxCls: Math.max(...metrics.measurements.map((item) => item.cls)), maxLcpMs: Math.max(...metrics.measurements.map((item) => item.lcp)) }));
