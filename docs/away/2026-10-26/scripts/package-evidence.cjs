const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const taskRoot = path.resolve(__dirname, '..');
const destination = path.resolve(process.argv[2]);
const refreshRawEvidence = !process.argv.includes('--metadata-only');
if (!destination.replaceAll('\\', '/').endsWith('/Co-study/docs/away/2026-10-26')) throw new Error('Unexpected review destination');
const catalog = [
    ['A00', 'Future timezone coverage', 'a85fb87', 'The scheduling test selects a future London daylight-saving transition while retaining the real future-date guard.'],
    ['A01', 'Checklist state survives edits', '88ef3d2', 'Reordering unchanged steps preserves completion. A rejected checkbox change returns to its confirmed state.'],
    ['A02', 'Retry the intended focus action', 'bc7f2ec', 'Retry repeats the failed Start or Pause and protects a newer session, including rapid queued input.'],
    ['A03', 'Keep workspace responses in order', 'eceecdd', 'Late refreshes cannot replace newer room data or a newly started focus session. Schedule room choices survive translation.'],
    ['A04', 'Truthful planner feedback', '7a1a11f', 'A saved item with a failed refresh is reported accurately. Draft errors translate, and obsolete results cannot overwrite newer feedback.'],
    ['A11', 'Keep guided focus recoverable', '19c4c5b', 'A failed task attachment leaves the acknowledged focus session controllable and recoverable through retry and reload.'],
    ['A12', 'Finish the newly started session', '0a8b1a05', 'An acknowledged new session retires the older completion retry. A failed Start preserves that retry.'],
    ['A13', 'Recover circle feedback', '35cf9ba', 'A failed circle refresh offers a localized retry with the draft retained. Recovery clears the old error, and delayed feedback stays with its originating view.'],
].map(([id, title, code, description]) => ({ id, title, code, description }));
const excludedDirectories = name => name === 'tools' || name.endsWith('-temp') || name.endsWith('-report') || name.startsWith('.');
const allowed = file => /\.(?:md|log|json|ndjson|png|cjs|ps1|txt|html|patch|bundle)$/.test(file);
function walk(root) {
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
        const absolute = path.join(root, entry.name);
        if (entry.isDirectory()) return excludedDirectories(entry.name) ? [] : walk(absolute);
        return allowed(entry.name) ? [absolute] : [];
    });
}
function copyFile(source, target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
}
const slash = value => value.replaceAll('\\', '/');
const readText = file => {
    const bytes = fs.readFileSync(file);
    return bytes.toString(bytes[0] === 255 && bytes[1] === 254 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
};
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const records = [];
const isolationPath = path.join(taskRoot, 'app-isolation.json');
const isolation = fs.existsSync(isolationPath) ? JSON.parse(readText(isolationPath)) : [];
for (const item of catalog) {
    const runtime = path.join(taskRoot, item.id === 'A01' ? 'repository' : `worktrees/${item.id}`);
    item.code = execFileSync('git', ['log', '-1', '--format=%H', '--', 'public/js', 'tests'], { cwd: runtime, encoding: 'utf8' }).trim().slice(0, 7);
    const source = path.join(runtime, 'docs/away/2026-10-26');
    const target = path.join(destination, 'branches', item.id);
    const ownDocs = item.id === 'A01' ? [path.join(source, 'A01-RESULT.md')] : walk(path.join(source, item.id));
    const evidence = walk(path.join(source, 'evidence'));
    for (const file of [...ownDocs, ...(refreshRawEvidence ? evidence : [])]) if (fs.existsSync(file)) copyFile(file, path.join(target, path.relative(source, file)));
    const reportCandidates = item.id === 'A01' ? ['A01-RESULT.md'] : [`${item.id}/RESULT.md`, `${item.id}/CHECKPOINT.md`, `${item.id}/REVIEW.md`];
    const report = reportCandidates.find(file => fs.existsSync(path.join(target, file)));
    const label = item.id === 'A02' ? 'a02-final2-browser' : `${item.id.toLowerCase()}-final-browser`;
    const logPath = path.join(target, 'evidence', `${label}.log`);
    const log = fs.existsSync(logPath) ? readText(logPath) : '';
    const counts = {};
    for (const kind of ['passed', 'failed', 'skipped']) {
        const matches = [...log.matchAll(new RegExp(`^\\s*(\\d+) ${kind}(?:\\s|$)`, 'gm'))];
        counts[kind] = matches.length ? Number(matches.at(-1)[1]) : null;
    }
    const notRun = [...log.matchAll(/^\s*(\d+) did not run/gm)];
    counts.notRun = notRun.length ? Number(notRun.at(-1)[1]) : 0;
    const screenshots = evidence.filter(file => file.endsWith('.png') && file.includes(`${label}-results`) && path.basename(path.dirname(file)).includes('away'));
    const chosen = [];
    for (const hint of ['ar-390', 'en-1440']) {
        const file = screenshots.find(candidate => candidate.includes(hint) && !chosen.includes(candidate));
        if (file) chosen.push(file);
    }
    for (const file of screenshots) if (chosen.length < 2 && !chosen.includes(file)) chosen.push(file);
    records.push({ ...item, runtime, label, counts, appIsolation: isolation.find(result => result.item === item.id) || null, report: report ? `branches/${item.id}/${report}` : null,
        images: chosen.map(file => ({ url: `branches/${item.id}/${slash(path.relative(source, file))}`, caption: path.basename(file, '.png').replaceAll('-', ' ') })) });
}
for (const name of ['RUN.md', 'GUARD.md', 'VERIFICATION.md', 'HANDOFF.md', 'LESSONS.md']) {
    const source = path.join(taskRoot, 'repository/docs/away/2026-10-26', name);
    if (fs.existsSync(source)) copyFile(source, path.join(destination, name));
}
const masterDocs = path.join(taskRoot, 'repository/docs/away/2026-10-26');
for (const file of walk(path.join(masterDocs, 'scripts'))) copyFile(file, path.join(destination, path.relative(masterDocs, file)));
const completed = record => record.counts.passed !== null;
const rows = records.map(record => `<tr><th scope="row"><a href="#${record.id}">${record.id}</a></th><td>${escape(record.title)}</td><td><code>${record.code}</code></td><td>${completed(record) ? `${record.counts.passed} pass · ${record.counts.failed || 0} fail · ${record.counts.skipped || 0} skip${record.counts.notRun ? ` · ${record.counts.notRun} not run` : ''}` : 'Broad browser check pending'}</td></tr>`).join('');
const cards = records.map(record => `<section id="${record.id}"><div class="section-head"><p class="eyebrow">${record.id} · independent local branch</p><h2>${escape(record.title)}</h2><p>${escape(record.description)}</p>${record.report ? `<a href="${record.report}">Read the branch result and evidence</a>` : '<p>Branch receipt pending.</p>'}</div><div class="images">${record.images.map(item => `<figure><a href="${item.url}"><img src="${item.url}" alt="${escape(item.caption)}" loading="lazy"></a><figcaption>${escape(item.caption)} · local synthetic account · offline fallback fonts</figcaption></figure>`).join('')}</div></section>`).join('');
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Halastudy — local away review</title><style>
:root{color-scheme:light;--ink:#263532;--paper:#f5f1e9;--line:#d5c9b7;--accent:#8b542c}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui,sans-serif}a{color:#79451f;text-underline-offset:3px}a:focus-visible{outline:3px solid #b67532;outline-offset:5px}header,main,footer{max-width:1180px;margin:auto;padding:32px 24px}header{padding-top:54px}h1{font:500 clamp(30px,5vw,56px)/1.12 Georgia,serif;max-width:900px;margin:12px 0 24px}h2{font:500 30px/1.2 Georgia,serif;margin:6px 0 16px}p{max-width:850px}.eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;font-weight:700}.notice{border-inline-start:4px solid var(--accent);padding:16px 22px;background:#fff9ef}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:670px;margin:24px 0}td,th{padding:12px;text-align:start;border-bottom:1px solid var(--line);vertical-align:top}section{padding:42px 0;border-top:1px solid var(--line);scroll-margin-top:16px}.images{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px;margin-top:28px}figure{margin:0;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:white}figure a{display:block;padding:12px}img{display:block;width:100%;height:390px;object-fit:contain;background:#f4f1eb}figcaption{padding:12px 16px;font-size:13px;border-top:1px solid var(--line)}code{overflow-wrap:anywhere}footer{border-top:1px solid var(--line);font-size:14px}@media(max-width:620px){header,main,footer{padding:24px 16px}.images{grid-template-columns:1fr}img{height:440px}h2{font-size:26px}}
</style><header><p class="eyebrow">Halastudy · 26 October 2026 · local review</p><h1>Recovery that keeps the learner’s place.</h1><p>Seven application corrections and one date-fixture repair, preserved on eight independent branches. The original checkout’s pre-existing edits are protected.</p><div class="notice"><strong>No changes have been released.</strong><p>The dependency audit is still red, the remote reconnect was denied by the away guard, and hosted migration/provider acceptance remains outside this run. Branches have been checked independently; a combined integration has not been tested.</p><p>Browser failures on branches other than A00 include the unchanged expired-date fixture. A00 repairs and verifies that fixture separately. A11’s integration gate retains an unresolved recovery-fixture parse failure; A02 retains its intermittent deadline-control record.</p></div><p><a href="RUN.md">Run receipt</a> · <a href="GUARD.md">Guard decisions</a> · <a href="VERIFICATION.md">Verification matrix</a></p></header><main><div class="table-wrap"><table><caption>Independent branch browser results. Repeated baseline tests are not counted as unique coverage.</caption><thead><tr><th>Item</th><th>Change</th><th>Application/test source</th><th>Latest full browser result</th></tr></thead><tbody>${rows}</tbody></table></div>${cards}</main><footer><p>Images show real local test states with synthetic accounts. External font requests were blocked; these captures do not verify production font delivery or real devices/providers. Open any image for its full size. Complete raw runtime artifacts remain in the dedicated local worktrees.</p></footer></html>`;
fs.mkdirSync(destination, { recursive: true });
const isolationTable = records.filter(record => record.appIsolation).map(record => {
    const result = record.appIsolation;
    const followup = result.remaining ? `; separately executed remainder: ${result.remaining.counts.passed} pass, ${result.remaining.counts.failed} fail` : '';
    return `<li><strong>${record.id}</strong>: ${result.counts.passed} pass, ${result.counts.failed} fail, ${result.counts.notRun} not run${followup}. <a href="branches/${record.id}/evidence/${result.label}.log">Original-assertion rerun log</a></li>`;
}).join('');
const finalHtml = html.replace('<a href="RUN.md">Run receipt</a>', '<a href="HANDOFF.md">Handoff and branch archives</a> &middot; <a href="RUN.md">Run receipt</a>')
    .replace('</table></div>', `</table></div>${isolationTable ? `<aside aria-label="Camera and unexecuted-case follow-up"><h2>Isolated app-suite follow-up</h2><p>The full-suite results above remain unchanged. These separate checks retain the original assertions and show what happened when the affected app group ran alone.</p><ul>${isolationTable}</ul></aside>` : ''}`);
fs.writeFileSync(path.join(destination, 'review.html'), finalHtml);
fs.writeFileSync(path.join(destination, 'review-data.json'), JSON.stringify({ generatedAt: new Date().toISOString(), records }, null, 2));
const files = walk(destination).filter(file => !file.endsWith('package-manifest.json')).map(file => ({
    path: slash(path.relative(destination, file)), bytes: fs.statSync(file).size,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
}));
fs.writeFileSync(path.join(destination, 'package-manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), files }, null, 2));
console.log(JSON.stringify({ destination, files: files.length, images: records.reduce((sum, record) => sum + record.images.length, 0), browserReceipts: records.filter(completed).length }));
