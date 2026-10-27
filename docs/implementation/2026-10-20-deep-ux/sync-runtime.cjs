const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const runtime = 'C:/Users/alkhu/AppData/Local/Temp/halastudy-ux-2026-10-20/candidate';
const directories = ['public', 'services', 'db', 'design-system', 'scripts', 'tests'];
let copied = 0;
const manifest = [];
function copy(relative) {
    const source = path.join(root, relative), target = path.join(runtime, relative);
    const stat = fs.statSync(source);
    if (stat.isDirectory()) { for (const name of fs.readdirSync(source)) copy(path.join(relative, name)); return; }
    const data = fs.readFileSync(source);
    const digest = crypto.createHash('sha256').update(data).digest('hex');
    const same = fs.existsSync(target) && crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') === digest;
    if (!same) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, data); copied++; }
    manifest.push({ path: relative, sha256: digest });
}
for (const name of fs.readdirSync(root)) {
    const file = path.join(root, name);
    if (directories.includes(name) || (fs.statSync(file).isFile() && /\.(html|js|json|webmanifest)$/.test(name) && !name.startsWith('.env'))) copy(name);
}
fs.writeFileSync(path.join(__dirname, 'evidence/runtime-manifest.json'), JSON.stringify({ runtime, copied, files: manifest }, null, 2));
console.log(`Runtime synchronized: ${copied} changed files, ${manifest.length} files verified.`);
